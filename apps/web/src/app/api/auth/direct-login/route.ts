import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  email: z.string().email().max(254),
});

/**
 * Direct email login — no magic link wait. Trades email-ownership
 * verification for first-message friction.
 *
 * Security model:
 * - Only emails already on the vanguard/admin allowlist are recognized.
 *   Random / unknown emails get the same generic 401 to avoid leaking
 *   account existence (timing-safe in spirit; we still skip the
 *   generateLink call when the user doesn't exist).
 * - The /demo route uses a separate allowlist-bypass for the seeded
 *   demo user.
 *
 * Returns: { redirect: <Supabase auth verify URL> } that the client
 * follows via window.location.href. The verify URL sets the auth
 * cookie and routes to /auth/callback → /app.
 */
export async function POST(req: NextRequest) {
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch {
    return NextResponse.json(
      { error: "invalid_body", message: "Email is required." },
      { status: 400 }
    );
  }

  const email = body.email.trim().toLowerCase();
  const admin = supabaseAdmin();

  // Allowlist gate: only existing vanguard/admin users can log in directly.
  const { data: row } = await admin
    .from("users")
    .select("id, tier")
    .eq("email", email)
    .maybeSingle();

  if (!row || (row.tier !== "vanguard" && row.tier !== "admin")) {
    // Generic message — don't leak whether the email exists.
    return NextResponse.json(
      {
        error: "not_authorized",
        message:
          "That email isn't on the Vanguard allowlist yet. Email ian@iepropertymgmt.com to request access — or try the demo at /demo.",
      },
      { status: 401 }
    );
  }

  // Issue a magic link via the admin API and return its action_link.
  // Client follows it via window.location.href, which routes through
  // Supabase's /auth/v1/verify (sets cookie) → /auth/callback → /app.
  const url = new URL(req.url);
  const callback = `${url.origin}/auth/callback`;
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: callback },
  });

  if (error || !data?.properties?.action_link) {
    return NextResponse.json(
      {
        error: "link_failed",
        message: error?.message ?? "Couldn't generate a sign-in link.",
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    redirect: data.properties.action_link,
  });
}
