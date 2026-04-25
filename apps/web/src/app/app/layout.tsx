import { redirect } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { getSessionUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { SidebarOpenButton } from "./sidebar-toggle";

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
  const handle = row?.tiktok_handle;

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <header className="relative z-10 flex items-center justify-between border-b border-border bg-bg-elevated/60 px-4 py-3 backdrop-blur sm:px-6">
        <div className="flex items-center gap-3 sm:gap-6">
          <SidebarOpenButton />
          <Link href={"/app" as Route} className="flex items-center gap-2">
            <div className="h-5 w-5 rounded-md bg-accent" />
            <span className="font-display text-sm font-semibold tracking-tight">
              CreatorLens
            </span>
            <span className="ml-2 rounded-full bg-accent/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-accent">
              {tier === "admin" ? "admin" : "vanguard alpha"}
            </span>
          </Link>
          <nav className="flex items-center gap-4 text-sm text-fg-muted">
            <Link href={"/app" as Route} className="hover:text-fg transition">
              Chat
            </Link>
            <Link
              href={"/app/calendar" as Route}
              className="hover:text-fg transition"
            >
              Calendar
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-4 text-xs text-fg-muted">
          {handle ? <span className="font-mono">@{handle}</span> : null}
          <span>{display}</span>
          <form action="/auth/sign-out" method="POST">
            <button type="submit" className="hover:text-fg transition">
              Sign out
            </button>
          </form>
        </div>
      </header>
      {children}
    </div>
  );
}
