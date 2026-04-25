import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, LENS_MODEL } from "../client.js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { scrapeTikTokPost, fetchSubtitleText } from "../apify.js";

export const cloneCompetitorHookTool: Anthropic.Tool = {
  name: "clone_competitor_hook",
  description:
    "Take a competitor's winning TikTok and write the creator's own version of that hook + format in their voice. Auto-fetches the competitor's transcript + structure, then translates the pattern into something authentic to the creator. Use when the creator says 'someone in my niche just hit big — give me my version', 'remix this hook', or pastes a competitor URL with envy.",
  input_schema: {
    type: "object",
    properties: {
      competitor_url: { type: "string", description: "TikTok URL of the competitor's video. Required." },
      angle: {
        type: "string",
        description: "Optional: how the creator wants to differentiate (e.g. 'flip it to be from the buyer's perspective', 'add my contrarian take').",
      },
    },
    required: ["competitor_url"],
  },
};

export async function cloneCompetitorHookExecutor(
  input: Record<string, unknown>,
  ctx: { userId: string }
): Promise<string> {
  const { competitor_url, angle } = input as { competitor_url: string; angle?: string };

  if (!/tiktok\.com\/.+\/video\/\d+/.test(competitor_url)) {
    return "Pass a full TikTok video URL.";
  }

  const db = supabaseAdmin();

  // Fetch the competitor's video
  let post: Awaited<ReturnType<typeof scrapeTikTokPost>>;
  try {
    post = await scrapeTikTokPost(competitor_url);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Couldn't pull the competitor video (${msg}).`;
  }
  if (!post) {
    return "The video might be private, deleted, or region-locked. Paste the hook + transcript and we can still remix from text.";
  }

  let transcript = post.text ?? "";
  const en = (post.videoMeta?.subtitleLinks ?? []).find((s) =>
    (s.language ?? "").toLowerCase().startsWith("en")
  );
  if (en?.downloadLink) {
    const t = await fetchSubtitleText(en.downloadLink);
    if (t) transcript = t;
  }

  // Persist as a competitor reference
  await db.from("videos").upsert(
    {
      user_id: ctx.userId,
      tiktok_url: competitor_url,
      tiktok_id: post.id ?? null,
      is_own: false,
      transcript: transcript || null,
      performance: {
        views: post.playCount ?? null,
        likes: post.diggCount ?? null,
        comments: post.commentCount ?? null,
        author: post.authorMeta?.name ?? null,
        caption: post.text ?? null,
        duration_sec: post.videoMeta?.duration ?? null,
      },
      analyzed_at: new Date().toISOString(),
    },
    { onConflict: "user_id,tiktok_url" }
  );

  // Pull creator profile
  const { data: profile } = await db
    .from("creator_profile")
    .select("niche, voice_samples, monetization_streams")
    .eq("user_id", ctx.userId)
    .maybeSingle();
  const voiceSamples = ((profile?.voice_samples as string[] | null) ?? []).slice(0, 3);

  const res = await anthropic().messages.create({
    model: LENS_MODEL,
    max_tokens: 1500,
    system: `You write the creator's own version of a competitor's winning TikTok hook + format. The output is NOT a copy — it's a translation of the pattern into the creator's voice and angle.

Output exactly:

## What made theirs work
<2-3 sentences on the structural pattern: hook style, body cadence, payoff — what's actually transferable, separated from anything specific to the competitor's persona/topic>

## Your version
**Hook (0-2s):** "<your hook in your voice, same pattern but your angle>"
**Body (2-25s):**
- <delivery cue> <line>
- <delivery cue> <line>
- <delivery cue> <line>
**CTA:** <line>

## Why this lands for YOU
<1-2 sentences on why this hook structure fits YOUR niche / voice / monetization stream specifically>

## Want to take it further?
<one sentence offering 2-3 angles to remix from this same pattern>

Constraints:
- Hook MUST mirror the structural pattern (curiosity gap, contrarian claim, payoff cliffhanger, etc.) but with the creator's topic + voice
- Never copy phrasing verbatim. Same shape, different content
- Match the creator's voice using the samples below`,
    messages: [
      {
        role: "user",
        content: `Creator niche: ${profile?.niche ?? "(unknown)"}
Voice samples:
${voiceSamples.length ? voiceSamples.map((v) => `- "${v}"`).join("\n") : "- (warm, direct, creator-native tone)"}
Monetization: ${(profile?.monetization_streams ?? []).join(", ") || "(unknown)"}

Differentiation angle (creator-specified): ${angle ?? "(none — pick the smartest natural angle)"}

COMPETITOR VIDEO:
- URL: ${competitor_url}
- Author: @${post.authorMeta?.name ?? "?"}
- Views: ${(post.playCount ?? 0).toLocaleString()}
- Likes: ${(post.diggCount ?? 0).toLocaleString()}
- Caption: ${post.text?.slice(0, 200) ?? "(none)"}
- Transcript:
"""
${transcript.slice(0, 1500) || "(no transcript available)"}
"""`,
      },
    ],
  });

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  return text || "(remix came back empty — try with a clearer competitor video)";
}
