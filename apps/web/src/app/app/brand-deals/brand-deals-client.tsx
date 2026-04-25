"use client";

import { useMemo, useState, useTransition } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  submitBrandDealForReview,
  updateBrandDealStatus,
  deleteBrandDeal,
} from "./actions";

export type BrandDealRow = {
  id: string;
  status: string;
  verdict: string | null;
  brand_name: string | null;
  contact: string | null;
  offer_text: string;
  offer_amount_cents: number | null;
  currency: string | null;
  deliverables: Record<string, unknown> | null;
  deadlines: Record<string, unknown> | null;
  exclusivity: string | null;
  usage_rights: string | null;
  red_flags: string[] | null;
  green_flags: string[] | null;
  ai_summary: string | null;
  ai_recommended_response: string | null;
  created_at: string;
};

const STATUS_OPTIONS = [
  "pending",
  "reviewed",
  "negotiating",
  "accepted",
  "declined",
  "expired",
] as const;

function verdictPalette(v: string | null): string {
  switch (v) {
    case "looks_legit":
      return "bg-success/15 text-success border-success/30";
    case "negotiate":
      return "bg-accent/15 text-accent border-accent/30";
    case "high_risk":
      return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    case "walk_away":
      return "bg-danger/15 text-danger border-danger/30";
    default:
      return "bg-bg-elevated text-fg-muted border-border";
  }
}

function verdictLabel(v: string | null): string {
  switch (v) {
    case "looks_legit": return "looks legit";
    case "negotiate": return "negotiate";
    case "high_risk": return "high risk";
    case "walk_away": return "walk away";
    default: return "pending";
  }
}

export function BrandDealsClient({
  initial,
  loadError,
}: {
  initial: BrandDealRow[];
  loadError: string | null;
}) {
  const [openSubmit, setOpenSubmit] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const out = {
      needsAction: [] as BrandDealRow[],
      reviewed: [] as BrandDealRow[],
      done: [] as BrandDealRow[],
    };
    for (const d of initial) {
      if (["accepted", "declined", "expired"].includes(d.status)) {
        out.done.push(d);
      } else if (d.verdict && ["walk_away", "high_risk"].includes(d.verdict)) {
        out.needsAction.push(d);
      } else {
        out.reviewed.push(d);
      }
    }
    return out;
  }, [initial]);

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <div className="font-mono text-xs text-fg-subtle">/app/brand-deals</div>
          <h1 className="font-display text-3xl font-bold tracking-tight">
            Brand deals
          </h1>
          <p className="mt-1 text-sm text-fg-muted">
            Paste any offer — Lens checks for scams, summarizes the terms, and
            drafts your response.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpenSubmit(true)}
          className="btn-primary text-sm"
        >
          + Review a deal
        </button>
      </header>

      {loadError ? (
        <div className="card mb-6 border-danger/40 bg-danger/5 text-danger text-sm">
          {loadError}
        </div>
      ) : null}

      {initial.length === 0 ? (
        <EmptyState onSubmit={() => setOpenSubmit(true)} />
      ) : (
        <div className="space-y-10">
          {grouped.needsAction.length ? (
            <Group label="Needs your attention" rows={grouped.needsAction} onOpen={setOpenId} />
          ) : null}
          {grouped.reviewed.length ? (
            <Group label="Reviewed" rows={grouped.reviewed} onOpen={setOpenId} />
          ) : null}
          {grouped.done.length ? (
            <Group label="Closed" rows={grouped.done} muted onOpen={setOpenId} />
          ) : null}
        </div>
      )}

      {openSubmit ? <SubmitModal onClose={() => setOpenSubmit(false)} /> : null}
      {openId ? (
        <DetailModal
          deal={initial.find((d) => d.id === openId)!}
          onClose={() => setOpenId(null)}
        />
      ) : null}
    </main>
  );
}

function EmptyState({ onSubmit }: { onSubmit: () => void }) {
  return (
    <div className="card text-center">
      <div className="mb-2 text-3xl">🤝</div>
      <div className="mb-2 font-display text-xl font-semibold">
        Vet every brand deal that lands in your DMs.
      </div>
      <p className="mx-auto mb-6 max-w-md text-sm text-fg-muted">
        Lens flags scams (upfront fees, crypto payment, vague brands), extracts
        the real terms, and drafts your reply in your voice. Paste a pitch
        here, or just send it to Lens in chat — &ldquo;is this legit?&rdquo;
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <button onClick={onSubmit} className="btn-primary text-sm">
          + Review a deal
        </button>
        <a href="/app" className="btn-secondary text-sm">
          Paste in chat instead
        </a>
      </div>
    </div>
  );
}

