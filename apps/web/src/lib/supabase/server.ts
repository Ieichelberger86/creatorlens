import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

type CookieItem = { name: string; value: string; options?: CookieOptions };

/**
 * SSR client bound to the current request's cookie jar.
 * Use from Server Components, Route Handlers, and Server Actions.
 */
export async function supabaseServer(): Promise<SupabaseClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const store = await cookies();

  return createServerClient(url, anon, {
    cookies: {
      getAll() {
        return store.getAll();
      },
      setAll(items: CookieItem[]) {
        try {
          for (const c of items) store.set(c.name, c.value, c.options);
        } catch {
          // called from a Server Component — ignored; middleware refreshes session.
        }
      },
    },
  });
}

/**
 * Returns the current authenticated user, or null. Never throws on missing session.
 */
export async function getSessionUser() {
  const db = await supabaseServer();
  const { data, error } = await db.auth.getUser();
  if (error) return null;
  return data.user ?? null;
}
