import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isAuthorizedCron } from "@/lib/cron";
import { scrapeTikTokProfile } from "@/lib/lens/apify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // up to 5 min for batch scrapes

const BREAKOUT_MULTIPLIER = 3.0; // post must be 3x competitor's median to count

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = supabaseAdmin();

  // All competitor rows that haven't been scanned in the last 18 hours
  const cutoff = new Date(Date.now() - 18 * 60 * 60 * 1000).toISOString();
  const { data: targets } = await admin
    .from("competitor_watch")
    .select("id, user_id, handle, median_views, last_alerted_at")
    .eq("paused", false)
    .or(`last_scanned_at.is.null,last_scanned_at.lt.${cutoff}`)
    .limit(20);

  const results: Array<{
    user: string;
    handle: string;
    status: string;
    detail?: string;
  }> = [];

  for (const t of targets ?? []) {
    try {
      const posts = await scrapeTikTokProfile(t.handle, 8);
      if (!posts.length) {
        await admin
          .from("competitor_watch")
          .update({ last_scanned_at: new Date().toISOString() })
          .eq("id", t.id);
        results.push({ user: t.user_id, handle: t.handle, status: "empty" });
        continue;
      }

      // Compute fresh median to keep baseline current
      const views = posts
        .map((p) => p.playCount ?? 0)
        .filter((v): v is number => typeof v === "number" && v > 0);
      const median = views.length
        ? [...views].sort((a, b) => a - b)[Math.floor(views.length / 2)]!
        : t.median_views ?? 0;

      // Find the most recent post that exceeds the breakout threshold
      const baseline = Math.max(median, t.median_views ?? 0, 1);
      const breakout = posts.find(
        (p) => (p.playCount ?? 0) >= baseline * BREAKOUT_MULTIPLIER
      );

      // Only alert once per breakout per 7 days, and only on posts <72h old
      const sinceLastAlert = t.last_alerted_at
        ? Date.now() - Date.parse(t.last_alerted_at)
        : Infinity;
      const breakoutAge = breakout?.createTimeISO
        ? Date.now() - Date.parse(breakout.createTimeISO)
        : Infinity;

      const shouldAlert =
        breakout &&
        sinceLastAlert > 7 * 24 * 3_600_000 &&
        breakoutAge < 72 * 3_600_000;

      if (shouldAlert && breakout) {
        const ratio = ((breakout.playCount ?? 0) / baseline).toFixed(1);
        const hook = (breakout.text ?? "").slice(0, 140);
        const url = breakout.webVideoUrl;
        const content = `**Heads up — @${t.handle} just had a breakout.**

[**${ratio}× their median**](${url}) (${(breakout.playCount ?? 0).toLocaleString()} views in ~${Math.round(
          breakoutAge / 3_600_000
        )}h)

> "${hook}"

Want me to write your version of this hook for your audience?`;

        await admin.from("pending_lens_messages").insert({
          user_id: t.user_id,
          source: "competitor_watch",
          payload: { content },
        });

        await admin
          .from("competitor_watch")
          .update({
            median_views: baseline,
            last_scanned_at: new Date().toISOString(),
            last_alerted_at: new Date().toISOString(),
            last_top_post_url: url ?? null,
          })
          .eq("id", t.id);

        results.push({
          user: t.user_id,
          handle: t.handle,
          status: "alert",
          detail: `${ratio}x baseline`,
        });
      } else {
        await admin
          .from("competitor_watch")
          .update({
            median_views: baseline,
            last_scanned_at: new Date().toISOString(),
          })
          .eq("id", t.id);
        results.push({ user: t.user_id, handle: t.handle, status: "scanned" });
      }
    } catch (err) {
      results.push({
        user: t.user_id,
        handle: t.handle,
        status: "error",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({ ok: true, scanned: results.length, results });
}
