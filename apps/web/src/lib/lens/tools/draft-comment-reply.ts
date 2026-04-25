import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, LENS_MODEL } from "../client.js";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const draftCommentReplyTool: Anthropic.Tool = {
  name: "draft_comment_reply",
  description:
    "Draft a reply to a specific comment that drives further engagement OR converts a buying-intent comment into a DM/lead. Use when the creator pastes a comment and asks 'what do I say', 'this looks like a lead', or wants help managing their replies. Returns 2-3 reply variants with intent labels.",
  input_schema: {
    type: "object",
    properties: {
      comment_text: { type: "string", description: "The comment, verbatim. Required." },
      video_context: {
        type: "string",
        description: "What the original video was about (hook or short summary).",
      },
      goal: {
        type: "string",
        enum: ["drive_engagement", "convert_to_dm", "convert_to_save", "deflect_negativity"],
        description: "What the reply should accomplish. Default depends on creator's monetization streams.",
      },
    },
    required: ["comment_text"],
  },
};

export async function draftCommentReplyExecutor(
  input: Record<string, unknown>,
  ctx: { userId: string }
): Promise<string> {
  const { comment_text, video_context, goal } = input as {
    comment_text: string;
    video_context?: string;
    goal?: string;
  };

  const db = supabaseAdmin();
  const { data: profile } = await db
    .from("creator_profile")
    .select("niche, voice_samples, monetization_streams")
    .eq("user_id", ctx.userId)
    .maybeSingle();
  const voiceSamples = ((profile?.voice_samples as string[] | null) ?? []).slice(0, 3);
  const streams = (profile?.monetization_streams as string[] | null) ?? [];

  // Pick a sensible default goal based on the creator's primary monetization stream
  const inferredGoal =
    goal ??
    (streams.includes("lead_gen") || streams.includes("info_product")
      ? "convert_to_dm"
      : streams.includes("brand_deals") || streams.includes("creator_rewards")
        ? "drive_engagement"
        : streams.includes("tiktok_shop_seller") || streams.includes("tiktok_shop_affiliate")
          ? "convert_to_save"
          : "drive_engagement");

  const res = await anthropic().messages.create({
    model: LENS_MODEL,
    max_tokens: 800,
    system: `You draft TikTok comment replies. Output exactly 3 reply variants in this format:

## Reply 1 — <intent label>
"<reply text>"
*Why this works: <1 sentence>*

## Reply 2 — <intent label>
"<reply text>"
*Why this works: <1 sentence>*

## Reply 3 — <intent label, optional curveball>
"<reply text>"
*Why this works: <1 sentence>*

Constraints:
- Replies must be in the creator's voice using the samples
- TikTok comment culture: short (≤2 sentences each), conversational, often punchy or playful
- For "drive_engagement": ask a follow-up question that triggers more replies
- For "convert_to_dm": acknowledge the comment + cleanly hand off to DMs without sounding salesy ("DM me 'Y' and I'll send you X")
- For "convert_to_save": redirect to a save trigger ("save this for the next time you Z")
- For "deflect_negativity": confident, brief, never argumentative
- Each variant must have a different angle — not 3 paraphrases of the same reply

If the comment is clearly buying-intent (asking how to work with the creator, requesting more info, asking for a recommendation), at least one variant must be DM-conversion regardless of goal.

If the comment is hostile/troll, only output replies that defuse — never escalate.`,
    messages: [
      {
        role: "user",
        content: `Niche: ${profile?.niche ?? "(unknown)"}
Monetization streams: ${streams.join(", ") || "(unknown)"}
Voice samples:
${voiceSamples.length ? voiceSamples.map((v) => `- "${v}"`).join("\n") : "- (warm, direct, creator-native)"}

Goal: ${inferredGoal}
${video_context ? `Original video context: ${video_context}` : ""}

The comment to reply to:
"${comment_text}"`,
      },
    ],
  });

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  return text || "(reply variants came back empty — try with a more specific comment)";
}
