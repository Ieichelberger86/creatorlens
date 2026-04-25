"use client";

import { useMemo, useState, useTransition } from "react";
import {
  createCalendarEntry,
  deleteCalendarEntry,
  markPosted,
  rescheduleEntry,
  updateCalendarStatus,
} from "./actions";

export type CalendarRow = {
  id: string;
  status: string;
  title: string;
  hook: string | null;
  script: string | null;
  notes: string | null;
  scheduled_for: string | null;
  posted_at: string | null;
  posted_url: string | null;
  created_at: string;
};

const STATUSES = [
  "idea",
  "drafting",
  "shooting",
  "edited",
  "scheduled",
  "posted",
  "cancelled",
] as const;

function fmt(d: string | null) {
  if (!d) return "(no date)";
  return new Date(d).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusPalette(status: string, urgent?: boolean): string {
  if (urgent) return "bg-danger/15 text-danger border-danger/30";
  switch (status) {
    case "posted":
      return "bg-success/15 text-success border-success/30";
    case "scheduled":
      return "bg-accent/15 text-accent border-accent/30";
    case "drafting":
    case "shooting":
    case "edited":
      return "bg-fg-muted/15 text-fg border-border-subtle";
    case "cancelled":
      return "bg-bg-elevated text-fg-subtle border-border line-through";
    default:
      return "bg-bg-elevated text-fg-muted border-border";
  }
}

export function CalendarClient({
  initial,
  loadError,
}: {
  initial: CalendarRow[];
  loadError: string | null;
}) {
  const [openCreate, setOpenCreate] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const groups = useMemo(() => groupRows(initial), [initial]);

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-8">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <div className="font-mono text-xs text-fg-subtle">/app/calendar</div>
          <h1 className="font-display text-3xl font-bold tracking-tight">
            Content calendar
          </h1>
        </div>
        <button
          type="button"
          className="btn-primary text-sm"
          onClick={() => setOpenCreate(true)}
        >
          + Add entry
        </button>
      </header>

      {loadError ? (
        <div className="card mb-6 border-danger/40 bg-danger/5 text-danger text-sm">
          {loadError}
        </div>
      ) : null}

      {initial.length === 0 ? (
        <EmptyState onCreate={() => setOpenCreate(true)} />
      ) : (
        <div className="space-y-10">
          {groups.today.length ? (
            <Group label="Today / Tomorrow" rows={groups.today} urgent onOpen={setOpenId} />
          ) : null}
          {groups.upcoming.length ? (
            <Group label="Upcoming" rows={groups.upcoming} onOpen={setOpenId} />
          ) : null}
          {groups.inProgress.length ? (
            <Group label="In progress" rows={groups.inProgress} onOpen={setOpenId} />
          ) : null}
          {groups.ideas.length ? (
            <Group label="Ideas" rows={groups.ideas} onOpen={setOpenId} />
          ) : null}
          {groups.posted.length ? (
            <Group label="Posted" rows={groups.posted} muted onOpen={setOpenId} />
          ) : null}
        </div>
      )}

      {openCreate ? (
        <CreateModal onClose={() => setOpenCreate(false)} />
      ) : null}
      {openId ? (
        <DetailModal
          entry={initial.find((r) => r.id === openId)!}
          onClose={() => setOpenId(null)}
        />
      ) : null}
    </main>
  );
}

function groupRows(rows: CalendarRow[]) {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const out = {
    today: [] as CalendarRow[],
    upcoming: [] as CalendarRow[],
    inProgress: [] as CalendarRow[],
    ideas: [] as CalendarRow[],
    posted: [] as CalendarRow[],
  };

  for (const r of rows) {
    if (r.status === "posted" || r.posted_at) {
      out.posted.push(r);
      continue;
    }
    if (r.status === "cancelled") continue;
    if (r.scheduled_for) {
      const ts = new Date(r.scheduled_for).getTime();
      if (ts - now <= 2 * dayMs && ts >= now - dayMs) {
        out.today.push(r);
      } else if (ts > now) {
        out.upcoming.push(r);
      } else {
        out.upcoming.push(r); // past-scheduled but not posted
      }
    } else if (["drafting", "shooting", "edited"].includes(r.status)) {
      out.inProgress.push(r);
    } else {
      out.ideas.push(r);
    }
  }
  return out;
}

