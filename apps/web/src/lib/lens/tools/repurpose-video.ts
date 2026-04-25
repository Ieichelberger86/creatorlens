import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, LENS_MODEL } from "../client.js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { scrapeTikTokPost, fetchSubtitleText } from "../apify.js";

export const repurposeVideoTool: Anthropic.Tool = {
  name: "repurpose_video",
  description:
    "Take one of the creator's hits and multiply it: 3 follow-up TikTok scripts that ride the same hook structure, OR an adaptation for IG Reels / YouTube Shorts. Use when the creator says 'how do I follow up on this one', 'turn this into IG content', or wants to capture momentum from a winning video.",
  input_schema: {
    type: "object",
    properties: {
      url: { type: "string", description: "TikTok URL of the video to repurpose. Required." },
      target: {
        type: "string",
        enum: ["follow_ups", "ig_reels", "youtube_shorts"],
        description: "follow_ups = 3 same-format follow-up scripts; ig_reels / youtube_shorts = single adaptation for that platform. Default: follow_ups.",
      },
    },
    required: ["url"],
  },
};

export async function repurposeVideoExecutor(
  input: Record<string, unknown>,
  ctx: { userId: string }
): Promise<string> {
  // Accept both schema-canonical names and common LLM aliases — Lens
  // sometimes calls with `video_url`/`mode` instead of `url`/`target`.
  const aliases = input as Record<string, unknown>;
  const url = (aliases.url ?? aliases.video_url ?? "") as string;
  const target = (aliases.target ?? aliases.mode ?? "follow_ups") as
    | "follow_ups"
    | "ig_reels"
    | "youtube_shorts";
  const mode = target;

  if (!url || !/tiktok\.com\/.+\/video\/\d+/.test(url)) {
    return "Pass a full TikTok video URL.";
  }

  const db = supabaseAdmin();

  // Try cache first; if missing, scrape
  const { data: cached } = await db
    .from("videos")
    .select("transcript, performance")
    .eq("user_id", ctx.userId)
    .eq("tiktok_url", url)
    .maybeSingle();

  let transcript = cached?.transcript ?? null;
  let performance = (cached?.performance as Record<string, unknown> | null) ?? null;

  if (!transcript || !performance) {
    try {
      const post = await scrapeTikTokPost(url);
      if (post) {
        transcript = post.text ?? null;
        const en = (post.videoMeta?.subtitleLinks ?? []).find((s) =>
          (s.language ?? "").toLowerCase().startsWith("en")
        );
        if (en?.downloadLink) {
          const t = await fetchSubtitleText(en.downloadLink);
          if (t) transcript = t;
        }
        performance = {
          views: post.playCount,
          likes: post.diggCount,
          caption: post.text,
        };
      }
    } catch {
      // continue with whatever cache had
    }
  }

  if (!transcript) {
    return "Couldn't get the transcript for this video. Paste the hook + body into chat and we'll repurpose from there.";
  }

  const { data: profile } = await db
    .from("creator_profile")
    .select("niche, voice_samples, monetization_streams")
    .eq("user_id", ctx.userId)
    .maybeSingle();
  const voiceSamples = ((profile?.voice_samples as string[] | null) ?? []).slice(0, 3);

  let prompt: string;
  let systemDirective: string;

  if (mode === "follow_ups") {
    systemDirective = `You write 3 follow-up TikTok scripts that ride the same audience momentum as a hit video. Each follow-up takes a different angle on the same topic so the algorithm reads them as a series, not duplicates.

Output exactly:

## Follow-up 1: [angle name]
**Hook (0-2s):** "<hook>"
**Body (2-25s):**
- <delivery cue> <line>
- <delivery cue> <line>
**CTA:** <line>
**Why this rides the hit:** <1 sentence>

## Follow-up 2: ...

## Follow-up 3: ...

Constraints:
- Each follow-up has a DIFFERENT angle from the hit (e.g. counterargument, deeper-dive, simpler-explainer, opposite-audience, behind-the-scenes)
- Hooks in their voice using the voice samples below
- 25-30 second target each
- No "as I mentioned in my last video" or other backreferences — each video must work standalone for new viewers`;
  } else if (mode === "ig_reels") {
    systemDirective = `You adapt a TikTok hit for Instagram Reels. The platform difference matters:
- IG Reels rewards polished aesthetic over raw — punch up visuals
- IG comment culture is shorter, less debate — keep CTAs lean
- Saves matter way more on IG than TikTok — design for save-ability
- Length sweet-spot: 30-60 seconds for educational, 7-15 for hook moments

Output the adapted script in HOOK / BODY / CTA / VISUALS / NOTES format. End with 1 sentence on what's specifically different from the TikTok original and why.`;
  } else {
    systemDirective = `You adapt a TikTok hit for YouTube Shorts. Differences that matter:
- Shorts viewers skew older, more patient — can extend to 50-60s
- YT search/SEO matters — bake in keywords
- Title is huge on YT (TikTok captions less so) — write a strong searchable title
- Shorts feed pulls from subscribers heavily — a CTA to subscribe lands harder

Output: TITLE / HOOK / BODY / CTA / VISUALS / SUGGESTED CHAPTERS (if longer than 30s) / NOTES.`;
  }

  prompt = `You're Lens. Adapt the creator's hit video below.

Niche: ${profile?.niche ?? "(unknown)"}
Voice samples:
${voiceSamples.length ? voiceSamples.map((v) => `- "${v}"`).join("\n") : "- (write in warm, direct, creator-native tone)"}

Original video URL: ${url}
Stats: ${JSON.stringify(performance ?? {})}
Transcript:
"""
${transcript.slice(0, 2000)}
"""

Mode: ${mode}`;

  const res = await anthropic().messages.create({
    model: LENS_MODEL,
    max_tokens: 1800,
    system: systemDirective,
    messages: [{ role: "user", content: prompt }],
  });

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  return text || "(repurpose came back empty — try again)";
}
