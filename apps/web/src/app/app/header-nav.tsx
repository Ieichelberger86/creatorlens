"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";

const NAV: Array<{ href: Route; label: string; match: (p: string) => boolean }> = [
  { href: "/app" as Route, label: "Home", match: (p) => p === "/app" },
  { href: "/app/chat" as Route, label: "Chat", match: (p) => p === "/app/chat" || p.startsWith("/app/c/") },
  { href: "/app/goals" as Route, label: "Goals", match: (p) => p.startsWith("/app/goals") },
  { href: "/app/calendar" as Route, label: "Calendar", match: (p) => p.startsWith("/app/calendar") },
  { href: "/app/brand-deals" as Route, label: "Brand deals", match: (p) => p.startsWith("/app/brand-deals") },
  { href: "/app/insights" as Route, label: "Insights", match: (p) => p.startsWith("/app/insights") },
];

export function HeaderNav({ isAdmin }: { isAdmin: boolean }) {
  const path = usePathname() ?? "/app";
  return (
    <nav className="hidden items-center gap-1 text-sm sm:flex">
      {NAV.map((item) => {
        const active = item.match(path);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={
              "rounded-md px-3 py-1.5 transition " +
              (active
                ? "bg-bg-elevated text-fg"
                : "text-fg-muted hover:bg-bg-elevated hover:text-fg")
            }
          >
            {item.label}
          </Link>
        );
      })}
      {isAdmin ? (
        <Link
          href={"/admin/agency" as Route}
          className={
            "ml-2 rounded-md border border-border px-3 py-1.5 transition " +
            (path.startsWith("/admin")
              ? "bg-accent/10 text-accent border-accent/40"
              : "text-fg-muted hover:border-accent/40 hover:text-fg")
          }
        >
          Agency
        </Link>
      ) : null}
    </nav>
  );
}
