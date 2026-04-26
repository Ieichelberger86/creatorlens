"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { HeaderMoreMenu } from "./header-more-menu";

const PRIMARY: Array<{ href: Route; label: string; match: (p: string) => boolean }> = [
  { href: "/app" as Route, label: "Home", match: (p) => p === "/app" },
  {
    href: "/app/chat" as Route,
    label: "Chat",
    match: (p) => p === "/app/chat" || p.startsWith("/app/c/"),
  },
];

export function HeaderNav({ isAdmin }: { isAdmin: boolean }) {
  const path = usePathname() ?? "/app";
  return (
    <nav className="hidden items-center gap-1 text-sm sm:flex">
      {PRIMARY.map((item) => {
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
      <HeaderMoreMenu isAdmin={isAdmin} />
    </nav>
  );
}