function Group({
  label,
  rows,
  urgent,
  muted,
  onOpen,
}: {
  label: string;
  rows: CalendarRow[];
  urgent?: boolean;
  muted?: boolean;
  onOpen: (id: string) => void;
}) {
  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between">
        <h2
          className={`font-display text-lg font-semibold ${
            muted ? "text-fg-muted" : ""
          }`}
        >
          {label}
        </h2>
        <span className="font-mono text-xs text-fg-subtle">{rows.length}</span>
      </div>
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => onOpen(r.id)}
              className={`group flex w-full items-start gap-4 rounded-xl border border-border bg-bg-elevated px-4 py-3 text-left transition hover:border-border-subtle hover:bg-bg-subtle ${
                muted ? "opacity-70" : ""
              }`}
            >
              <span
                className={`mt-0.5 inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${statusPalette(
                  r.status,
                  urgent && r.status !== "posted"
                )}`}
              >
                {r.status}
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-medium">{r.title}</div>
                {r.hook ? (
                  <div className="mt-0.5 truncate text-sm text-fg-muted">
                    “{r.hook}”
                  </div>
                ) : null}
              </div>
              <div className="shrink-0 text-right font-mono text-xs text-fg-muted">
                {fmt(r.scheduled_for ?? r.posted_at)}
              </div>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="card text-center">
      <div className="mb-2 font-display text-xl font-semibold">
        Calendar is empty.
      </div>
      <p className="mb-6 text-sm text-fg-muted">
        Tell Lens to schedule something — &ldquo;queue this for Tuesday at
        6pm&rdquo; — and it&apos;ll show up here. Or add one manually.
      </p>
      <button onClick={onCreate} className="btn-primary text-sm">
        + Add entry
      </button>
    </div>
  );
}

