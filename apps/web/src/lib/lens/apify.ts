import { ApifyClient } from "apify-client";

let _client: ApifyClient | null = null;

export function apify(): ApifyClient | null {
  if (_client) return _client;
  const token = process.env.APIFY_TOKEN;
  if (!token) return null;
  _client = new ApifyClient({ token });
  return _client;
}

/**
 * Apify actor IDs.
 * - clockworks/tiktok-scraper       → posts + transcripts + (optional) comments
 *   slug-form: clockworks/tiktok-scraper
 */
export const TIKTOK_SCRAPER = "clockworks/tiktok-scraper";

export type TikTokPost = {
  // Common fields the actor returns. We narrow to what we care about.
  id?: string;
  text?: string; // caption
  webVideoUrl?: string;
  authorMeta?: {
    name?: string;
    nickName?: string;
    fans?: number;
    heart?: number;
    video?: number;
  };
  videoMeta?: {
    duration?: number;
    height?: number;
    width?: number;
    subtitleLinks?: Array<{
      language?: string;
      source?: string;
      sourceUnabbreviated?: string;
      downloadLink?: string;
      tiktokLink?: string;
    }>;
  };
  musicMeta?: {
    musicName?: string;
    musicAuthor?: string;
    musicOriginal?: boolean;
  };
  hashtags?: Array<{ name?: string; title?: string }>;
  diggCount?: number; // likes
  shareCount?: number;
  playCount?: number; // views
  commentCount?: number;
  collectCount?: number; // saves
  createTimeISO?: string;
  comments?: Array<{
    text?: string;
    diggCount?: number;
    user?: { uniqueId?: string; nickname?: string };
    createTime?: number;
  }>;
};

/**
 * Fetch transcript text from a TikTok subtitle link. Apify returns subtitle
 * URLs; we have to fetch and parse them. Format is WebVTT-ish; we strip cues.
 */
export async function fetchSubtitleText(downloadLink?: string): Promise<string | null> {
  if (!downloadLink) return null;
  try {
    const res = await fetch(downloadLink, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    const raw = await res.text();
    // Strip WebVTT timestamps + headers, keep just the spoken text.
    const lines = raw
      .split(/\r?\n/)
      .filter((l) => {
        const t = l.trim();
        if (!t) return false;
        if (t.startsWith("WEBVTT")) return false;
        if (/^\d+$/.test(t)) return false; // cue index
        if (/-->/g.test(t)) return false; // timestamps
        return true;
      })
      .map((l) => l.replace(/<[^>]+>/g, "").trim())
      .filter(Boolean);
    return lines.join(" ").trim() || null;
  } catch {
    return null;
  }
}

export async function scrapeTikTokPost(
  url: string,
  opts?: { withComments?: boolean; commentsLimit?: number }
): Promise<TikTokPost | null> {
  const client = apify();
  if (!client) throw new Error("APIFY_TOKEN not configured");

  const input: Record<string, unknown> = {
    postURLs: [url],
    resultsPerPage: 1,
    shouldDownloadVideos: false,
    shouldDownloadCovers: false,
    shouldDownloadSubtitles: true,
    proxyConfiguration: { useApifyProxy: true },
  };
  if (opts?.withComments) {
    input.shouldDownloadComments = true;
    input.commentsPerPost = opts.commentsLimit ?? 50;
  }

  // Sync run with 90s wait — fail fast if cold start drags.
  const run = await client.actor(TIKTOK_SCRAPER).call(input, {
    timeout: 120,
    waitSecs: 120,
  });

  const dataset = await client.dataset(run.defaultDatasetId).listItems({ limit: 1 });
  return (dataset.items[0] as TikTokPost | undefined) ?? null;
}

/**
 * Scrape the most recent N posts from a creator's TikTok profile.
 * Used during onboarding for the initial profile audit.
 */
export async function scrapeTikTokProfile(
  handle: string,
  limit = 10
): Promise<TikTokPost[]> {
  const client = apify();
  if (!client) throw new Error("APIFY_TOKEN not configured");

  const cleanHandle = handle.trim().replace(/^@+/, "").toLowerCase();
  const n = Math.min(Math.max(limit, 1), 30);

  const run = await client.actor(TIKTOK_SCRAPER).call(
    {
      profiles: [cleanHandle],
      resultsPerPage: n,
      shouldDownloadVideos: false,
      shouldDownloadCovers: false,
      shouldDownloadSubtitles: true,
      proxyConfiguration: { useApifyProxy: true },
    },
    { timeout: 180, waitSecs: 180 }
  );

  const dataset = await client.dataset(run.defaultDatasetId).listItems({ limit: n });
  return (dataset.items as TikTokPost[]) ?? [];
}

/**
 * Scrape recent posts under given hashtags. Used by find_trends.
 */
export async function scrapeTikTokHashtags(
  hashtags: string[],
  limitPerTag = 20
): Promise<TikTokPost[]> {
  const client = apify();
  if (!client) throw new Error("APIFY_TOKEN not configured");

  const cleaned = hashtags
    .map((h) => h.trim().replace(/^#+/, "").toLowerCase())
    .filter(Boolean)
    .slice(0, 5); // cap to avoid runaway scrapes
  if (!cleaned.length) return [];

  const n = Math.min(Math.max(limitPerTag, 5), 50);

  const run = await client.actor(TIKTOK_SCRAPER).call(
    {
      hashtags: cleaned,
      resultsPerPage: n,
      shouldDownloadVideos: false,
      shouldDownloadCovers: false,
      shouldDownloadSubtitles: false, // no transcripts needed for trend scan
      proxyConfiguration: { useApifyProxy: true },
    },
    { timeout: 240, waitSecs: 240 }
  );

  const dataset = await client.dataset(run.defaultDatasetId).listItems({
    limit: n * cleaned.length,
  });
  return (dataset.items as TikTokPost[]) ?? [];
}
