import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEMO_EMAIL = "demo@creatorlens.app";

/**
 * Public no-login demo entry point.
 *
 * Anyone hitting /demo gets logged in as the seeded demo user (vanguard
 * tier, 20K token cap, pre-populated profile + goals + calendar +
 * conversation). Generates a one-time magic link via the Supabase admin
 * API and follows it to set the auth cookie.
 *
 * Safety:
 * - Demo user can only see its own data (RLS enforces auth.uid() = user_id
 *   on every table).
 * - Token cap is set to 20K (vs 500K for real Vanguard users).
 * - Demo data can be re-seeded any time via `node --import tsx seed-demo.mts`.
 */
export async function GET(req: NextRequest) {
  const admin = supabaseAdmin();

  // Generate a magic link for the demo user
  const url = new URL(req.url);
  const callbackUrl = `${url.origin}/auth/callback`;

  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: DEMO_EMAIL,
    options: {
      redirectTo: callbackUrl,
    },
  });

  if (error || !data?.properties?.action_link) {
    return NextResponse.json(
      {
        error: "demo_link_failed",
        message: error?.message ?? "could not generate demo link",
      },
      { status: 500 }
    );
  }

  // Redirect through Supabase's auth verification URL — sets cookie and
  // routes to /auth/callback?code=… which exchanges for a session and
  // routes to /app
  return NextResponse.redirect(data.properties.action_link);
}