function CreateModal({ onClose }: { onClose: () => void }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  return (
    <Modal onClose={onClose} title="New calendar entry">
      <form
        action={(form) => {
          setErr(null);
          start(async () => {
            const result = await createCalendarEntry(form);
            if (!result.ok) setErr(result.error ?? "Failed to save.");
            else onClose();
          });
        }}
        className="flex flex-col gap-4"
      >
        <Field label="Title" name="title" required placeholder="DSCR explainer #2" />
        <Field
          label="Hook"
          name="hook"
          placeholder='Banks rejected you? This loan doesn&apos;t care…'
        />
        <FieldArea
          label="Script (optional)"
          name="script"
          rows={4}
          placeholder="Full script if you have it."
        />
        <FieldArea
          label="Notes (optional)"
          name="notes"
          rows={2}
          placeholder="What you're trying, references, etc."
        />
        <Field
          label="Scheduled for (optional)"
          name="scheduled_for"
          type="datetime-local"
        />
        <label className="text-sm text-fg-muted">
          Status
          <select
            name="status"
            defaultValue=""
            className="mt-2 w-full rounded-lg border border-border bg-bg-elevated px-4 py-3 text-fg focus:border-accent focus:outline-none"
          >
            <option value="">auto (idea / scheduled)</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        {err ? <p className="text-sm text-danger">{err}</p> : null}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary text-sm">
            Cancel
          </button>
          <button type="submit" disabled={pending} className="btn-primary text-sm">
            {pending ? "Saving…" : "Save entry"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function DetailModal({
  entry,
  onClose,
}: {
  entry: CalendarRow;
  onClose: () => void;
}) {
  const [pending, start] = useTransition();
  const [postedUrl, setPostedUrl] = useState(entry.posted_url ?? "");
  const [reschedule, setReschedule] = useState(
    entry.scheduled_for ? toLocalInput(entry.scheduled_for) : ""
  );
  const [status, setStatus] = useState(entry.status);

  return (
    <Modal onClose={onClose} title={entry.title}>
      <div className="flex flex-col gap-4 text-sm">
        {entry.hook ? (
          <Block label="Hook">
            <div className="text-fg">&ldquo;{entry.hook}&rdquo;</div>
          </Block>
        ) : null}

        {entry.script ? (
          <Block label="Script">
            <pre className="whitespace-pre-wrap font-sans text-fg">{entry.script}</pre>
          </Block>
        ) : null}

        {entry.notes ? (
          <Block label="Notes">
            <div className="whitespace-pre-wrap text-fg">{entry.notes}</div>
          </Block>
        ) : null}

        <Block label="Status">
          <div className="flex items-center gap-2">
            <select
              value={status}
              onChange={(e) => {
                const next = e.target.value;
                setStatus(next);
                start(async () => {
                  await updateCalendarStatus(entry.id, next);
                });
              }}
              className="rounded-lg border border-border bg-bg-elevated px-3 py-2 text-fg focus:border-accent focus:outline-none"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            {pending ? <span className="text-xs text-fg-subtle">saving…</span> : null}
          </div>
        </Block>

        <Block label="Reschedule">
          <div className="flex items-center gap-2">
            <input
              type="datetime-local"
              value={reschedule}
              onChange={(e) => setReschedule(e.target.value)}
              className="rounded-lg border border-border bg-bg-elevated px-3 py-2 text-fg focus:border-accent focus:outline-none"
            />
            <button
              type="button"
              onClick={() =>
                start(async () => {
                  await rescheduleEntry(entry.id, reschedule);
                })
              }
              className="btn-secondary text-xs"
            >
              Save
            </button>
          </div>
        </Block>

        <Block label="Mark as posted">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="url"
              value={postedUrl}
              onChange={(e) => setPostedUrl(e.target.value)}
              placeholder="https://www.tiktok.com/@you/video/..."
              className="flex-1 rounded-lg border border-border bg-bg-elevated px-3 py-2 text-fg focus:border-accent focus:outline-none"
            />
            <button
              type="button"
              onClick={() =>
                start(async () => {
                  await markPosted(entry.id, postedUrl);
                  setStatus("posted");
                })
              }
              className="btn-primary text-xs"
            >
              Mark posted
            </button>
          </div>
        </Block>

        <div className="flex justify-between pt-4">
          <button
            type="button"
            onClick={() => {
              if (!confirm("Delete this entry? This can't be undone.")) return;
              start(async () => {
                await deleteCalendarEntry(entry.id);
                onClose();
              });
            }}
            className="text-xs text-danger hover:underline"
          >
            Delete entry
          </button>
          <button onClick={onClose} className="btn-secondary text-xs">
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card w-full max-w-xl max-h-[88dvh] overflow-y-auto"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">{title}</h2>
          <button
            onClick={onClose}
            aria-label="close"
            className="text-fg-muted hover:text-fg"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({
  label,
  name,
  ...rest
}: {
  label: string;
  name: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="text-sm text-fg-muted">
      {label}
      <input
        name={name}
        {...rest}
        className="mt-2 w-full rounded-lg border border-border bg-bg-elevated px-4 py-3 text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none"
      />
    </label>
  );
}

function FieldArea({
  label,
  name,
  ...rest
}: {
  label: string;
  name: string;
} & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <label className="text-sm text-fg-muted">
      {label}
      <textarea
        name={name}
        {...rest}
        className="mt-2 w-full resize-none rounded-lg border border-border bg-bg-elevated px-4 py-3 text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none"
      />
    </label>
  );
}

function Block({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 text-[10px] uppercase tracking-wider text-fg-subtle">
        {label}
      </div>
      {children}
    </div>
  );
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}
