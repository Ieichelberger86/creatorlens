"use client";

import { useEffect, useRef, useState, useTransition } from "react";

type Message = {
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

export type InitialConversation = {
  conversationId: string | null;
  messages: Message[];
};

export function ChatClient({ initial }: { initial: InitialConversation }) {
  const [conversationId, setConversationId] = useState<string | null>(
    initial.conversationId
  );
  const [messages, setMessages] = useState<Message[]>(initial.messages);
  const [draft, setDraft] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, pending]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || pending) return;
    setErr(null);

    const optimistic: Message = {
      role: "user",
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setDraft("");

    start(async () => {
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ conversation_id: conversationId, message: text }),
        });
        if (res.status === 429) {
          const body = (await res.json().catch(() => ({}))) as {
            resets_at?: string;
          };
          const resetDate = body.resets_at
            ? new Date(body.resets_at).toLocaleDateString(undefined, {
                month: "long",
                day: "numeric",
              })
            : "the start of next month";
          throw new Error(
            `You've used this month's Lens budget. Resets ${resetDate}. Reach out to ian@iepropertymgmt.com if you need more headroom now.`
          );
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.detail || body.error || `HTTP ${res.status}`);
        }
        const data = (await res.json()) as {
          conversation_id: string;
          reply: string;
        };
        setConversationId(data.conversation_id);
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.reply,
            created_at: new Date().toISOString(),
          },
        ]);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    });
  }

  const empty = messages.length === 0;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-4">
      <div className="flex-1 overflow-y-auto py-8">
        {empty ? (
          <div className="mx-auto mt-12 max-w-xl text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-bg-elevated px-3 py-1 text-xs text-fg-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-accent animate-glow" />
              Lens is listening
            </div>
            <h1 className="font-display text-3xl font-bold tracking-tight">
              Hey. Tell me about the creator behind this account.
            </h1>
            <p className="mt-3 text-sm text-fg-muted">
              Start with your TikTok handle, your niche in your own words, and
              what &quot;winning&quot; looks like over the next 90 days. I&apos;ll
              build from there.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {messages.map((m, i) => (
              <MessageRow key={i} m={m} />
            ))}
            {pending ? (
              <div className="text-sm text-fg-muted">
                <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-accent" />
                Lens is thinking…
              </div>
            ) : null}
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={submit}
        className="sticky bottom-0 mt-2 border-t border-border bg-bg/80 py-4 backdrop-blur"
      >
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit(e as unknown as React.FormEvent);
              }
            }}
            rows={1}
            placeholder="Message Lens — niche, a video URL, a hook idea, a comment block…"
            className="max-h-[40dvh] min-h-[48px] flex-1 resize-none rounded-xl border border-border bg-bg-elevated px-4 py-3 text-sm text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none"
          />
          <button
            type="submit"
            disabled={pending || !draft.trim()}
            className="btn-primary h-[48px] px-5"
          >
            {pending ? "…" : "Send"}
          </button>
        </div>
        {err ? (
          <p className="mt-2 text-xs text-danger">Error: {err}</p>
        ) : null}
        <p className="mt-2 text-center text-[10px] text-fg-subtle">
          Lens drafts. You ship. Nothing is published without your say-so.
        </p>
      </form>
    </main>
  );
}

function MessageRow({ m }: { m: Message }) {
  const isUser = m.role === "user";
  return (
    <div className={isUser ? "flex justify-end" : "flex justify-start"}>
      <div
        className={
          isUser
            ? "max-w-[85%] rounded-2xl rounded-br-md bg-accent/20 px-4 py-3 text-sm"
            : "max-w-[85%] rounded-2xl rounded-bl-md border border-border bg-bg-elevated px-4 py-3 text-sm"
        }
      >
        <div className="whitespace-pre-wrap leading-relaxed">{m.content}</div>
      </div>
    </div>
  );
}