function Group({
  label,
  rows,
  muted,
  onOpen,
}: {
  label: string;
  rows: BrandDealRow[];
  muted?: boolean;
  onOpen: (id: string) => void;
}) {
  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className={`font-display text-lg font-semibold ${muted ? "text-fg-muted" : ""}`}>
          {label}
        </h2>
        <span className="font-mono text-xs text-fg-subtle">{rows.length}</span>
      </div>
      <ul className="space-y-2">
        {rows.map((d) => (
          <li key={d.id}>
            <button
              type="button"
              onClick={() => onOpen(d.id)}
              className={
                "group flex w-full items-start gap-4 rounded-xl border border-border bg-bg-elevated px-4 py-3 text-left transition hover:border-border-subtle hover:bg-bg-subtle " +
                (muted ? "opacity-70" : "")
              }
            >
              <span
                className={`mt-0.5 inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${verdictPalette(d.verdict)}`}
              >
                {verdictLabel(d.verdict)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-medium">
                  {d.brand_name ?? "(unknown brand)"}
                </div>
                <div className="mt-0.5 truncate text-xs text-fg-muted">
                  {d.contact ?? "(no contact)"} ·{" "}
                  {d.offer_amount_cents
                    ? `$${(d.offer_amount_cents / 100).toLocaleString()}`
                    : "no cash listed"}
                </div>
              </div>
              <div className="shrink-0 text-right font-mono text-xs text-fg-muted">
                {new Date(d.created_at).toLocaleDateString()}
              </div>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SubmitModal({ onClose }: { onClose: () => void }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  return (
    <Modal onClose={onClose} title="Paste a brand pitch">
      <form
        action={(form) => {
          setErr(null);
          start(async () => {
            const result = await submitBrandDealForReview(form);
            if (!result.ok) setErr(result.error ?? "Review failed.");
            else onClose();
          });
        }}
        className="flex flex-col gap-4"
      >
        <p className="text-xs text-fg-muted">
          Paste the entire email, DM, or message exactly as you got it. Don&apos;t
          edit. Lens needs the original to spot scam patterns. Takes ~20s.
        </p>
        <Field
          label="Brand name (optional, your best guess)"
          name="brand_name_hint"
          placeholder="e.g. Glossier, AG1, etc."
        />
        <FieldArea
          label="Full offer text"
          name="offer_text"
          required
          rows={10}
          placeholder={`Hey [creator]! We're reaching out from [Brand] — we'd love to send you a free PR package in exchange for...`}
        />
        {err ? <p className="text-sm text-danger">{err}</p> : null}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary text-sm">
            Cancel
          </button>
          <button type="submit" disabled={pending} className="btn-primary text-sm">
            {pending ? "Reviewing… (~20s)" : "Review deal"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function DetailModal({
  deal,
  onClose,
}: {
  deal: BrandDealRow;
  onClose: () => void;
}) {
  const [pending, start] = useTransition();
  const [status, setStatus] = useState(deal.status);
  const [copied, setCopied] = useState(false);

  return (
    <Modal
      onClose={onClose}
      title={deal.brand_name ?? "Brand deal review"}
      wide
    >
      <div className="flex flex-col gap-5 text-sm">
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs uppercase tracking-wider ${verdictPalette(deal.verdict)}`}
          >
            {verdictLabel(deal.verdict)}
          </span>
          {deal.contact ? (
            <span className="font-mono text-xs text-fg-muted">
              {deal.contact}
            </span>
          ) : null}
          {deal.offer_amount_cents ? (
            <span className="font-mono text-xs text-fg-muted">
              ${(deal.offer_amount_cents / 100).toLocaleString()} {(deal.currency ?? "usd").toUpperCase()}
            </span>
          ) : null}
        </div>

        {deal.ai_summary ? (
          <div className="prose prose-sm prose-invert max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {deal.ai_summary}
            </ReactMarkdown>
          </div>
        ) : null}

        {deal.ai_recommended_response ? (
          <div className="rounded-xl border border-border bg-bg-subtle p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-[10px] uppercase tracking-wider text-fg-subtle">
                Recommended response (in your voice)
              </div>
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(deal.ai_recommended_response ?? "");
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
                className="text-xs text-accent hover:text-accent-hover"
              >
                {copied ? "✓ Copied" : "Copy"}
              </button>
            </div>
            <div className="whitespace-pre-wrap text-fg">
              {deal.ai_recommended_response}
            </div>
          </div>
        ) : null}

        <details className="rounded-xl border border-border bg-bg-elevated">
          <summary className="cursor-pointer px-4 py-3 text-xs uppercase tracking-wider text-fg-subtle">
            Original offer text
          </summary>
          <pre className="whitespace-pre-wrap px-4 pb-4 font-sans text-xs text-fg-muted">
            {deal.offer_text}
          </pre>
        </details>

        <div className="flex flex-wrap items-center gap-2 pt-2">
          <span className="text-xs text-fg-muted">Status:</span>
          <select
            value={status}
            onChange={(e) => {
              const next = e.target.value;
              setStatus(next);
              start(async () => {
                await updateBrandDealStatus(deal.id, next);
              });
            }}
            className="rounded-lg border border-border bg-bg-elevated px-3 py-1.5 text-xs text-fg focus:border-accent focus:outline-none"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          {pending ? (
            <span className="text-xs text-fg-subtle">saving…</span>
          ) : null}
          <div className="ml-auto">
            <button
              type="button"
              onClick={() => {
                if (!confirm("Delete this brand deal review?")) return;
                start(async () => {
                  await deleteBrandDeal(deal.id);
                  onClose();
                });
              }}
              className="text-xs text-danger hover:underline"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={
          "card max-h-[88dvh] w-full overflow-y-auto " +
          (wide ? "max-w-2xl" : "max-w-xl")
        }
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
