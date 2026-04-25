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

// Anthropic tool_use schema — guarantees structured output (the model fills
// the tool input directly instead of stringifying JSON in a text block).
const STRUCTURED_OUTPUT_TOOL: Anthropic.Tool = {
  name: "save_live_plan",
  description: "Save the structured live show plan back to the system.",
  input_schema: {
    type: "object",
    properties: {
      focus_topic: { type: "string" },
      agenda_summary: { type: "string", description: "1 paragraph, 80-150 words" },
      segments: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            duration_min: { type: "integer" },
            intent: {
              type: "string",
              enum: ["warm-up", "main", "engagement-spike", "gift-trigger", "cooldown"],
            },
            talking_points: { type: "array", items: { type: "string" } },
            hooks_to_reuse: { type: "array", items: { type: "string" } },
          },
          required: ["title", "duration_min", "intent", "talking_points", "hooks_to_reuse"],
        },
        minItems: 4,
        maxItems: 8,
      },
      hook_bank: {
        type: "array",
        items: { type: "string" },
        minItems: 10,
        maxItems: 18,
        description: "12-15 punchy lines (≤14 words each) the creator replays through the show.",
      },
      props_checklist: { type: "array", items: { type: "string" } },
      gift_triggers: {
        type: "array",
        items: { type: "string" },
        minItems: 3,
        description: "3-5 specific moments designed to drive gift bursts.",
      },
      summary_markdown: {
        type: "string",
        description: "350-500 word markdown briefing the creator reads before going live. Sections: ## Focus / ## Show flow / ## Gift triggers / ## Hook bank / ## Setup checklist",
      },
    },
    required: [
      "focus_topic",
      "agenda_summary",
      "segments",
      "hook_bank",
      "props_checklist",
      "gift_triggers",
      "summary_markdown",
    ],
  },
};

type LivePlan = {
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
    max_tokens: 2500,
    tools: [STRUCTURED_OUTPUT_TOOL],
    tool_choice: { type: "tool", name: "save_live_plan" },
    system: `You're Lens planning a TikTok Live show for a creator who monetizes through diamonds/gifts.

Constraints:
- Live shows monetize when viewers stick around. Build cliffhangers between segments.
- Hook bank must be replayable — a viewer who joins in minute 47 still needs a reason to stay.
- Gift triggers must be specific moments, not generic "engage more". Examples: "react to the next gift live", "rank top 3 audience-submitted [thing]", "do the thing if we hit 100 saves".
- Match the creator's voice using the samples below.
- Segments should total approximately ${targetMin} minutes.
- summary_markdown sections: ## Focus / ## Show flow / ## Gift triggers / ## Hook bank / ## Setup checklist

Call save_live_plan with the structured plan.`,
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

  // Extract the tool_use block — guaranteed-structured output
  const toolUse = res.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "save_live_plan"
  );

  if (!toolUse) {
    return "Couldn't generate a structured live plan. Try again or paste your show goals.";
  }

  const plan = toolUse.input as LivePlan;

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
