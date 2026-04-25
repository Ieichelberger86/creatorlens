import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, LENS_MODEL } from "../client.js";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const recordLiveRecapTool: Anthropic.Tool = {
  name: "record_live_recap",
  description:
    "After a TikTok Live ends, record the stats and run a sharp post-mortem: what worked in the show, what to change, projected diamond pace, what to plan next. The creator pastes peak viewers + diamonds + gift breakdown + their own notes; Lens analyzes against their rolling baseline. Use when the creator says 'recap my live', 'how did the show go', or shares post-live stats.",
  input_schema: {
    type: "object",
    properties: {
      duration_min: { type: "integer", description: "Total live duration in minutes." },
      peak_viewers: { type: "integer" },
      total_unique_viewers: { type: "integer" },
      diamonds: { type: "integer", description: "Total diamonds earned this show." },
      top_gifts: {
        type: "array",
        description: "Optional: list of top gifts received with sender + diamond value.",
        items: {
          type: "object",
          properties: {
            from: { type: "string" },
            gift: { type: "string" },
            diamonds: { type: "integer" },
          },
        },
      },
      notes: {
        type: "string",
        description: "Creator's own notes — what felt good, what flopped, key moments.",
      },
      live_show_id: {
        type: "string",
        description: "Optional UUID of an existing planned live_shows row to attach this recap to.",
      },
    },
    required: ["duration_min"],
  },
};

export async function recordLiveRecapExecutor(
  input: Record<string, unknown>,
  ctx: { userId: string }
): Promise<string> {
  const {
    duration_min,
    peak_viewers,
    total_unique_viewers,
    diamonds,
    top_gifts,
    notes,
    live_show_id,
  } = input as {
    duration_min: number;
    peak_viewers?: number;
    total_unique_viewers?: number;
    diamonds?: number;
    top_gifts?: Array<{ from?: string; gift?: string; diamonds?: number }>;
    notes?: string;
    live_show_id?: string;
  };

  const db = supabaseAdmin();

  // Pull rolling 30-day live baseline
  const since = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();
  const { data: priorLives } = await db
    .from("live_shows")
    .select("duration_min, peak_viewers, diamonds")
    .eq("user_id", ctx.userId)
    .eq("status", "ended")
    .gte("ended_at", since)
    .order("ended_at", { ascending: false })
    .limit(20);

  const baselineLives = priorLives ?? [];
  const baselineDiamondsPerHour = baselineLives.length
    ? baselineLives
        .filter((l) => l.duration_min && l.diamonds)
        .map((l) => ((l.diamonds ?? 0) / (l.duration_min ?? 1)) * 60)
        .reduce((s, n, _, arr) => s + n / arr.length, 0)
    : 0;
  const thisDiamondsPerHour =
    diamonds && duration_min ? (diamonds / duration_min) * 60 : 0;
  const vsBaseline = baselineDiamondsPerHour
    ? +(thisDiamondsPerHour / baselineDiamondsPerHour).toFixed(2)
    : null;

  // Run the analysis
  const res = await anthropic().messages.create({
    model: LENS_MODEL,
    max_tokens: 1200,
    system: `You're Lens running a post-live recap for a creator who monetizes through TikTok Live diamonds.

CRITICAL OUTPUT RULES (failure to follow these breaks the system):
- Begin your response with "{" and end with "}". Nothing before, nothing after.
- Do NOT wrap in \`\`\`json or any code fence.
- Do NOT include any preamble or commentary outside the JSON.
- The first character of your response must be "{".

Output schema:

{
  "verdict": "breakout" | "above_baseline" | "on_baseline" | "below_baseline" | "too_thin_to_call",
  "ai_recap": string,                       // 250-400 word markdown post-mortem
  "ai_next_show": string                    // 100-200 word concrete plan for next show
}

ai_recap format:
## Verdict: <one-line call with diamonds-per-hour comparison>

### What worked
- 2-3 specific bullets citing peak viewers, gift moments, retention signals

### What didn't
- 1-2 specific bullets — drop-off points, missed gift opportunities, pacing issues

### Diamond pace
<sentence comparing this show's $/hour to baseline; project monthly run-rate at this pace>

### What to change next show
<2-3 specific tactical adjustments — segment timing, gift trigger placement, hook bank gaps>

ai_next_show: prescribe the next show's focus topic + the one tactical change that has the biggest leverage. No hedging.

Constraints:
- Cite specific numbers throughout (diamonds, viewers, percentages, time)
- If sample size <3 prior lives, acknowledge baseline is thin
- Never recommend "stream more" or other generic advice — be specific to THIS show`,
    messages: [
      {
        role: "user",
        content: `THIS SHOW:
- Duration: ${duration_min} min
- Peak viewers: ${peak_viewers ?? "?"}
- Unique viewers: ${total_unique_viewers ?? "?"}
- Diamonds: ${diamonds ?? "?"}
- Diamonds/hour: ${thisDiamondsPerHour.toFixed(0)}
${top_gifts && top_gifts.length ? `- Top gifts:\n${top_gifts.slice(0, 5).map((g) => `  · ${g.from ?? "?"}: ${g.gift ?? "?"} (${g.diamonds ?? "?"} diamonds)`).join("\n")}` : ""}
${notes ? `\nCreator's own notes:\n"${notes}"` : ""}

BASELINE (rolling 30 days, ${baselineLives.length} prior lives):
- Diamonds/hour avg: ${baselineDiamondsPerHour.toFixed(0)}
- vs baseline ratio: ${vsBaseline ?? "n/a"}`,
      },
    ],
  });

  const raw = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  // Strip ```json / ``` fences, find outermost JSON object
  const fenced = raw.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  const candidate = (fenced?.[1] ?? raw).trim();
  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");
  const jsonText =
    firstBrace !== -1 && lastBrace > firstBrace
      ? candidate.slice(firstBrace, lastBrace + 1)
      : candidate;

  let analysis: { verdict: string; ai_recap: string; ai_next_show: string };
  try {
    analysis = JSON.parse(jsonText);
  } catch {
    // Last-resort: surface what we got, stripped of fences
    const cleaned = raw.replace(/```(?:json)?/g, "").replace(/```/g, "").trim();
    return `**Live recap (couldn't structure all fields):**\n\n${cleaned}`;
  }

  // Save / update
  const recapPayload = {
    user_id: ctx.userId,
    status: "ended" as const,
    started_at: new Date(Date.now() - duration_min * 60_000).toISOString(),
    ended_at: new Date().toISOString(),
    duration_min,
    peak_viewers: peak_viewers ?? null,
    total_unique_viewers: total_unique_viewers ?? null,
    diamonds: diamonds ?? null,
    top_gifts: top_gifts ?? [],
    creator_notes: notes ?? null,
    ai_recap: analysis.ai_recap,
    ai_next_show: analysis.ai_next_show,
  };

  if (live_show_id) {
    await db.from("live_shows").update(recapPayload).eq("id", live_show_id).eq("user_id", ctx.userId);
  } else {
    await db.from("live_shows").insert(recapPayload);
  }

  return `${analysis.ai_recap}\n\n---\n\n### Next show\n\n${analysis.ai_next_show}`;
}
