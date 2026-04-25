"use client";

import { useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";

const NAV: Array<{ href: Route; label: string; icon: string; match: (p: string) => boolean }> = [
  { href: "/app" as Route, label: "Home", icon: "🏠", match: (p) => p === "/app" },
  { href: "/app/chat" as Route, label: "Chat", icon: "💬", match: (p) => p === "/app/chat" || p.startsWith("/app/c/") },
  { href: "/app/goals" as Route, label: "Goals", icon: "🎯", match: (p) => p.startsWith("/app/goals") },
  { href: "/app/calendar" as Route, label: "Calendar", icon: "📅", match: (p) => p.startsWith("/app/calendar") },
  { href: "/app/brand-deals" as Route, label: "Brand deals", icon: "🤝", match: (p) => p.startsWith("/app/brand-deals") },
  { href: "/app/insights" as Route, label: "Insights", icon: "📊", match: (p) => p.startsWith("/app/insights") },
  { href: "/app/settings" as Route, label: "Settings", icon: "⚙️", match: (p) => p.startsWith("/app/settings") },
];

export function MobileNav({ isAdmin }: { isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const path = usePathname() ?? "/app";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-bg-elevated text-fg-muted hover:text-fg sm:hidden"
        aria-label="Open menu"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 16 16"
          fill="currentColor"
          className="h-4 w-4"
        >
          <path d="M2.75 4a.75.75 0 0 1 .75-.75h9a.75.75 0 0 1 0 1.5h-9A.75.75 0 0 1 2.75 4Zm0 4a.75.75 0 0 1 .75-.75h9a.75.75 0 0 1 0 1.5h-9A.75.75 0 0 1 2.75 8Zm0 4a.75.75 0 0 1 .75-.75h9a.75.75 0 0 1 0 1.5h-9a.75.75 0 0 1-.75-.75Z" />
        </svg>
      </button>

      {open ? (
        <>
          <div
            aria-hidden
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 bg-black/60 sm:hidden"
          />
          <aside className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col gap-1 border-r border-border bg-bg-elevated p-3 sm:hidden">
            <div className="mb-3 flex items-center justify-between px-2 py-1">
              <div className="flex items-center gap-2">
                <div className="h-5 w-5 rounded-md bg-accent" />
                <span className="font-display text-sm font-semibold tracking-tight">
                  CreatorLens
                </span>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-fg-subtle hover:text-fg"
                aria-label="Close menu"
              >
                ✕
              </button>
            </div>

            {NAV.map((item) => {
              const active = item.match(path);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition " +
                    (active
                      ? "bg-accent/15 text-fg"
                      : "text-fg-muted hover:bg-bg hover:text-fg")
                  }
                >
                  <span className="text-base">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              );
            })}

            {isAdmin ? (
              <Link
                href={"/admin/agency" as Route}
                onClick={() => setOpen(false)}
                className={
                  "mt-1 flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-sm transition " +
                  (path.startsWith("/admin")
                    ? "border-accent/40 bg-accent/10 text-accent"
                    : "text-fg-muted hover:border-accent/40 hover:text-fg")
                }
              >
                <span className="text-base">🛠️</span>
                <span>Agency control</span>
              </Link>
            ) : null}

            <div className="mt-auto border-t border-border pt-3">
              <form action="/auth/sign-out" method="POST">
                <button
                  type="submit"
                  className="w-full rounded-lg px-3 py-2 text-left text-sm text-fg-muted transition hover:bg-bg hover:text-danger"
                >
                  ↩  Sign out
                </button>
              </form>
            </div>
          </aside>
        </>
      ) : null}
    </>
  );
}
