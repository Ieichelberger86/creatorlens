import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, LENS_MODEL } from "../client.js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { scrapeTikTokPost, fetchSubtitleText } from "../apify.js";

export const postMortemTool: Anthropic.Tool = {
  name: "post_mortem",
  description:
    "After the creator posts a video, run a focused post-mortem: pull the latest stats, compare them to the creator's own baseline (median + top performer), and write a sharp take on what worked, what didn't, and exactly what to try next. Use whenever the creator shares a video they posted recently and wants honest analysis.",
  input_schema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "TikTok URL of the creator's posted video.",
      },
      hours_old: {
        type: "integer",
        description:
          "Optional: hours since the video was posted, if known. Helps calibrate whether numbers are still climbing.",
      },
      notes: {
        type: "string",
        description:
          "Optional context — what the creator was trying, anything they want a take on specifically.",
      },
    },
    required: ["url"],
  },
};

export async function postMortemExecutor(
  input: Record<string, unknown>,
  ctx: { userId: string }
): Promise<string> {
  const { url, hours_old, notes } = input as {
    url: string;
    hours_old?: number;
    notes?: string;
  };

  if (!/tiktok\.com\/.+\/video\/\d+/.test(url)) {
    return "That URL doesn't look like a TikTok video link. Pass the full URL like https://www.tiktok.com/@handle/video/1234567890.";
  }

  const db = supabaseAdmin();

  // Always re-scrape on post_mortem — stats change quickly after posting
  let post: Awaited<ReturnType<typeof scrapeTikTokPost>>;
  try {
    post = await scrapeTikTokPost(url);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Scraper hiccup (${msg}). Ask the creator to paste current views/likes/comments and we'll do the post-mortem from those.`;
  }

  if (!post) {
    return `Couldn't pull this video — it might be private, deleted, or region-locked. Ask the creator for current stats.`;
  }

  // Pull transcript if we have it
  let transcript: string | null = post.text ?? null;
  const en = (post.videoMeta?.subtitleLinks ?? []).find((s) =>
    (s.language ?? "").toLowerCase().startsWith("en")
  );
  if (en?.downloadLink) {
    const t = await fetchSubtitleText(en.downloadLink);
    if (t) transcript = t;
  }

  // Persist updated stats so the videos table stays current
  const performance = {
    views: post.playCount ?? null,
    likes: post.diggCount ?? null,
    comments: post.commentCount ?? null,
    shares: post.shareCount ?? null,
    saves: post.collectCount ?? null,
    duration_sec: post.videoMeta?.duration ?? null,
    posted_at: post.createTimeISO ?? null,
    author: post.authorMeta?.name ?? null,
    music: post.musicMeta?.musicName ?? null,
    hashtags: (post.hashtags ?? []).map((h) => h.name).filter(Boolean),
    caption: post.text ?? null,
  };
  await db.from("videos").upsert(
    {
      user_id: ctx.userId,
      tiktok_url: url,
      tiktok_id: post.id ?? null,
      is_own: true,
      transcript,
      performance,
      analyzed_at: new Date().toISOString(),
    },
    { onConflict: "user_id,tiktok_url" }
  );

  // Pull creator's own video baseline (excluding this one)
  const { data: ownVideos } = await db
    .from("videos")
    .select("tiktok_url, performance, transcript")
    .eq("user_id", ctx.userId)
    .eq("is_own", true)
    .neq("tiktok_url", url)
    .order("analyzed_at", { ascending: false })
    .limit(50);

  const otherViews = (ownVideos ?? [])
    .map((v) => (v.performance as Record<string, unknown>)?.views)
    .filter((n): n is number => typeof n === "number" && n > 0);
  const median = otherViews.length
    ? [...otherViews].sort((a, b) => a - b)[Math.floor(otherViews.length / 2)]
    : null;
  const max = otherViews.length ? Math.max(...otherViews) : null;
  const avg = otherViews.length
    ? Math.round(otherViews.reduce((s, n) => s + n, 0) / otherViews.length)
    : null;

  const thisViews = post.playCount ?? 0;
  const vsMedian = median ? +(thisViews / median).toFixed(2) : null;
  const vsMax = max ? +(thisViews / max).toFixed(2) : null;

  const prompt = {
    url,
    posted_at: post.createTimeISO,
    hours_old: hours_old ?? null,
    duration_sec: post.videoMeta?.duration,
    stats: {
      views: post.playCount,
      likes: post.diggCount,
      comments: post.commentCount,
      shares: post.shareCount,
      saves: post.collectCount,
      like_rate: post.playCount
        ? +((post.diggCount ?? 0) / post.playCount * 100).toFixed(2)
        : null,
      comment_rate: post.playCount
        ? +((post.commentCount ?? 0) / post.playCount * 100).toFixed(2)
        : null,
      save_rate: post.playCount
        ? +((post.collectCount ?? 0) / post.playCount * 100).toFixed(2)
        : null,
    },
    baseline: {
      sample_size: otherViews.length,
      median_views: median,
      avg_views: avg,
      top_views: max,
    },
    vs_baseline: {
      vs_median: vsMedian, // 1.0 = on baseline; 2.0 = 2x baseline
      vs_top: vsMax,
    },
    hashtags: (post.hashtags ?? []).map((h) => h.name).filter(Boolean),
    music: post.musicMeta?.musicName,
    caption: post.text,
    transcript_preview: transcript ? transcript.slice(0, 600) : null,
    creator_notes: notes ?? null,
  };

  const res = await anthropic().messages.create({
    model: LENS_MODEL,
    max_tokens: 800,
    system: `You're Lens running a post-mortem on a video the creator just posted. Read the data and write a sharp, honest take in this format:

VERDICT (one line)
<one-sentence call: hit, baseline, miss, or too-early-to-tell>

WHAT WORKED
- <2-3 specific, data-backed observations. Cite numbers.>

WHAT DIDN'T
- <1-2 specific weaknesses. Cite numbers when possible.>

WHAT TO TRY NEXT
- <1-2 concrete experiments — exact next-video angle, hook tweak, or format swap. Be specific enough they could shoot tomorrow.>

Constraints:
- Numbers > vibes. Always. If something is 2.4x baseline say so. If like-rate is 4.1% say so.
- No hedging language. No "consider trying" — say "try this exactly".
- If sample size is < 5 prior videos, acknowledge the baseline is thin.
- If the video is < 24h old, note that numbers are still climbing.
- Total length: 100-160 words. Prose with the section headers above.

No preamble, no caveats outside the format. Just the post-mortem.`,
    messages: [{ role: "user", content: JSON.stringify(prompt, null, 2) }],
  });

  const analysis =
    res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim() || "(post-mortem came back empty — try again with more context)";

  // Light header so Lens knows the call was successful + has structured numbers to riff on
  const header = `Post-mortem on ${url} — ${post.playCount?.toLocaleString() ?? "?"} views${
    vsMedian ? ` (${vsMedian}x your median of ${median?.toLocaleString()})` : ""
  }\n\n`;

  return header + analysis;
}
