"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import {
  createNewConversation,
  createConversationFromPrompt,
} from "./conversations/actions";

type Command = {
  id: string;
  label: string;
  hint?: string;
  icon: string;
  /** Either a route to navigate to, or a function to invoke. */
  run: () => void | Promise<void>;
  group: "navigate" | "ask" | "account";
  keywords?: string;
};

/**
 * Global command palette — Cmd/Ctrl+K from any /app/* page.
 * Mounted in the AppLayout so it's available everywhere.
 *
 * Two kinds of commands:
 * - Navigate: jump to a section (Home, Goals, Calendar, etc.)
 * - Ask: pre-fills a chat prompt and opens a fresh conversation
 *   (e.g. "Generate 10 hooks", "Find trending posts")
 * - Account: Settings, Sign out
 */
export function CommandPalette({ isAdmin }: { isAdmin: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [pending, start] = useTransition();

  const commands = useMemo<Command[]>(() => {
    const list: Command[] = [
      // Navigate
      {
        id: "nav-home",
        label: "Home",
        icon: "🏠",
        group: "navigate",
        run: () => router.push("/app" as Route),
        keywords: "dashboard today",
      },
      {
        id: "nav-chat",
        label: "Open chat",
        icon: "💬",
        group: "navigate",
        run: () => router.push("/app/chat" as Route),
        keywords: "lens conversation",
      },
      {
        id: "nav-goals",
        label: "Goals",
        icon: "🎯",
        group: "navigate",
        run: () => router.push("/app/goals" as Route),
      },
      {
        id: "nav-calendar",
        label: "Calendar",
        icon: "📅",
        group: "navigate",
        run: () => router.push("/app/calendar" as Route),
        keywords: "schedule pipeline content",
      },
      {
        id: "nav-deals",
        label: "Brand deals",
        icon: "🤝",
        group: "navigate",
        run: () => router.push("/app/brand-deals" as Route),
        keywords: "sponsorship pitch",
      },
      {
        id: "nav-insights",
        label: "Insights",
        icon: "📊",
        group: "navigate",
        run: () => router.push("/app/insights" as Route),
        keywords: "stats analytics numbers",
      },

      // Quick "ask Lens" actions — open a new chat with the prompt pre-fired
      {
        id: "ask-hooks",
        label: "Generate 10 hooks",
        hint: "for my next video",
        icon: "🎣",
        group: "ask",
        run: () => fireChatPrompt("Generate 10 hook variants for my next video — pick the highest-leverage angle from my recent winners."),
        keywords: "hook idea brainstorm opener",
      },
      {
        id: "ask-trends",
        label: "Find trending posts",
        hint: "in my niche this week",
        icon: "📈",
        group: "ask",
        run: () => fireChatPrompt("Find trending TikTok posts in my niche this week I could ride."),
        keywords: "trending viral",
      },
      {
        id: "ask-set-goals",
        label: "Set my goals",
        hint: "from my latest audit",
        icon: "🎯",
        group: "ask",
        run: () =>
          fireChatPrompt(
            "Set my 90-day goals from my latest audit. Decompose them into 1-3 measurable goals with action plans."
          ),
        keywords: "ninety 90 day plan",
      },
      {
        id: "ask-postmortem",
        label: "Score a recent post",
        hint: "I'll paste the URL",
        icon: "🔍",
        group: "ask",
        run: () =>
          fireChatPrompt(
            "I'm going to paste a TikTok URL — analyze it, then run a brutal post-mortem against my baseline."
          ),
        keywords: "post mortem analyze video",
      },
      {
        id: "ask-deal",
        label: "Review a brand pitch",
        hint: "I'll paste the email",
        icon: "🤝",
        group: "ask",
        run: () =>
          fireChatPrompt(
            "I'll paste a brand pitch in my next message — check for scam patterns, extract the real terms, and draft a recommended response in my voice."
          ),
        keywords: "scam vet sponsorship pitch",
      },
      {
        id: "new-chat",
        label: "Start a new chat",
        hint: "blank slate",
        icon: "➕",
        group: "ask",
        run: async () => {
          await createNewConversation();
        },
        keywords: "blank fresh",
      },
      {
        id: "rerun-audit",
        label: "Run a fresh audit",
        hint: "full profile, ~2 minutes",
        icon: "🔁",
        group: "ask",
        run: () => router.push("/app/audit/running" as Route),
        keywords: "audit refresh redo update",
      },

      // Account
      {
        id: "nav-settings",
        label: "Settings",
        icon: "⚙️",
        group: "account",
        run: () => router.push("/app/settings" as Route),
      },
      {
        id: "signout",
        label: "Sign out",
        icon: "↩",
        group: "account",
        run: () => {
          // Submit the existing form action via fetch
          void fetch("/auth/sign-out", { method: "POST" }).then(() => {
            window.location.href = "/login";
          });
        },
        keywords: "log out exit",
      },
    ];
    if (isAdmin) {
      list.push({
        id: "nav-agency",
        label: "Agency control",
        icon: "🛠️",
        group: "navigate",
        run: () => router.push("/admin/agency" as Route),
      });
    }
    return list;

    function fireChatPrompt(prompt: string) {
      const fd = new FormData();
      fd.set("message", prompt);
      start(async () => void (await createConversationFromPrompt(fd)));
    }
  }, [router, isAdmin]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => {
      const haystack = `${c.label} ${c.hint ?? ""} ${c.keywords ?? ""}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [commands, query]);

  // Reset active index when filter changes
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // Global Cmd/Ctrl+K listener
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const cmd = e.metaKey || e.ctrlKey;
      if (cmd && e.key === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Focus the input when opening
  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  function runActive() {
    const cmd = filtered[activeIndex];
    if (!cmd) return;
    setOpen(false);
    void cmd.run();
  }

  function onInputKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      runActive();
    }
  }

  if (!open) return null;

  // Group commands by section for display
  const groups: Record<Command["group"], Command[]> = {
    ask: [],
    navigate: [],
    account: [],
  };
  filtered.forEach((c) => groups[c.group].push(c));

  let runningIndex = -1;
  const renderGroup = (label: string, items: Command[]) => {
    if (items.length === 0) return null;
    return (
      <div key={label}>
        <div className="px-3 pb-1 pt-3 text-[10px] uppercase tracking-wider text-fg-subtle">
          {label}
        </div>
        {items.map((c) => {
          runningIndex += 1;
          const isActive = runningIndex === activeIndex;
          const myIndex = runningIndex;
          return (
            <button
              key={c.id}
              type="button"
              onMouseEnter={() => setActiveIndex(myIndex)}
              onClick={() => {
                setActiveIndex(myIndex);
                runActive();
              }}
              className={
                "flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition " +
                (isActive
                  ? "bg-accent/15 text-fg"
                  : "text-fg-muted hover:bg-bg")
              }
            >
              <span className="text-base leading-none">{c.icon}</span>
              <span className="flex-1">
                {c.label}
                {c.hint ? (
                  <span className="ml-2 text-xs text-fg-subtle">{c.hint}</span>
                ) : null}
              </span>
              {isActive ? (
                <span className="font-mono text-[10px] text-fg-subtle">↵</span>
              ) : null}
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <>
      <div
        aria-hidden
        onClick={() => setOpen(false)}
        className="fixed inset-0 z-50 bg-black/60"
      />
      <div className="fixed inset-x-0 top-[10vh] z-50 mx-auto w-full max-w-lg px-4">
        <div className="overflow-hidden rounded-2xl border border-border bg-bg-elevated shadow-2xl">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 16 16"
              fill="currentColor"
              className="h-4 w-4 text-fg-subtle"
            >
              <path
                fillRule="evenodd"
                d="M9.5 3a6.5 6.5 0 1 0 4.193 11.487l2.41 2.41a.75.75 0 1 0 1.06-1.06l-2.41-2.41A6.5 6.5 0 0 0 9.5 3ZM4.5 9.5a5 5 0 1 1 10 0 5 5 0 0 1-10 0Z"
                clipRule="evenodd"
              />
            </svg>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onInputKey}
              placeholder="Type a command — Goals, Hooks, Sign out…"
              className="flex-1 bg-transparent text-sm text-fg placeholder:text-fg-subtle focus:outline-none"
            />
            <kbd className="rounded border border-border bg-bg px-1.5 py-0.5 font-mono text-[10px] text-fg-subtle">
              Esc
            </kbd>
          </div>

          <div className="max-h-[60vh] overflow-y-auto pb-2">
            {filtered.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-fg-subtle">
                No commands match &ldquo;{query}&rdquo;.
              </div>
            ) : (
              <>
                {renderGroup("Ask Lens", groups.ask)}
                {renderGroup("Navigate", groups.navigate)}
                {renderGroup("Account", groups.account)}
              </>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-border bg-bg/40 px-3 py-2 text-[10px] text-fg-subtle">
            <span>
              <kbd className="mr-1 rounded border border-border bg-bg px-1 py-0.5 font-mono">↑↓</kbd>
              navigate
              <kbd className="mx-1 rounded border border-border bg-bg px-1 py-0.5 font-mono">↵</kbd>
              run
            </span>
            <span className="font-mono">
              {pending ? "Working…" : `${filtered.length} command${filtered.length === 1 ? "" : "s"}`}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
