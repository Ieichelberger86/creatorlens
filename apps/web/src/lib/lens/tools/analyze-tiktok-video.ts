import type Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { scrapeTikTokPost, fetchSubtitleText } from "../apify.js";

export const analyzeTiktokVideoTool: Anthropic.Tool = {
  name: "analyze_tiktok_video",
  description:
    "Pull transcript, view/like/comment counts, hashtags, music, and author info for any TikTok video. Pass the URL and Lens auto-fetches everything via Apify, persists to the videos table, and returns a structured summary you can reference immediately. Use this whenever the creator pastes or mentions a TikTok URL — their own or a competitor's.",
  input_schema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "Full TikTok video URL, e.g. https://www.tiktok.com/@handle/video/1234567890123",
      },
      is_own: {
        type: "boolean",
        description:
          "True if this is the creator's own video. False if it's a competitor or inspiration.",
      },
      notes: {
        type: "string",
        description:
          "Optional context from the creator (what they were trying, what they noticed, etc.).",
      },
    },
    required: ["url", "is_own"],
  },
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export async function analyzeTiktokVideoExecutor(
  input: Record<string, unknown>,
  ctx: { userId: string }
): Promise<string> {
  const { url, is_own, notes } = input as {
    url: string;
    is_own: boolean;
    notes?: string;
  };

  if (!/tiktok\.com\/.+\/video\/\d+/.test(url)) {
    return "That URL doesn't look like a TikTok video link. Pass the full URL like https://www.tiktok.com/@handle/video/1234567890.";
  }

  const db = supabaseAdmin();

  // 24h cache: if we already analyzed this URL recently, return that
  const { data: cached } = await db
    .from("videos")
    .select("id, transcript, performance, analyzed_at, is_own")
    .eq("user_id", ctx.userId)
    .eq("tiktok_url", url)
    .maybeSingle();

  if (cached?.analyzed_at) {
    const age = Date.now() - new Date(cached.analyzed_at).getTime();
    if (age < ONE_DAY_MS) {
      return formatSummary({
        url,
        cached: true,
        is_own: cached.is_own,
        transcript: cached.transcript,
        performance: cached.performance as Record<string, unknown>,
      });
    }
  }

  // Live scrape
  let post: Awaited<ReturnType<typeof scrapeTikTokPost>>;
  try {
    post = await scrapeTikTokPost(url);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Couldn't reach the scraper (${msg}). Tell the creator you'll need them to paste the transcript + view/like counts manually for now.`;
  }

  if (!post) {
    return `The scraper couldn't pull this video (it might be private, deleted, or region-locked). Ask the creator to paste the transcript and any stats they have.`;
  }

  // Pull a transcript if available
  let transcript: string | null = post.text ?? null;
  const subtitleEn = (post.videoMeta?.subtitleLinks ?? []).find(
    (s) => (s.language ?? "").toLowerCase().startsWith("en")
  );
  if (subtitleEn?.downloadLink) {
    const fetched = await fetchSubtitleText(subtitleEn.downloadLink);
    if (fetched) transcript = fetched;
  }

  const performance: Record<string, unknown> = {
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
  if (notes) performance.notes = notes;

  // Upsert into videos table
  await db.from("videos").upsert(
    {
      user_id: ctx.userId,
      tiktok_url: url,
      tiktok_id: post.id ?? null,
      is_own: !!is_own,
      transcript,
      performance,
      analyzed_at: new Date().toISOString(),
    },
    { onConflict: "user_id,tiktok_url" }
  );

  return formatSummary({
    url,
    cached: false,
    is_own: !!is_own,
    transcript,
    performance,
  });
}

function formatSummary(args: {
  url: string;
  cached: boolean;
  is_own: boolean;
  transcript: string | null;
  performance: Record<string, unknown>;
}): string {
  const { url, cached, is_own, transcript, performance } = args;
  const v = (k: string) => performance[k];
  const fmt = (n: unknown) =>
    typeof n === "number" ? n.toLocaleString() : "?";

  const lines: string[] = [];
  lines.push(`Video: ${url}`);
  lines.push(`Source: ${is_own ? "creator's own" : "competitor / inspiration"}${cached ? " (cached, <24h old)" : ""}`);
  if (v("author")) lines.push(`Author: @${v("author")}`);
  if (v("posted_at")) lines.push(`Posted: ${v("posted_at")}`);
  if (typeof v("duration_sec") === "number") lines.push(`Duration: ${v("duration_sec")}s`);
  lines.push("");
  lines.push("Performance:");
  lines.push(`  views=${fmt(v("views"))} likes=${fmt(v("likes"))} comments=${fmt(v("comments"))} shares=${fmt(v("shares"))} saves=${fmt(v("saves"))}`);
  const tags = v("hashtags");
  if (Array.isArray(tags) && tags.length) {
    lines.push(`  hashtags: ${tags.map((t) => `#${t}`).join(" ")}`);
  }
  if (v("music")) lines.push(`  music: ${v("music")}`);
  lines.push("");
  if (v("caption")) {
    lines.push(`Caption: ${String(v("caption")).slice(0, 300)}`);
    lines.push("");
  }
  lines.push("Transcript:");
  if (transcript) {
    lines.push(transcript.length > 2400 ? transcript.slice(0, 2400) + "…" : transcript);
  } else {
    lines.push("(no transcript available — video has no captions or audio is silent)");
  }
  return lines.join("\n");
}
