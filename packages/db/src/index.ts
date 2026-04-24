import { createClient, SupabaseClient } from "@supabase/supabase-js";

export * from "./types.js";

let _adminClient: SupabaseClient | null = null;
let _anonClient: SupabaseClient | null = null;

/**
 * Service-role client — bypasses RLS. Server-only.
 * Throws if called without the required env vars.
 */
export function adminClient(): SupabaseClient {
  if (_adminClient) return _adminClient;

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "adminClient() requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  _adminClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _adminClient;
}

/**
 * Anon client — subject to RLS. Safe to use client-side, but use server components
 * where possible to avoid shipping the URL to the browser unnecessarily.
 */
export function anonClient(): SupabaseClient {
  if (_anonClient) return _anonClient;

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey =
    process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("anonClient() requires SUPABASE_URL and SUPABASE_ANON_KEY");
  }

  _anonClient = createClient(url, anonKey);
  return _anonClient;
}
