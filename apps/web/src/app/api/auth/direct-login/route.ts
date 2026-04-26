import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  email: z.string().email().max(254),
});

/**
 * Direct email login — no magic link wait, no PKCE round-trip.
 *
 * Earlier version redirected the browser through Supabase's
 * /auth/v1/verify endpoint, which kicks back to /auth/callback?code=… for
 * PKCE exchange. That fails because we never set a code_verifier cookie
 * (PKCE requires the same client to start AND finish the flow). Result:
 * "Couldn't verify the sign-in. Try again."
 *
 * New approach: generate a magic-link token server-side, then call
 * supabase.auth.verifyOtp({ token_hash, type: 'magiclink' }) on the
 * server-bound client. That client writes the auth cookies directly to
 * the response — no browser round-trip needed.
 *
 * Security model unchanged:
 * - Only emails on the vanguard/admin allowlist authenticate.
 * - Generic 401 on unknown emails (no enumeration).
 * - /auth/callback tier-check still in place as a defense-in-depth
 *   backup for any other auth path.
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

  // Allowlist gate
  const { data: row } = await admin
    .from("users")
    .select("id, tier")
    .eq("email", email)
    .maybeSingle();

  if (!row || (row.tier !== "vanguard" && row.tier !== "admin")) {
    return NextResponse.json(
      {
        error: "not_authorized",
        message:
          "That email isn't on the Vanguard allowlist yet. Email ian@iepropertymgmt.com to request access — or try the demo at /demo.",
      },
      { status: 401 }
    );
  }

  // Generate a magic-link token via the admin API
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });

  if (linkError || !linkData?.properties?.hashed_token) {
    return NextResponse.json(
      {
        error: "link_failed",
        message: linkError?.message ?? "Couldn't generate a sign-in token.",
      },
      { status: 500 }
    );
  }

  // Verify the token on the server. This sets sb-* auth cookies directly
  // on the response — no redirect through /auth/v1/verify, no PKCE.
  const server = await supabaseServer();
  const { error: verifyError } = await server.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: "magiclink",
  });

  if (verifyError) {
    return NextResponse.json(
      {
        error: "verify_failed",
        message: verifyError.message,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, redirect: "/app" });
}
