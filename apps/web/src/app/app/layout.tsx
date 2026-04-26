import { redirect } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { getSessionUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { HeaderNav } from "./header-nav";
import { UserMenu } from "./user-menu";
import { MobileNav } from "./mobile-nav";
import { CommandPalette } from "./command-palette";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  const admin = supabaseAdmin();
  const { data: row } = await admin
    .from("users")
    .select("tier, display_name, email, tiktok_handle")
    .eq("id", user.id)
    .maybeSingle();

  const tier = row?.tier ?? "preorder";
  if (tier !== "vanguard" && tier !== "admin") {
    redirect("/login");
  }

  const display = row?.display_name ?? row?.email ?? "creator";
  const email = row?.email ?? "";
  const handle = row?.tiktok_handle ?? null;
  const isAdmin = tier === "admin";

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-bg/80 px-3 py-3 backdrop-blur sm:px-6">
        <div className="flex items-center gap-3 sm:gap-5">
          <Link href={"/app" as Route} className="flex items-center gap-2">
            <div className="h-5 w-5 rounded-md bg-accent" />
            <span className="font-display text-sm font-semibold tracking-tight">
              CreatorLens
            </span>
            {isAdmin ? (
              <span className="hidden rounded-full bg-accent/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-accent sm:inline">
                admin
              </span>
            ) : null}
          </Link>
          <HeaderNav isAdmin={isAdmin} />
        </div>
        <UserMenu display={display} email={email} handle={handle} />
      </header>

      <div className="flex-1">{children}</div>

      <footer className="mt-auto hidden border-t border-border bg-bg/40 px-4 py-4 text-center text-[11px] text-fg-subtle sm:block sm:px-6">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-2 sm:flex-row">
          <span>CreatorLens</span>
          <div className="flex items-center gap-4">
            <a
              href="mailto:ian@iepropertymgmt.com"
              className="hover:text-fg-muted"
            >
              Help
            </a>
            <Link href={"/app/settings" as Route} className="hover:text-fg-muted">
              Settings
            </Link>
          </div>
        </div>
      </footer>

      {/* Mobile bottom tab bar — fixed at the bottom on mobile only.
          Hides itself inside chat (/app/c/[id]) so it doesn't fight the composer. */}
      <MobileNav isAdmin={isAdmin} />

      {/* Global Cmd/Ctrl+K command palette */}
      <CommandPalette isAdmin={isAdmin} />
    </div>
  );
}
