"use client";

import { useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";

type Item = {
  href: Route;
  label: string;
  icon: string;
  match: (p: string) => boolean;
};

const TABS: Item[] = [
  { href: "/app" as Route, label: "Home", icon: "🏠", match: (p) => p === "/app" },
  {
    href: "/app/review" as Route,
    label: "Reviews",
    icon: "📋",
    match: (p) => p.startsWith("/app/review"),
  },
  {
    href: "/app/calendar" as Route,
    label: "Calendar",
    icon: "📅",
    match: (p) => p.startsWith("/app/calendar"),
  },
];

const MORE: Item[] = [
  { href: "/app/goals" as Route, label: "Goals", icon: "🎯", match: (p) => p.startsWith("/app/goals") },
  { href: "/app/brand-deals" as Route, label: "Brand deals", icon: "🤝", match: (p) => p.startsWith("/app/brand-deals") },
  { href: "/app/insights" as Route, label: "Insights", icon: "📊", match: (p) => p.startsWith("/app/insights") },
  { href: "/app/settings" as Route, label: "Settings", icon: "⚙️", match: (p) => p.startsWith("/app/settings") },
];

export function MobileNav({ isAdmin }: { isAdmin: boolean }) {
  const path = usePathname() ?? "/app";
  const [open, setOpen] = useState(false);

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-30 flex items-stretch justify-around border-t border-border bg-bg-elevated/95 backdrop-blur sm:hidden">
        {TABS.map((tab) => {
          const active = tab.match(path);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={
                "flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] transition " +
                (active ? "text-accent" : "text-fg-muted hover:text-fg")
              }
            >
              <span className="text-lg leading-none">{tab.icon}</span>
              <span>{tab.label}</span>
            </Link>
          );
        })}

        <button
          type="button"
          onClick={() => setOpen(true)}
          className={
            "flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] transition " +
            (MORE.some((m) => m.match(path)) ? "text-accent" : "text-fg-muted hover:text-fg")
          }
          aria-label="More"
        >
          <span className="text-lg leading-none">⋯</span>
          <span>More</span>
        </button>
      </nav>

      {open ? (
        <>
          <div
            aria-hidden
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 bg-black/60 sm:hidden"
          />
          <aside className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] flex-col gap-1 rounded-t-2xl border-t border-border bg-bg-elevated p-3 pb-6 sm:hidden">
            <div className="mb-2 flex items-center justify-between px-2 py-1">
              <span className="font-display text-sm font-semibold tracking-tight">
                More
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-fg-subtle hover:text-fg"
                aria-label="Close menu"
              >
                ✕
              </button>
            </div>

            {MORE.map((item) => {
              const active = item.match(path);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={
                    "flex items-center gap-3 rounded-lg px-3 py-3 text-sm transition " +
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
                  "mt-1 flex items-center gap-3 rounded-lg border border-border px-3 py-3 text-sm transition " +
                  (path.startsWith("/admin")
                    ? "border-accent/40 bg-accent/10 text-accent"
                    : "text-fg-muted hover:border-accent/40 hover:text-fg")
                }
              >
                <span className="text-base">🛠️</span>
                <span>Agency</span>
              </Link>
            ) : null}

            <form action="/auth/sign-out" method="POST" className="mt-2 border-t border-border pt-2">
              <button
                type="submit"
                className="w-full rounded-lg px-3 py-3 text-left text-sm text-fg-muted transition hover:bg-bg hover:text-danger"
              >
                ↩  Sign out
              </button>
            </form>
          </aside>
        </>
      ) : null}

      <div className="h-16 sm:hidden" />
    </>
  );
}
