import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, LENS_MODEL } from "../client.js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { scrapeTikTokHashtags } from "../apify.js";

export const findTrendsTool: Anthropic.Tool = {
  name: "find_trends",
  description:
    "Surface trending TikTok formats, sounds, and hooks in the creator's niche from the last 7 days. Pulls recent posts under up to 5 niche-relevant hashtags via Apify, ranks by engagement velocity, then clusters into 3-5 trend patterns the creator could ride. Use when the creator asks 'what's trending' or 'what should I make' without a specific topic.",
  input_schema: {
    type: "object",
    properties: {
      hashtags: {
        type: "array",
        items: { type: "string" },
        description:
          "Up to 5 hashtags to scan (without the #). If empty, will derive from the creator's niche.",
      },
      days: {
        type: "integer",
        description:
          "How many days back to consider 'trending'. Default 7, max 30.",
        minimum: 1,
        maximum: 30,
      },
    },
  },
};

export async function findTrendsExecutor(
  input: Record<string, unknown>,
  ctx: { userId: string }
): Promise<string> {
  const { hashtags: rawTags, days } = input as {
    hashtags?: string[];
    days?: number;
  };
  const dayWindow = Math.min(Math.max(days ?? 7, 1), 30);

  // If no hashtags provided, derive from the creator's niche via Claude
  let tags: string[] = (rawTags ?? [])
    .map((t) => t.trim().replace(/^#+/, "").toLowerCase())
    .filter(Boolean);

  if (tags.length === 0) {
    const db = supabaseAdmin();
    const { data: profile } = await db
      .from("creator_profile")
      .select("niche")
      .eq("user_id", ctx.userId)
      .maybeSingle();
    const niche = profile?.niche;
    if (!niche) {
      return "Need either a list of hashtags to scan or a niche on the creator profile. Ask the creator: which 3-5 hashtags should I check?";
    }

    // Quick LLM call to derive 5 hashtags from niche
    const tagRes = await anthropic().messages.create({
      model: LENS_MODEL,
      max_tokens: 200,
      system: `Output exactly 5 TikTok hashtags relevant to a creator's niche, one per line, no preamble, no #, lowercase, single-word or short multi-word tags only. Avoid hashtags that are just the niche restated; pick adjacent topics where the audience also lives.`,
      messages: [{ role: "user", content: `Niche: ${niche}` }],
    });
    const derived = tagRes.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .split("\n")
      .map((l) => l.trim().replace(/^[-•*\d.)\s]+/, "").replace(/^#+/, "").toLowerCase())
      .filter((t) => /^[a-z0-9_]+$/i.test(t))
      .slice(0, 5);
    tags = derived;
  }

  if (!tags.length) {
    return "Couldn't derive any hashtags. Ask the creator for 3-5 specific hashtags to scan.";
  }

  let posts: Awaited<ReturnType<typeof scrapeTikTokHashtags>>;
  try {
    posts = await scrapeTikTokHashtags(tags, 20);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Trend scraper hiccup (${msg}). Worth retrying in a minute.`;
  }

  if (!posts.length) {
    return `No posts came back for #${tags.join(", #")}. Try different hashtags.`;
  }

  // Filter to posts within `dayWindow` days
  const cutoff = Date.now() - dayWindow * 24 * 60 * 60 * 1000;
  const recent = posts.filter((p) => {
    const ts = p.createTimeISO ? Date.parse(p.createTimeISO) : 0;
    return ts >= cutoff;
  });
  const corpus = recent.length >= 10 ? recent : posts; // fall back if recent set is too thin

  // Engagement-velocity ranking: views / hours_since_post
  const ranked = [...corpus]
    .map((p) => {
      const posted = p.createTimeISO ? Date.parse(p.createTimeISO) : 0;
      const hoursOld = posted ? Math.max(1, (Date.now() - posted) / 3_600_000) : 9999;
      const views = p.playCount ?? 0;
      const velocity = views / hoursOld;
      return { p, velocity, hoursOld };
    })
    .sort((a, b) => b.velocity - a.velocity)
    .slice(0, 25);

  const compact = ranked.map(({ p, velocity, hoursOld }) => ({
    url: p.webVideoUrl,
    author: p.authorMeta?.name,
    posted_hours_ago: Math.round(hoursOld),
    views: p.playCount,
    likes: p.diggCount,
    comments: p.commentCount,
    shares: p.shareCount,
    velocity_views_per_hour: Math.round(velocity),
    duration_sec: p.videoMeta?.duration,
    music: p.musicMeta?.musicName,
    hashtags: (p.hashtags ?? []).map((h) => h.name).filter(Boolean).slice(0, 6),
    caption: p.text?.slice(0, 200),
  }));

  const res = await anthropic().messages.create({
    model: LENS_MODEL,
    max_tokens: 1200,
    system: `You analyze a recent slice of TikTok posts in a niche and surface the patterns the creator can ride RIGHT NOW. Output exactly:

3-5 TREND PATTERNS:
1. <pattern name (4-6 words)> — <one sentence on what's working + why>
   • Example: <author> · <views> views in <hours>h · "<short caption excerpt>"
   • What to steal: <specific actionable element — hook structure, format, CTA>
2. ...

SOUNDS WORTH RIDING (if any): comma-separated list of music/sound names that appear repeatedly in winners. If none repeat, write "none repeating in this slice".

YOUR MOVE: 1-2 sentences. Concrete next-video angle for THIS creator, riding one pattern.

Constraints:
- Cite real numbers from the data — author handles, view counts, posted hours.
- "Pattern" means a repeatable structure (e.g. "POV stitch reacting to X claim", not "video about real estate").
- Skip patterns with only one example. Need 2+ winners to call it a trend.
- If the slice is too thin to call any trends, say so and suggest different hashtags.`,
    messages: [
      {
        role: "user",
        content: `Hashtags scanned: ${tags.map((t) => `#${t}`).join(" ")}
Window: last ${dayWindow} days
Corpus size: ${corpus.length} posts (${ranked.length} top by velocity)

Top posts by views/hour:
${JSON.stringify(compact, null, 2)}`,
      },
    ],
  });

  const analysis =
    res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim() || "(trend analysis came back empty)";

  const header = `Scanned ${corpus.length} posts across ${tags.map((t) => `#${t}`).join(" ")} from the last ${dayWindow} days.\n\n`;
  return header + analysis;
}
