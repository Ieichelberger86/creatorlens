import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, LENS_MODEL } from "../client.js";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const planLiveShowTool: Anthropic.Tool = {
  name: "plan_live_show",
  description:
    "Build a structured TikTok Live show plan: a focus topic, segmented agenda (15-20 min blocks), a hook bank to keep replaying through the show to retain new joiners, and a props/setup checklist. Use when the creator says 'plan my live', 'help me prep for tonight', or anything live-show-related. Tailor everything to creators monetizing through live_gifts.",
  input_schema: {
    type: "object",
    properties: {
      duration_min: {
        type: "integer",
        description: "Target show length in minutes. Default 90.",
        minimum: 30,
        maximum: 240,
      },
      focus_topic: {
        type: "string",
        description: "Optional theme for the show. If empty, Lens picks based on the creator's niche + recent winners.",
      },
      scheduled_for: {
        type: "string",
        description: "Optional ISO datetime when the live will go up.",
      },
    },
  },
};

export async function planLiveShowExecutor(
  input: Record<string, unknown>,
  ctx: { userId: string }
): Promise<string> {
  const { duration_min, focus_topic, scheduled_for } = input as {
    duration_min?: number;
    focus_topic?: string;
    scheduled_for?: string;
  };
  const targetMin = Math.min(Math.max(duration_min ?? 90, 30), 240);

  const db = supabaseAdmin();
  const { data: profile } = await db
    .from("creator_profile")
    .select("niche, voice_samples, monetization_streams, brand_notes, top_videos")
    .eq("user_id", ctx.userId)
    .maybeSingle();

  const voiceSamples = ((profile?.voice_samples as string[] | null) ?? []).slice(0, 3);
  const niche = profile?.niche ?? "(unknown niche)";

  const res = await anthropic().messages.create({
    model: LENS_MODEL,
    max_tokens: 2000,
    system: `You're Lens planning a TikTok Live show for a creator who monetizes through diamonds/gifts. Output a single valid JSON object — no preamble, no markdown fence:

{
  "focus_topic": string,
  "agenda_summary": string,                 // 1 paragraph, 80-150 words
  "segments": [                             // 4-8 segments, totaling ~${targetMin} min
    {
      "title": string,
      "duration_min": integer,
      "intent": "warm-up" | "main" | "engagement-spike" | "gift-trigger" | "cooldown",
      "talking_points": [string, ...],      // 3-5 concise bullets
      "hooks_to_reuse": [string, ...]       // 2-3 lines from the hook_bank to deploy in this segment
    }
  ],
  "hook_bank": [string, ...],               // 12-15 punchy lines (≤14 words each) the creator replays through the show to grab new joiners. Match their voice.
  "props_checklist": [string, ...],         // physical setup: lighting, mic, props, on-screen elements
  "gift_triggers": [string, ...],           // 3-5 specific moments designed to drive gift bursts (reactions, reveals, gamified bits, shoutouts)
  "summary_markdown": string                // 350-500 word markdown briefing the creator reads before going live
}

Constraints:
- Live shows monetize when viewers stick around. Build cliffhangers between segments.
- Hook bank must be replayable — a viewer who joins in minute 47 still needs a reason to stay.
- Gift triggers must be specific moments, not generic "engage more". Examples: "react to the next gift live", "rank top 3 audience-submitted [thing]", "do the thing if we hit 100 saves".
- Match the creator's voice using the samples below.
- summary_markdown sections: ## Focus / ## Show flow / ## Gift triggers / ## Hook bank / ## Setup checklist`,
    messages: [
      {
        role: "user",
        content: `Niche: ${niche}
Monetization: ${(profile?.monetization_streams ?? []).join(", ") || "(unknown)"}
Target duration: ${targetMin} min
Focus topic: ${focus_topic ?? "(creator's choice — pick a high-engagement angle from their niche)"}
${profile?.brand_notes ? `\nVoice / brand notes:\n${profile.brand_notes}` : ""}
${voiceSamples.length ? `\nSignature lines:\n${voiceSamples.map((v) => `- "${v}"`).join("\n")}` : ""}
${profile?.top_videos ? `\nRecent winners:\n${JSON.stringify(profile.top_videos).slice(0, 800)}` : ""}`,
      },
    ],
  });

  const raw = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  const jsonText = (raw.match(/\{[\s\S]+\}/)?.[0] ?? raw).trim();

  type Plan = {
    focus_topic: string;
    agenda_summary: string;
    segments: Array<{
      title: string;
      duration_min: number;
      intent: string;
      talking_points: string[];
      hooks_to_reuse: string[];
    }>;
    hook_bank: string[];
    props_checklist: string[];
    gift_triggers: string[];
    summary_markdown: string;
  };

  let plan: Plan;
  try {
    plan = JSON.parse(jsonText) as Plan;
  } catch {
    return `Live plan came back unstructured. Raw:\n\n${raw.slice(0, 500)}`;
  }

  // Persist
  const scheduledIso = scheduled_for
    ? (() => {
        const d = new Date(scheduled_for);
        return Number.isNaN(d.getTime()) ? null : d.toISOString();
      })()
    : null;

  const { data: saved } = await db
    .from("live_shows")
    .insert({
      user_id: ctx.userId,
      status: "planned",
      scheduled_for: scheduledIso,
      focus_topic: plan.focus_topic,
      duration_target_min: targetMin,
      segments: plan.segments,
      hook_bank: plan.hook_bank,
      props_checklist: plan.props_checklist,
    })
    .select("id")
    .single();

  const header = `**Saved your live show plan${saved?.id ? ` — id ${saved.id.slice(0, 8)}` : ""}.**\n\n`;
  return header + plan.summary_markdown + "\n\n---\n\nWant me to script the gift-trigger moments out, or pre-write the segment intros?";
}
