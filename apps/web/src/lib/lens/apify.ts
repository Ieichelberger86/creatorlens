/**
 * Direct Apify REST API client. Avoids the official apify-client package
 * because that pulls proxy-agent + a deep dynamic-require chain that
 * Vercel's serverless tracer can't follow.
 */

const APIFY_BASE = "https://api.apify.com/v2";
const TIKTOK_SCRAPER = "clockworks~tiktok-scraper";

function token(): string {
  const t = process.env.APIFY_TOKEN;
  if (!t) throw new Error("APIFY_TOKEN is required");
  return t;
}

export type TikTokPost = {
  id?: string;
  text?: string;
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
  diggCount?: number;
  shareCount?: number;
  playCount?: number;
  commentCount?: number;
  collectCount?: number;
  createTimeISO?: string;
  comments?: Array<{
    text?: string;
    diggCount?: number;
    user?: { uniqueId?: string; nickname?: string };
    createTime?: number;
  }>;
};

/**
 * Apify retry: 3 attempts with exponential backoff (0s, 1s, 4s).
 * Retries on 5xx, timeouts, and network errors. Does NOT retry 4xx
 * (those are deterministic — bad URL, bad input, etc.) so we don't
 * burn budget on inputs that will keep failing.
 */
async function withRetry<T>(
  label: string,
  fn: () => Promise<T>,
  attempts = 3
): Promise<T> {
  let lastErr: unknown = null;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      // Bail on 4xx — retrying won't help (bad URL / bad input)
      if (/Apify 4\d\d/.test(msg)) throw err;
      // Last attempt — re-throw
      if (i === attempts - 1) throw err;
      // Exponential backoff
      const delay = Math.pow(4, i) * 1000;
      console.log(`[apify ${label}] attempt ${i + 1}/${attempts} failed: ${msg.slice(0, 120)} — retrying in ${delay}ms`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/**
 * Run actor synchronously and return the default dataset items in one call.
 * Apify's run-sync-get-dataset-items returns the JSON dataset directly when
 * the run completes within the timeout.
 *
 * Wrapped in withRetry — Apify's proxy network is reliable but not perfect,
 * and a single transient failure shouldn't kill onboarding or a tool call.
 */
async function runActorSync<T = unknown>(
  actorId: string,
  input: Record<string, unknown>,
  timeoutSec = 180,
  itemLimit?: number
): Promise<{ items: T[]; defaultDatasetId: string | null }> {
  return withRetry(`runActor ${actorId}`, async () => {
    const params = new URLSearchParams({ token: token() });
    if (timeoutSec) params.set("timeout", String(timeoutSec));
    if (itemLimit) params.set("limit", String(itemLimit));

    const url = `${APIFY_BASE}/acts/${actorId}/run-sync-get-dataset-items?${params}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout((timeoutSec + 30) * 1000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Apify ${res.status}: ${body.slice(0, 300)}`);
    }

    const items = (await res.json()) as T[];
    return {
      items: Array.isArray(items) ? items : [],
      defaultDatasetId: null,
    };
  });
}

/**
 * Lightweight handle existence check. HEADs the public TikTok profile page —
 * 200 = handle exists, 404 = doesn't. Lets onboarding fail fast on typos
 * before spending 30-60s in Apify.
 */
export async function checkTikTokHandleExists(handle: string): Promise<{
  exists: boolean;
  reason?: string;
}> {
  const cleanHandle = handle.trim().replace(/^@+/, "").toLowerCase();
  if (!/^[a-z0-9._]{1,40}$/.test(cleanHandle)) {
    return { exists: false, reason: "invalid_format" };
  }
  try {
    const res = await fetch(`https://www.tiktok.com/@${cleanHandle}`, {
      method: "HEAD",
      signal: AbortSignal.timeout(8_000),
      redirect: "manual",
      headers: {
        // TikTok blocks default UA — pretend to be a normal browser
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      },
    });
    if (res.status === 200) return { exists: true };
    if (res.status === 404) return { exists: false, reason: "not_found" };
    if (res.status >= 300 && res.status < 400) return { exists: true };
    // Anything else (403, 429, 5xx) — treat as "unable to confirm" but
    // don't block onboarding. Apify will sort it out.
    return { exists: true, reason: `tiktok_${res.status}_treated_as_exists` };
  } catch {
    // Network blip — don't block onboarding
    return { exists: true, reason: "check_failed_treated_as_exists" };
  }
}

async function fetchDatasetItems<T = unknown>(
  datasetId: string,
  limit = 100
): Promise<T[]> {
  const url = `${APIFY_BASE}/datasets/${datasetId}/items?token=${token()}&limit=${limit}`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) return [];
  const items = (await res.json()) as T[];
  return Array.isArray(items) ? items : [];
}

