"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Route } from "next";

export function UserMenu({
  display,
  email,
  handle,
}: {
  display: string;
  email: string;
  handle: string | null;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  // Close on outside click + Escape
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

  const initial = (display || email).charAt(0).toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full border border-border bg-bg-elevated px-2 py-1 text-xs text-fg-muted transition hover:border-accent/40 hover:text-fg"
        aria-label="Open user menu"
        aria-expanded={open}
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/20 font-mono text-[11px] font-bold text-accent">
          {initial}
        </span>
        {handle ? (
          <span className="hidden font-mono md:inline">@{handle}</span>
        ) : null}
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
        <div className="absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-xl border border-border bg-bg-elevated shadow-lg">
          <div className="border-b border-border px-4 py-3">
            <div className="text-sm font-semibold text-fg">{display}</div>
            <div className="mt-0.5 truncate text-[11px] text-fg-subtle">
              {email}
            </div>
            {handle ? (
              <div className="mt-0.5 font-mono text-[11px] text-fg-subtle">
                @{handle}
              </div>
            ) : null}
          </div>
          <div className="py-1">
            <MenuLink href={"/app/settings" as Route} icon="⚙️" label="Settings" />
            <MenuLink href={"/app/insights" as Route} icon="📊" label="Insights" />
          </div>
          <form action="/auth/sign-out" method="POST" className="border-t border-border">
            <button
              type="submit"
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-fg-muted transition hover:bg-bg hover:text-danger"
            >
              <span>↩</span>
              <span>Sign out</span>
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function MenuLink({
  href,
  icon,
  label,
}: {
  href: Route;
  icon: string;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 px-4 py-2.5 text-sm text-fg-muted transition hover:bg-bg hover:text-fg"
    >
      <span className="text-base leading-none">{icon}</span>
      <span>{label}</span>
    </Link>
  );
}
