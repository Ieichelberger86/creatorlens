import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Magic-link callback. Supabase redirects here with ?code=…
 * We exchange the code for a session (sets cookies), then route
 * the user based on their tier.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const errorParam = url.searchParams.get("error_description");

  if (errorParam) {
    const target = new URL("/login", url.origin);
    target.searchParams.set("error", /expired/i.test(errorParam) ? "expired" : "invalid");
    return NextResponse.redirect(target);
  }

  if (!code) {
    const target = new URL("/login", url.origin);
    target.searchParams.set("error", "invalid");
    return NextResponse.redirect(target);
  }

  const db = await supabaseServer();
  const { data, error } = await db.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    const target = new URL("/login", url.origin);
    target.searchParams.set("error", "invalid");
    return NextResponse.redirect(target);
  }

  // Allowlist gate — only vanguard + admin tiers can enter /app during alpha.
  const admin = supabaseAdmin();
  const { data: row } = await admin
    .from("users")
    .select("tier, vanguard_creator")
    .eq("id", data.user.id)
    .maybeSingle();

  const tier = row?.tier ?? "preorder";
  const allowed = tier === "vanguard" || tier === "admin";

  if (!allowed) {
    // Sign them out — they landed on a gated alpha.
    await db.auth.signOut();
    const target = new URL("/login", url.origin);
    target.searchParams.set("error", "not_authorized");
    return NextResponse.redirect(target);
  }

  return NextResponse.redirect(new URL("/app", url.origin));
}