/**
 * Fetch transcript text from a TikTok subtitle download URL.
 * Format is WebVTT-ish; we strip cue indices + timestamps + headers.
 */
export async function fetchSubtitleText(
  downloadLink?: string
): Promise<string | null> {
  if (!downloadLink) return null;
  try {
    const res = await fetch(downloadLink, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const raw = await res.text();
    const lines = raw
      .split(/\r?\n/)
      .filter((l) => {
        const t = l.trim();
        if (!t) return false;
        if (t.startsWith("WEBVTT")) return false;
        if (/^\d+$/.test(t)) return false;
        if (/-->/g.test(t)) return false;
        return true;
      })
      .map((l) => l.replace(/<[^>]+>/g, "").trim())
      .filter(Boolean);
    return lines.join(" ").trim() || null;
  } catch {
    return null;
  }
}

/** Single TikTok post — optionally with comments. */
export async function scrapeTikTokPost(
  url: string,
  opts?: { withComments?: boolean; commentsLimit?: number }
): Promise<TikTokPost | null> {
  const wantComments = !!opts?.withComments;
  const commentsLimit = opts?.commentsLimit ?? 50;

  const input: Record<string, unknown> = {
    postURLs: [url],
    resultsPerPage: 1,
    shouldDownloadVideos: false,
    shouldDownloadCovers: false,
    shouldDownloadSubtitles: true,
    proxyConfiguration: { useApifyProxy: true },
  };
  if (wantComments) {
    input.shouldDownloadComments = true;
    input.commentsPerPost = commentsLimit;
  }

  const { items } = await runActorSync<TikTokPost & { commentsDatasetUrl?: string }>(
    TIKTOK_SCRAPER,
    input,
    180,
    1
  );
  const post = items[0];
  if (!post) return null;

  if (wantComments) {
    const commentsUrl = (post as { commentsDatasetUrl?: string }).commentsDatasetUrl;
    if (commentsUrl) {
      const m = commentsUrl.match(/datasets\/([^/?]+)/);
      const datasetId = m?.[1];
      if (datasetId) {
        const raws = await fetchDatasetItems<Record<string, unknown>>(
          datasetId,
          commentsLimit
        );
        post.comments = raws
          .map((c) => {
            const uniqueId =
              (c.uniqueId as string | undefined) ??
              ((c.user as { uniqueId?: string } | undefined)?.uniqueId);
            const nickname = (c.user as { nickname?: string } | undefined)
              ?.nickname;
            return {
              text: (c.text as string | undefined) ?? "",
              diggCount: (c.diggCount as number | undefined) ?? 0,
              createTime: (c.createTime as number | undefined) ?? 0,
              user: uniqueId ? { uniqueId, nickname } : undefined,
            };
          })
          .filter((c) => c.text);
      }
    }
  }

  return post;
}

/** Last N posts on a profile. Cap is 200 — enough to cover most creators'
 * full TikTok history while staying under Apify's per-run limits. */
export async function scrapeTikTokProfile(
  handle: string,
  limit = 100
): Promise<TikTokPost[]> {
  const cleanHandle = handle.trim().replace(/^@+/, "").toLowerCase();
  const n = Math.min(Math.max(limit, 1), 200);

  // Subtitles add ~3s per video to the scrape — only download them for
  // smaller pulls (audit usually runs at 100, but only the top-N
  // transcripts get sent to Claude — see audit.ts).
  const downloadSubtitles = n <= 30;

  const { items } = await runActorSync<TikTokPost>(
    TIKTOK_SCRAPER,
    {
      profiles: [cleanHandle],
      resultsPerPage: n,
      shouldDownloadVideos: false,
      shouldDownloadCovers: false,
      shouldDownloadSubtitles: downloadSubtitles,
      proxyConfiguration: { useApifyProxy: true },
    },
    // Allow up to 5 minutes for big profiles
    300,
    n
  );
  return items;
}

/** Recent posts under given hashtags — used by find_trends. */
export async function scrapeTikTokHashtags(
  hashtags: string[],
  limitPerTag = 20
): Promise<TikTokPost[]> {
  const cleaned = hashtags
    .map((h) => h.trim().replace(/^#+/, "").toLowerCase())
    .filter(Boolean)
    .slice(0, 5);
  if (!cleaned.length) return [];

  const n = Math.min(Math.max(limitPerTag, 5), 50);
  const { items } = await runActorSync<TikTokPost>(
    TIKTOK_SCRAPER,
    {
      hashtags: cleaned,
      resultsPerPage: n,
      shouldDownloadVideos: false,
      shouldDownloadCovers: false,
      shouldDownloadSubtitles: false,
      proxyConfiguration: { useApifyProxy: true },
    },
    240,
    n * cleaned.length
  );
  return items;
}
