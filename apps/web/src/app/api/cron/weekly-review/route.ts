import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isAuthorizedCron, alertCronFailure } from "@/lib/cron";
import { generateWeeklyReview } from "@/lib/lens/weekly-review";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Per-creator review takes ~30-60s. With 50 creators that's ~50min worst
// case. Vercel max is 300s on Pro / 60s on Hobby. We'll process in
// chunks if needed.
export const maxDuration = 300;

/**
 * Weekly review cron — runs Mondays at 8am UTC.
 *
 * For each Vanguard/admin user with niche set:
 *   1. Pull last 7 days of posts
 *   2. Generate the structured weekly review (last week + this week plan)
 *   3. Save to weekly_reviews
 *
 * Idempotent on (user_id, week_starting) — re-run replaces.
 * Capped at 25 users per run to stay under timeouts; if we grow past
 * that, paginate by created_at.
 */
export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    return await runWeekly();
  } catch (err) {
    await alertCronFailure({ job: "weekly-review", error: err });
    return NextResponse.json(
      {
        error: "weekly_review_failed",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}

async function runWeekly(): Promise<Response> {
  const admin = supabaseAdmin();

  const { data: users } = await admin
    .from("users")
    .select("id, email, tier, tiktok_handle")
    .in("tier", ["vanguard", "admin"])
    .not("tiktok_handle", "is", null)
    .limit(25);

  const results: Array<{
    email: string;
    ok: boolean;
    reason?: string;
    videosAnalyzed?: number;
  }> = [];

  for (const u of users ?? []) {
    try {
      const r = await generateWeeklyReview({ userId: u.id });
      results.push({
        email: u.email,
        ok: r.ok,
        reason: r.reason,
        videosAnalyzed: r.videosAnalyzed,
      });
    } catch (err) {
      results.push({
        email: u.email,
        ok: false,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const okCount = results.filter((r) => r.ok).length;
  return NextResponse.json({
    ok: true,
    processed: results.length,
    succeeded: okCount,
    failed: results.length - okCount,
    results,
  });
}
