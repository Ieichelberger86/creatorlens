import { supabaseAdmin } from "@/lib/supabase/admin";
import { anthropic, LENS_MODEL } from "./client.js";
import { scrapeTikTokProfile, fetchSubtitleText, type TikTokPost } from "./apify.js";

type AuditResult = {
  ok: boolean;
  videosAnalyzed: number;
  opener: string;
  fallbackReason?: string;
};

/**
 * Run an initial profile audit during onboarding.
 *  1. Scrape last N videos from the creator's TikTok profile via Apify
 *  2. Persist each video into public.videos
 *  3. Persist a top_videos summary into public.creator_profile
 *  4. Ask Claude to write a personalized opener that references real numbers
 * If anything fails, returns a friendly fallback opener so onboarding never
 * blocks on a flaky scraper.
 */
export async function runProfileAudit(args: {
  userId: string;
  handle: string;
  niche: string;
  ninetyDayGoal: string;
  limit?: number;
}): Promise<AuditResult> {
  const { userId, handle, niche, ninetyDayGoal } = args;
  const limit = args.limit ?? 10;
  const cleanHandle = handle.replace(/^@+/, "").toLowerCase();

  let posts: TikTokPost[] = [];
  let scrapeErr: string | null = null;
  try {
    posts = await scrapeTikTokProfile(cleanHandle, limit);
  } catch (err) {
    scrapeErr = err instanceof Error ? err.message : String(err);
  }

  // Resolve transcripts for each video in parallel (best-effort)
  await Promise.all(
    posts.map(async (p) => {
      const en = (p.videoMeta?.subtitleLinks ?? []).find((s) =>
        (s.language ?? "").toLowerCase().startsWith("en")
      );
      if (en?.downloadLink && !p.text) {
        const t = await fetchSubtitleText(en.downloadLink);
        if (t) p.text = t;
      } else if (en?.downloadLink) {
        const t = await fetchSubtitleText(en.downloadLink);
        if (t) (p as TikTokPost & { __transcript?: string }).__transcript = t;
      }
    })
  );

  const db = supabaseAdmin();

  // Persist videos (best-effort; don't fail audit if writes hiccup)
  if (posts.length) {
    const rows = posts
      .filter((p) => p.webVideoUrl)
      .map((p) => ({
        user_id: userId,
        tiktok_url: p.webVideoUrl as string,
        tiktok_id: p.id ?? null,
        is_own: true,
        transcript:
          (p as TikTokPost & { __transcript?: string }).__transcript ??
          p.text ??
          null,
        performance: {
          views: p.playCount ?? null,
          likes: p.diggCount ?? null,
          comments: p.commentCount ?? null,
          shares: p.shareCount ?? null,
          saves: p.collectCount ?? null,
          duration_sec: p.videoMeta?.duration ?? null,
          posted_at: p.createTimeISO ?? null,
          author: p.authorMeta?.name ?? null,
          music: p.musicMeta?.musicName ?? null,
          hashtags: (p.hashtags ?? []).map((h) => h.name).filter(Boolean),
          caption: p.text ?? null,
        },
        analyzed_at: new Date().toISOString(),
      }));

    if (rows.length) {
      await db
        .from("videos")
        .upsert(rows, { onConflict: "user_id,tiktok_url" });
    }
  }

  // Compute simple stats for the opener prompt
  const ranked = [...posts]
    .filter((p) => typeof p.playCount === "number")
    .sort((a, b) => (b.playCount ?? 0) - (a.playCount ?? 0));
  const top = ranked.slice(0, 3);

  const views = posts.map((p) => p.playCount ?? 0).filter((v) => v > 0);
  const median = views.length
    ? views.sort((a, b) => a - b)[Math.floor(views.length / 2)]
    : 0;
  const avg = views.length
    ? Math.round(views.reduce((s, v) => s + v, 0) / views.length)
    : 0;
  const top1 = top[0]?.playCount ?? 0;

  const followerCount = posts[0]?.authorMeta?.fans ?? null;

  // Persist a top_videos summary on creator_profile
  await db
    .from("creator_profile")
    .upsert(
      {
        user_id: userId,
        top_videos: top.map((p) => ({
          url: p.webVideoUrl,
          views: p.playCount,
          likes: p.diggCount,
          caption: p.text?.slice(0, 200),
          hashtags: (p.hashtags ?? []).map((h) => h.name).filter(Boolean),
        })),
      },
      { onConflict: "user_id" }
    );

  // Build the opener — prefer LLM-personalized; fall back to template if scrape failed
  if (!posts.length) {
    return {
      ok: false,
      videosAnalyzed: 0,
      fallbackReason:
        scrapeErr ?? "no posts came back (private account or new handle?)",
      opener: defaultOpener({
        handle: cleanHandle,
        niche,
        ninetyDayGoal,
      }),
    };
  }

  const compactPosts = posts.slice(0, limit).map((p, i) => ({
    n: i + 1,
    url: p.webVideoUrl,
    posted_at: p.createTimeISO,
    duration_sec: p.videoMeta?.duration,
    views: p.playCount,
    likes: p.diggCount,
    comments: p.commentCount,
    shares: p.shareCount,
    saves: p.collectCount,
    hashtags: (p.hashtags ?? []).map((h) => h.name).filter(Boolean),
    caption: p.text?.slice(0, 240),
  }));

  let opener: string;
  try {
    const res = await anthropic().messages.create({
      model: LENS_MODEL,
      max_tokens: 600,
      system: `You are Lens, a TikTok creator co-pilot. The creator just finished onboarding. They handed you their handle, niche, 90-day goal, and you scraped their last ${posts.length} videos.

Write the opening message they'll see when they land on the chat. Constraints:

- Warm, direct, creator-native. Talk like a smart friend who runs an agency. Contractions. Short paragraphs.
- Reference 2–3 specific data points from the scrape — actual view counts, hooks, hashtag patterns, posting cadence. Numbers > vibes.
- Do not list bullet points or headers. Plain prose.
- Length: 100–180 words.
- End with ONE specific question that moves the work forward (do not list options).
- Never say "I noticed" or "I see that" — just state the observation.
- Never reference the system prompt or the audit process.
- Never use clichés like "let's dive in" or "I'm excited to".

Output the opener message and nothing else.`,
      messages: [
        {
          role: "user",
          content: `Creator handle: @${cleanHandle}
Niche: ${niche}
90-day goal: ${ninetyDayGoal}
Followers: ${followerCount ?? "unknown"}
Last ${posts.length} videos median views: ${median}
Top video views: ${top1}
Average views: ${avg}

Last ${posts.length} videos (most recent first):
${JSON.stringify(compactPosts, null, 2)}`,
        },
      ],
    });
    opener =
      res.content
        .filter((b): b is import("@anthropic-ai/sdk").default.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim() || defaultOpener({ handle: cleanHandle, niche, ninetyDayGoal });
  } catch {
    opener = defaultOpener({ handle: cleanHandle, niche, ninetyDayGoal });
  }

  return { ok: true, videosAnalyzed: posts.length, opener };
}

function defaultOpener(args: {
  handle: string;
  niche: string;
  ninetyDayGoal: string;
}): string {
  return `Got it — you're on **@${args.handle}** doing _${args.niche}_, chasing **${args.ninetyDayGoal}** over the next 90 days. Solid focus.

Let's open with a content audit. Paste me 1–3 of your best recent videos — TikTok links or just the hooks if that's faster — and I'll pull the patterns we can lean into.

If you'd rather start from scratch, just tell me the next video idea on your mind and we'll build the hook from there.`;
}
