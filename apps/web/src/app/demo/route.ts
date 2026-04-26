import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEMO_EMAIL = "demo@creatorlens.app";

/**
 * Public no-login demo entry point.
 *
 * Anyone hitting /demo gets logged in as the seeded demo user (vanguard
 * tier, 20K token cap, pre-populated profile + goals + calendar +
 * conversation).
 *
 * Implementation: same pattern as /api/auth/direct-login —
 *   1. admin.generateLink mints a token server-side
 *   2. server.auth.verifyOtp(token_hash) sets the auth cookies directly
 *   3. redirect to /app
 *
 * No PKCE round-trip, no Supabase /auth/v1/verify redirect. The browser
 * never sees the token.
 */
export async function GET(_req: NextRequest) {
  const admin = supabaseAdmin();

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: DEMO_EMAIL,
  });

  if (linkError || !linkData?.properties?.hashed_token) {
    return NextResponse.json(
      {
        error: "demo_link_failed",
        message: linkError?.message ?? "Couldn't generate demo session.",
      },
      { status: 500 }
    );
  }

  const server = await supabaseServer();
  const { error: verifyError } = await server.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: "magiclink",
  });

  if (verifyError) {
    return NextResponse.json(
      {
        error: "demo_verify_failed",
        message: verifyError.message,
      },
      { status: 500 }
    );
  }

  // Auth cookie is now on this response. Redirect to the dashboard.
  return NextResponse.redirect(new URL("/app", _req.url));
}
