"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { saveDraftToCalendar } from "./conversations/actions";

type ToolCall = {
  id: string;
  name: string;
  input: unknown;
  status: "running" | "done";
  preview?: string;
  output?: string;
};

type Message = {
  role: "user" | "assistant";
  content: string;
  created_at: string;
  toolCalls?: ToolCall[];
};

export type InitialConversation = {
  conversationId: string | null;
  messages: Message[];
};

const TOOL_LABEL: Record<string, string> = {
  generate_hooks: "Brainstorming hooks",
  draft_script: "Writing the script",
  find_trends: "Scanning trending posts",
  analyze_tiktok_video: "Pulling video transcript + stats",
  mine_comments: "Scraping comments",
  post_mortem: "Running the post-mortem",
  schedule_content: "Adding to your calendar",
  list_calendar: "Reading your calendar",
  update_calendar_entry: "Updating calendar entry",
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
  }, [messages, pending]);

  function send(text: string) {
    if (!text || pending) return;
    setErr(null);

    const userMsg: Message = {
      role: "user",
      content: text,
      created_at: new Date().toISOString(),
    };
    const assistantMsg: Message = {
      role: "assistant",
      content: "",
      created_at: new Date().toISOString(),
      toolCalls: [],
    };
    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setDraft("");

    start(async () => {
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            conversation_id: conversationId,
            message: text,
          }),
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
        if (!res.ok || !res.body) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.detail || body.error || `HTTP ${res.status}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let nl;
          // eslint-disable-next-line no-cond-assign
          while ((nl = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, nl).trim();
            buffer = buffer.slice(nl + 1);
            if (!line) continue;
            try {
              const event = JSON.parse(line) as ServerEvent;
              applyEvent(event, setMessages, setConversationId);
            } catch {
              // ignore parse errors on partial JSON
            }
          }
        }
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
        // Roll back the optimistic assistant placeholder if the request died
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant" && !last.content && !(last.toolCalls?.length)) {
            return prev.slice(0, -1);
          }
          return prev;
        });
      }
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    send(draft.trim());
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
              <MessageRow
                key={i}
                m={m}
                conversationId={conversationId}
                onSend={send}
              />
            ))}
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

type ServerEvent =
  | { type: "conversation"; conversation_id: string }
  | { type: "iteration"; index: number }
  | { type: "text_delta"; delta: string }
  | { type: "tool_use_start"; name: string; input: unknown; id: string }
  | { type: "tool_use_end"; id: string; output: string }
  | { type: "done"; result: unknown }
  | { type: "error"; detail: string };

function applyEvent(
  event: ServerEvent,
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>,
  setConversationId: React.Dispatch<React.SetStateAction<string | null>>
) {
  if (event.type === "conversation") {
    setConversationId(event.conversation_id);
    return;
  }
  if (event.type === "error") {
    setMessages((prev) => {
      const updated = [...prev];
      const last = updated[updated.length - 1];
      if (last?.role === "assistant") {
        updated[updated.length - 1] = {
          ...last,
          content: `(Lens errored: ${event.detail})`,
        };
      }
      return updated;
    });
    return;
  }
  if (event.type === "iteration") return;

  if (event.type === "text_delta") {
    setMessages((prev) => {
      const updated = [...prev];
      const last = updated[updated.length - 1];
      if (last?.role === "assistant") {
        updated[updated.length - 1] = {
          ...last,
          content: last.content + event.delta,
        };
      }
      return updated;
    });
    return;
  }

  if (event.type === "tool_use_start") {
    setMessages((prev) => {
      const updated = [...prev];
      const last = updated[updated.length - 1];
      if (last?.role === "assistant") {
        const toolCalls = [
          ...(last.toolCalls ?? []),
          {
            id: event.id,
            name: event.name,
            input: event.input,
            status: "running" as const,
          },
        ];
        updated[updated.length - 1] = { ...last, toolCalls };
      }
      return updated;
    });
    return;
  }

  if (event.type === "tool_use_end") {
    setMessages((prev) => {
      const updated = [...prev];
      const last = updated[updated.length - 1];
      if (last?.role === "assistant" && last.toolCalls) {
        const toolCalls = last.toolCalls.map((c) =>
          c.id === event.id
            ? {
                ...c,
                status: "done" as const,
                preview: event.output.slice(0, 120),
                output: event.output,
              }
            : c
        );
        updated[updated.length - 1] = { ...last, toolCalls };
      }
      return updated;
    });
    return;
  }
}

function MessageRow({
  m,
  conversationId,
  onSend,
}: {
  m: Message;
  conversationId: string | null;
  onSend: (text: string) => void;
}) {
  const isUser = m.role === "user";
  const hasContent = m.content.length > 0;
  const showThinking =
    !isUser && !hasContent && (!m.toolCalls || m.toolCalls.length === 0);

  return (
    <div className={isUser ? "flex justify-end" : "flex justify-start"}>
      <div
        className={
          isUser
            ? "max-w-[85%] rounded-2xl rounded-br-md bg-accent/20 px-4 py-3 text-sm"
            : "max-w-[85%] space-y-2"
        }
      >
        {isUser ? (
          <div className="whitespace-pre-wrap leading-relaxed">{m.content}</div>
        ) : (
          <>
            {m.toolCalls?.map((c) => <ToolPill key={c.id} call={c} />)}
            {showThinking ? (
              <div className="rounded-2xl rounded-bl-md border border-border bg-bg-elevated px-4 py-3 text-sm text-fg-muted">
                <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-accent" />
                Lens is thinking…
              </div>
            ) : null}
            {hasContent ? (
              <div className="rounded-2xl rounded-bl-md border border-border bg-bg-elevated px-4 py-3 text-sm">
                <div className="prose prose-sm prose-invert max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {m.content}
                  </ReactMarkdown>
                </div>
              </div>
            ) : null}
            {/* Quick-action chains: render cards based on completed tool calls */}
            {m.toolCalls
              ?.filter((c) => c.status === "done" && c.output)
              .map((c) => (
                <ToolActions
                  key={"actions-" + c.id}
                  call={c}
                  conversationId={conversationId}
                  onSend={onSend}
                />
              ))}
          </>
        )}
      </div>
    </div>
  );
}

function ToolActions({
  call,
  conversationId,
  onSend,
}: {
  call: ToolCall;
  conversationId: string | null;
  onSend: (text: string) => void;
}) {
  if (call.name === "generate_hooks" && call.output) {
    const hooks = parseHooks(call.output);
    if (hooks.length === 0) return null;
    return (
      <div className="rounded-xl border border-border bg-bg-subtle p-3">
        <div className="mb-2 text-[10px] uppercase tracking-wider text-fg-subtle">
          Pick a hook → write the script
        </div>
        <div className="flex flex-col gap-2">
          {hooks.slice(0, 10).map((h, i) => (
            <button
              key={i}
              type="button"
              onClick={() =>
                onSend(`Write a 30-second script for this hook:\n"${h}"`)
              }
              className="group flex items-start gap-3 rounded-lg border border-border bg-bg-elevated px-3 py-2 text-left text-sm transition hover:border-accent/40 hover:bg-bg"
            >
              <span className="mt-0.5 font-mono text-xs text-fg-subtle">{i + 1}.</span>
              <span className="flex-1 text-fg-muted group-hover:text-fg">{h}</span>
              <span className="hidden text-xs text-accent group-hover:inline">
                Write script →
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (call.name === "draft_script" && call.output) {
    const hookFromScript = parseHookFromScript(call.output);
    return (
      <SaveScriptButton
        conversationId={conversationId}
        hook={hookFromScript ?? null}
        script={call.output}
      />
    );
  }

  return null;
}

function parseHooks(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*(?:\*\*)?(\d+)\.?\s*(?:\*\*)?\s*[*•\-]?\s*(.+?)(?:\*\*)?\s*$/);
    if (m && m[2]) {
      const cleaned = m[2]
        .replace(/^\*\*|\*\*$/g, "")
        .replace(/^["']|["']$/g, "")
        .trim();
      if (cleaned.length > 5 && cleaned.length < 200) out.push(cleaned);
    }
  }
  return out;
}

function parseHookFromScript(text: string): string | null {
  // Scripts start with HOOK (0–2s) or similar header followed by the line
  const m = text.match(/HOOK[^\n]*\n+([^\n]+)/i);
  return m?.[1]?.trim().replace(/^["']|["']$/g, "") ?? null;
}

function SaveScriptButton({
  conversationId,
  hook,
  script,
}: {
  conversationId: string | null;
  hook: string | null;
  script: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState<string | null>(null);
  const [title, setTitle] = useState(hook ? hook.slice(0, 80) : "New script");
  const [scheduled, setScheduled] = useState("");
  const [err, setErr] = useState<string | null>(null);

  if (saved) {
    return (
      <div className="rounded-xl border border-success/30 bg-success/5 p-3 text-xs text-success">
        ✓ Saved to your calendar.{" "}
        <a
          href="/app/calendar"
          className="underline hover:text-success/80"
        >
          Open calendar
        </a>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-secondary text-xs"
      >
        + Save this script to calendar
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-bg-subtle p-3">
      <div className="mb-2 text-[10px] uppercase tracking-wider text-fg-subtle">
        Save script to calendar
      </div>
      <div className="flex flex-col gap-2 text-sm">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          className="rounded-lg border border-border bg-bg-elevated px-3 py-2 text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none"
        />
        <input
          type="datetime-local"
          value={scheduled}
          onChange={(e) => setScheduled(e.target.value)}
          className="rounded-lg border border-border bg-bg-elevated px-3 py-2 text-fg focus:border-accent focus:outline-none"
        />
        <p className="text-[10px] text-fg-subtle">
          Leave date empty to save as an idea.
        </p>
        {err ? <p className="text-xs text-danger">{err}</p> : null}
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="btn-secondary text-xs"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={pending || !title.trim()}
            onClick={() => {
              setErr(null);
              start(async () => {
                const result = await saveDraftToCalendar({
                  title: title.trim(),
                  hook,
                  script,
                  scheduledFor: scheduled || null,
                  sourceConversationId: conversationId,
                });
                if (result.ok) setSaved(result.id ?? "saved");
                else setErr(result.error ?? "Save failed");
              });
            }}
            className="btn-primary text-xs"
          >
            {pending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ToolPill({ call }: { call: ToolCall }) {
  const label = TOOL_LABEL[call.name] ?? call.name;
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-border bg-bg-elevated px-3 py-1 text-xs text-fg-muted">
      {call.status === "running" ? (
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
      ) : (
        <span className="h-1.5 w-1.5 rounded-full bg-success" />
      )}
      <span>{label}</span>
      {call.status === "done" ? (
        <span className="text-fg-subtle">· done</span>
      ) : null}
    </div>
  );
}
