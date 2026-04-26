"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";

type MoreItem = {
  href: Route;
  label: string;
  icon: string;
  match: (p: string) => boolean;
};

export function HeaderMoreMenu({ isAdmin }: { isAdmin: boolean }) {
  const path = usePathname() ?? "/app";
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  const items: MoreItem[] = [
    { href: "/app/goals" as Route, label: "Goals", icon: "🎯", match: (p) => p.startsWith("/app/goals") },
    { href: "/app/calendar" as Route, label: "Calendar", icon: "📅", match: (p) => p.startsWith("/app/calendar") },
    { href: "/app/brand-deals" as Route, label: "Brand deals", icon: "🤝", match: (p) => p.startsWith("/app/brand-deals") },
    { href: "/app/insights" as Route, label: "Insights", icon: "📊", match: (p) => p.startsWith("/app/insights") },
    { href: "/app/settings" as Route, label: "Settings", icon: "⚙️", match: (p) => p.startsWith("/app/settings") },
  ];
  if (isAdmin) {
    items.push({
      href: "/admin/agency" as Route,
      label: "Agency",
      icon: "🛠️",
      match: (p) => p.startsWith("/admin"),
    });
  }

  const sectionActive = items.some((it) => it.match(path));

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", onClick);
      document.addEventListener("keydown", onKey);
      return () => {
        document.removeEventListener("mousedown", onClick);
        document.removeEventListener("keydown", onKey);
      };
    }
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={
          "flex items-center gap-1 rounded-md px-3 py-1.5 text-sm transition " +
          (sectionActive
            ? "bg-bg-elevated text-fg"
            : "text-fg-muted hover:bg-bg-elevated hover:text-fg")
        }
      >
        <span>More</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 16 16"
          fill="currentColor"
          className="h-3 w-3"
        >
          <path
            fillRule="evenodd"
            d="M3.22 5.22a.75.75 0 0 1 1.06 0L8 8.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L3.22 6.28a.75.75 0 0 1 0-1.06Z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {open ? (
        <div className="absolute left-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-xl border border-border bg-bg-elevated shadow-lg">
          {items.map((it) => {
            const active = it.match(path);
            return (
              <Link
                key={it.href}
                href={it.href}
                onClick={() => setOpen(false)}
                className={
                  "flex items-center gap-3 px-3 py-2 text-sm transition " +
                  (active
                    ? "bg-accent/15 text-accent"
                    : "text-fg-muted hover:bg-bg hover:text-fg")
                }
              >
                <span className="text-base leading-none">{it.icon}</span>
                <span>{it.label}</span>
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
