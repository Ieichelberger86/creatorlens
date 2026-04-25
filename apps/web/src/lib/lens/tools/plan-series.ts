import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, LENS_MODEL } from "../client.js";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const planSeriesTool: Anthropic.Tool = {
  name: "plan_series",
  description:
    "Plan a multi-video content series with a throughline + cliffhanger structure. Use when the creator wants to build narrative momentum across days/weeks instead of one-offs. Generates 5-10 video concepts that build on each other, each with a hook + premise + connection to the next.",
  input_schema: {
    type: "object",
    properties: {
      topic: {
        type: "string",
        description: "Series theme or umbrella topic. Required.",
      },
      length: {
        type: "integer",
        description: "How many videos in the series. Default 5.",
        minimum: 3,
        maximum: 12,
      },
      format: {
        type: "string",
        enum: ["daily", "weekly", "build_to_finale"],
        description: "Posting cadence intent. daily = 1/day for 5 days; weekly = 1/week; build_to_finale = pacing toward a payoff at the end.",
      },
    },
    required: ["topic"],
  },
};

export async function planSeriesExecutor(
  input: Record<string, unknown>,
  ctx: { userId: string }
): Promise<string> {
  const { topic, length, format } = input as {
    topic: string;
    length?: number;
    format?: "daily" | "weekly" | "build_to_finale";
  };
  const n = Math.min(Math.max(length ?? 5, 3), 12);
  const cadence = format ?? "build_to_finale";

  const db = supabaseAdmin();
  const { data: profile } = await db
    .from("creator_profile")
    .select("niche, voice_samples, monetization_streams")
    .eq("user_id", ctx.userId)
    .maybeSingle();
  const voiceSamples = ((profile?.voice_samples as string[] | null) ?? []).slice(0, 3);

  const res = await anthropic().messages.create({
    model: LENS_MODEL,
    max_tokens: 2000,
    system: `You plan TikTok content series — multi-video arcs with a throughline that compounds attention. Output a single markdown plan:

# Series: <title>

**Throughline:** <one sentence — what binds the videos and what payoff the viewer is chasing>
**Cadence:** <daily / weekly / build_to_finale>
**Why this works:** <1-2 sentences on the audience hook>

## The arc

### Video 1: <subtitle>
- **Hook:** "<hook in their voice>"
- **Premise:** <1-2 sentences>
- **Cliffhanger to next:** <what unanswered question lands at the end>

### Video 2: ... (same shape)

[continue for ${n} videos]

## Posting plan
- <recommended day-of-week + time slots based on cadence>
- <which videos benefit from a duet/stitch follow-up>
- <where to seed the series in their bio / pinned post>

## What to STOP if it's not working
<2 specific kill criteria — e.g., "if video 1 is below 70% of your median by hour 24, scrap and move on" — opinionated and specific>

Constraints:
- Each hook in the creator's voice (use samples)
- Cliffhangers must be REAL — a viewer who saw video 3 must want video 4
- Each video stands alone for new viewers (don't require backward viewing)
- Total length 400-600 words`,
    messages: [
      {
        role: "user",
        content: `Niche: ${profile?.niche ?? "(unknown)"}
Monetization: ${(profile?.monetization_streams ?? []).join(", ") || "(unknown)"}
Voice samples:
${voiceSamples.length ? voiceSamples.map((v) => `- "${v}"`).join("\n") : "- (warm, direct, creator-native)"}

Series topic: ${topic}
Number of videos: ${n}
Cadence: ${cadence}`,
      },
    ],
  });

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  return text || "(series plan came back empty)";
}
