import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DEMO_EMAIL = "demo@creatorlens.app";

/**
 * Wipes the demo account's data so it can be re-seeded by the next run
 * of seed-demo.mts. Admin-only.
 *
 * This is the "scrub" half of the seed — useful if a demo visitor
 * fills the account with garbage and you want to roll it back.
 * Re-seeding the realistic data still requires the script (we don't
 * inline the ~250 lines of demo data here).
 */
export async function POST(req: NextRequest) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const admin = supabaseAdmin();
  const { data: row } = await admin
    .from("users")
    .select("tier")
    .eq("id", sessionUser.id)
    .maybeSingle();
  if (row?.tier !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Find the demo user
  const { data: demoUser } = await admin
    .from("users")
    .select("id")
    .eq("email", DEMO_EMAIL)
    .maybeSingle();
  if (!demoUser) {
    return NextResponse.json(
      { error: "demo_not_seeded", message: "Run seed-demo.mts to create the demo user." },
      { status: 404 }
    );
  }

  const userId = demoUser.id;
  const wipes: Array<[string, ReturnType<typeof admin.from>]> = [
    ["conversations", admin.from("conversations")],
    ["videos", admin.from("videos")],
    ["content_calendar", admin.from("content_calendar")],
    ["brand_deals", admin.from("brand_deals")],
    ["live_shows", admin.from("live_shows")],
    ["goals", admin.from("goals")],
    ["competitor_watch", admin.from("competitor_watch")],
    ["pending_lens_messages", admin.from("pending_lens_messages")],
    ["creator_profile", admin.from("creator_profile")],
    ["tool_runs", admin.from("tool_runs")],
  ];

  const results: Array<{ table: string; ok: boolean; error?: string }> = [];
  for (const [name, q] of wipes) {
    const { error } = await q.delete().eq("user_id", userId);
    results.push({ table: name, ok: !error, error: error?.message });
  }

  await admin
    .from("users")
    .update({
      monthly_tokens_used: 0,
      monthly_period_start: new Date().toISOString(),
    })
    .eq("id", userId);

  return NextResponse.json({
    ok: true,
    user_id: userId,
    wiped: results,
    next_step:
      "Re-seed via `set -a; source apps/web/.env.local; set +a; node --import tsx apps/web/seed-demo.mts`",
  });
}
