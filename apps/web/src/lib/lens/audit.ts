import { supabaseAdmin } from "@/lib/supabase/admin";
import { anthropic, LENS_MODEL } from "./client.js";
import { scrapeTikTokProfile, fetchSubtitleText, type TikTokPost } from "./apify.js";

type AuditBaseline = {
  followers: number | null;
  median_views: number | null;
  avg_views: number | null;
  posts_per_week: number | null;
  like_rate_pct: number | null;
  save_rate_pct: number | null;
  comment_rate_pct: number | null;
  videos_analyzed: number;
};

type AuditResult = {
  ok: boolean;
  videosAnalyzed: number;
  opener: string;
  fallbackReason?: string;
  baseline: AuditBaseline;
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
  monetizationStreams?: string[];
  limit?: number;
}): Promise<AuditResult> {
  const { userId, handle, niche, ninetyDayGoal } = args;
  const monetizationStreams = args.monetizationStreams ?? [];
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

  // Best-effort voice extraction from the top 3 transcripts. Powers draft_script
  // immediately so first scripts land in their cadence without manual paste.
  const voiceCorpus = top
    .map((p) => {
      const t =
        (p as TikTokPost & { __transcript?: string }).__transcript ?? p.text;
      return typeof t === "string" && t.trim().length > 30 ? t.trim() : null;
    })
    .filter((t): t is string => !!t)
    .slice(0, 3);

  if (voiceCorpus.length > 0) {
    try {
      const voiceRes = await anthropic().messages.create({
        model: LENS_MODEL,
        max_tokens: 600,
        system: `You extract a creator's voice from sample transcripts. Output exactly:

VOICE TRAITS (5):
- <trait sentence — sentence-length / vocabulary / energy / sentence structure / quirks>
- ...

SIGNATURE LINES (3):
- "<verbatim or near-verbatim line that exemplifies their voice>"
- "..."
- "..."

No preamble. No explanation. Just those two sections.`,
        messages: [
          {
            role: "user",
            content: `Top transcripts from the creator (most recent first):\n\n${voiceCorpus
              .map((t, i) => `--- transcript ${i + 1} ---\n${t}`)
              .join("\n\n")}`,
          },
        ],
      });
      const voiceText = voiceRes.content
        .filter((b): b is import("@anthropic-ai/sdk").default.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();

      // Parse the SIGNATURE LINES block into voice_samples; keep the full
      // distillation in brand_notes so Lens can reference the trait list too.
      const samples: string[] = [];
      const sigMatch = voiceText.match(/SIGNATURE LINES[^\n]*\n([\s\S]+)/i);
      const sigBody = sigMatch?.[1];
      if (sigBody) {
        const lines = sigBody.split("\n");
        for (const l of lines) {
          const m = l.match(/^[-•*\s]*"([^"]+)"/);
          const inner = m?.[1];
          if (inner) samples.push(inner.trim());
        }
      }

      if (samples.length > 0 || voiceText.length > 0) {
        await db
          .from("creator_profile")
          .upsert(
            {
              user_id: userId,
              voice_samples: samples,
              brand_notes: voiceText,
            },
            { onConflict: "user_id" }
          );
      }
    } catch {
      // Silent fallback — voice extraction is a quality boost, not a hard requirement
    }
  }

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
      baseline: {
        followers: null,
        median_views: null,
        avg_views: null,
        posts_per_week: null,
        like_rate_pct: null,
        save_rate_pct: null,
        comment_rate_pct: null,
        videos_analyzed: 0,
      },
    };
  }

  // Compute extra signals for the audit report
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
    like_rate_pct: p.playCount
      ? +(((p.diggCount ?? 0) / p.playCount) * 100).toFixed(2)
      : null,
    save_rate_pct: p.playCount
      ? +(((p.collectCount ?? 0) / p.playCount) * 100).toFixed(2)
      : null,
    hashtags: (p.hashtags ?? []).map((h) => h.name).filter(Boolean),
    caption: p.text?.slice(0, 240),
    transcript: (
      (p as TikTokPost & { __transcript?: string }).__transcript ?? p.text ?? ""
    ).slice(0, 600),
  }));

  // Posting cadence: median days between posts
  const postedTimes = posts
    .map((p) => (p.createTimeISO ? Date.parse(p.createTimeISO) : 0))
    .filter((t) => t > 0)
    .sort((a, b) => b - a);
  const gaps: number[] = [];
  for (let i = 1; i < postedTimes.length; i++) {
    const prev = postedTimes[i - 1];
    const cur = postedTimes[i];
    if (prev !== undefined && cur !== undefined) {
      gaps.push((prev - cur) / (24 * 3_600_000));
    }
  }
  const medianGapDays = gaps.length
    ? +gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)]!.toFixed(1)
    : null;
  const postsPerWeek = medianGapDays && medianGapDays > 0
    ? +(7 / medianGapDays).toFixed(1)
    : null;

  // Hashtag aggregates (avg views per use)
  const hashMap = new Map<string, { sum: number; uses: number }>();
  for (const p of posts) {
    const v = p.playCount ?? 0;
    for (const h of p.hashtags ?? []) {
      const tag = (h.name ?? "").trim().toLowerCase();
      if (!tag) continue;
      const cur = hashMap.get(tag) ?? { sum: 0, uses: 0 };
      cur.sum += v;
      cur.uses += 1;
      hashMap.set(tag, cur);
    }
  }
  const topHashtags = [...hashMap.entries()]
    .map(([tag, agg]) => ({
      tag,
      uses: agg.uses,
      avg_views: Math.round(agg.sum / Math.max(1, agg.uses)),
    }))
    .filter((h) => h.uses >= 1)
    .sort((a, b) => b.avg_views - a.avg_views)
    .slice(0, 8);

  // Engagement-rate aggregates
  const totalViews = posts.reduce((s, p) => s + (p.playCount ?? 0), 0);
  const totalLikes = posts.reduce((s, p) => s + (p.diggCount ?? 0), 0);
  const totalSaves = posts.reduce((s, p) => s + (p.collectCount ?? 0), 0);
  const totalComments = posts.reduce((s, p) => s + (p.commentCount ?? 0), 0);
  const likeRatePct = totalViews ? +((totalLikes / totalViews) * 100).toFixed(2) : 0;
  const saveRatePct = totalViews ? +((totalSaves / totalViews) * 100).toFixed(2) : 0;
  const commentRatePct = totalViews
    ? +((totalComments / totalViews) * 100).toFixed(2)
    : 0;

  let opener: string;
  try {
    const res = await anthropic().messages.create({
      model: LENS_MODEL,
      max_tokens: 1500,
      system: `You're Lens running a fresh profile audit for a creator who just finished onboarding. You have their last ${posts.length} videos with full metrics + transcripts + their stated niche/goal.

Output a structured audit report in EXACTLY this markdown format. No preamble, no caveats outside the report.

# Your audit, @<handle>

**<one-line account snapshot>** — followers, median view, posting cadence, baseline reach as a percentage. Make this scannable.

## What's working

1. **<Pattern name (3-5 words)>** — <2 sentences citing 2+ specific videos with view counts. Why this is repeatable.>
2. **<Pattern name>** — <same shape>
3. **<Pattern name>** — <same shape, optional if there isn't a clear third>

## What's not working

1. **<Specific issue>** — <2 sentences with the cost cited in views or rate. Be direct, not soft.>
2. **<Optional second issue>** — <same shape>

## Your voice

<2-3 sentences distilling cadence, sentence length, energy, vocabulary tells. Quote one short line verbatim from a transcript that exemplifies it.>

## 3 experiments this week

1. **"<Hook line in their voice>"** — <format · target duration · 1-line reasoning tied to a pattern above>
2. **"<Hook line>"** — <same shape>
3. **"<Hook line>"** — <same shape>

## Stop doing this

<One opinionated, sharp call-out. What they're doing that's actively hurting them. Be specific — name the videos or the pattern. NEVER say "post more consistently" or other generic creator advice.>

---

I'm here when you're ready. Want me to script experiment #1, or something else first?

Constraints:
- Cite numbers throughout. Real view counts, real percentages. No vibes.
- Patterns must have 2+ data points from their actual videos.
- Hooks in experiments must mirror their voice (use the voice samples / signature lines / transcript snippets).
- "Stop doing this" should be a real opinion. If their #1 problem is hashtag drift, say so. If it's hook quality, say that. If posting cadence is fine, find the next biggest issue.
- Total length 350-600 words.
- Tone: warm, direct, creator-native. Like a sharp agency consultant friend.`,
      messages: [
        {
          role: "user",
          content: `Creator handle: @${cleanHandle}
Niche: ${niche}
90-day goal: ${ninetyDayGoal}
Monetization streams (where they actually make money): ${
            monetizationStreams.length
              ? monetizationStreams.join(", ")
              : "(not specified)"
          }

The audit MUST be filtered through their monetization stream:
- live_gifts: optimize for hooks that drive viewers into their live + trigger gift moments
- creator_rewards: optimize for watch-time + completion rate on long-form
- brand_deals: optimize for follower count + niche authority + clean public-facing aesthetic
- tiktok_shop_affiliate / tiktok_shop_seller: optimize for product demo + buy-now CTAs + saves
- subscriptions: optimize for parasocial / community-building hooks
- lead_gen: optimize for DMs + saves (saved videos = bookmarked intent)
- info_product: optimize for off-platform clicks + email capture hooks
- ugc_contracts: optimize for production quality showcase, not personal reach

ACCOUNT-LEVEL:
- Followers: ${followerCount ?? "unknown"}
- Median views (last ${posts.length}): ${median}
- Average views: ${avg}
- Top video views: ${top1}
- Posting cadence: ${postsPerWeek ?? "?"} videos/week (median gap ${medianGapDays ?? "?"} days)
- Lifetime engagement: ${likeRatePct}% likes, ${saveRatePct}% saves, ${commentRatePct}% comments

TOP HASHTAGS (avg views per use):
${topHashtags.map((h) => `- #${h.tag}: ${h.avg_views.toLocaleString()} avg (${h.uses}× used)`).join("\n")}

LAST ${posts.length} VIDEOS:
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

  return {
    ok: true,
    videosAnalyzed: posts.length,
    opener,
    baseline: {
      followers: followerCount ?? null,
      median_views: median || null,
      avg_views: avg || null,
      posts_per_week: postsPerWeek,
      like_rate_pct: likeRatePct || null,
      save_rate_pct: saveRatePct || null,
      comment_rate_pct: commentRatePct || null,
      videos_analyzed: posts.length,
    },
  };
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
