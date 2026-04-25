"use client";

import { useState, useTransition } from "react";
import { createConversationFromPrompt } from "./conversations/actions";

const SUGGESTIONS = [
  "Generate 10 hooks for my next video",
  "Find trending posts in my niche this week",
  "Plan a 5-video series",
  "What's on deck in my calendar?",
];

export function DashboardComposer({ handle }: { handle: string | null }) {
  const [text, setText] = useState("");
  const [pending, start] = useTransition();

  function submit(message: string) {
    if (!message.trim() || pending) return;
    const fd = new FormData();
    fd.set("message", message);
    start(async () => {
      await createConversationFromPrompt(fd);
    });
  }

  return (
    <div className="rounded-2xl border border-border bg-bg-elevated/60 p-5 backdrop-blur">
      <h2 className="mb-1 font-display text-lg font-semibold tracking-tight">
        What should we work on{handle ? `, @${handle}` : ""}?
      </h2>
      <p className="mb-4 text-xs text-fg-subtle">
        Start a fresh chat or pick a quick prompt below.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(text);
        }}
        className="flex flex-col gap-3"
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit(text);
            }
          }}
          rows={2}
          disabled={pending}
          placeholder="Type anything — a hook idea, a TikTok URL, a brand DM, a comment to reply to…"
          className="w-full resize-none rounded-xl border border-border bg-bg px-4 py-3 text-sm text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none disabled:opacity-50"
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={pending || !text.trim()}
            className="btn-primary text-sm"
          >
            {pending ? "Starting…" : "Start chat →"}
          </button>
          <span className="text-[11px] text-fg-subtle">or pick:</span>
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              disabled={pending}
              onClick={() => submit(s)}
              className="rounded-full border border-border bg-bg px-3 py-1 text-xs text-fg-muted transition hover:border-accent/40 hover:text-fg disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>
      </form>
    </div>
  );
}
