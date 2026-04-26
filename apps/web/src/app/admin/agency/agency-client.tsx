"use client";

import { useState, useTransition } from "react";
import {
  sendNudge,
  setUserTier,
  setTokenCap,
  resetTokenMeter,
} from "./actions";

export type AgencyRow = {
  id: string;
  email: string;
  display_name: string | null;
  tiktok_handle: string | null;
  tier: string;
  monthly_token_cap: number | null;
  monthly_tokens_used: number;
  created_at: string;
  niche: string | null;
  monetization_streams: string[];
  onboarded_at: string | null;
  last_message_at: string | null;
  message_count: number;
  videos_in_calendar: number;
  videos_posted_30d: number;
  brand_deals_open: number;
  brand_deals_total: number;
  live_shows_30d: number;
};

const TIERS = ["preorder", "founding", "vanguard", "admin"];

export function AgencyClient({ rows }: { rows: AgencyRow[] }) {
  const [filter, setFilter] = useState<"all" | "active" | "stale" | "stuck" | "preorder">(
    "active"
  );
  const [nudgeFor, setNudgeFor] = useState<AgencyRow | null>(null);

  const filtered = rows.filter((r) => {
    const stale = isStale(r);
    const stuck = isStuck(r);
    if (filter === "all") return true;
    if (filter === "preorder") return r.tier === "preorder";
    if (filter === "active") return r.tier === "vanguard" && !stale;
    if (filter === "stale") return r.tier === "vanguard" && stale;
    if (filter === "stuck") return r.tier === "vanguard" && stuck;
    return true;
  });

  const counts = {
    all: rows.length,
    active: rows.filter((r) => r.tier === "vanguard" && !isStale(r)).length,
    stale: rows.filter((r) => r.tier === "vanguard" && isStale(r)).length,
    stuck: rows.filter((r) => r.tier === "vanguard" && isStuck(r)).length,
    preorder: rows.filter((r) => r.tier === "preorder").length,
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <FilterChip
          active={filter === "active"}
          label={`Active (${counts.active})`}
          onClick={() => setFilter("active")}
        />
        <FilterChip
          active={filter === "stale"}
          label={`Stale (${counts.stale})`}
          onClick={() => setFilter("stale")}
        />
        <FilterChip
          active={filter === "stuck"}
          label={`Stuck (${counts.stuck})`}
          onClick={() => setFilter("stuck")}
        />
        <FilterChip
          active={filter === "preorder"}
          label={`Preorder waiting (${counts.preorder})`}
          onClick={() => setFilter("preorder")}
        />
        <FilterChip
          active={filter === "all"}
          label={`All (${counts.all})`}
          onClick={() => setFilter("all")}
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-bg-elevated text-left text-xs uppercase tracking-wider text-fg-subtle">
            <tr>
              <th className="px-4 py-3">Creator</th>
              <th className="px-4 py-3">Tier</th>
              <th className="px-4 py-3">Last Lens chat</th>
              <th className="px-4 py-3">7d activity</th>
              <th className="px-4 py-3">Tokens used</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-fg-muted">
                  No creators match this filter.
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <Row
                  key={r.id}
                  row={r}
                  onNudge={() => setNudgeFor(r)}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {nudgeFor ? (
        <NudgeModal row={nudgeFor} onClose={() => setNudgeFor(null)} />
      ) : null}
    </div>
  );
}

function isStale(r: AgencyRow): boolean {
  if (!r.last_message_at) return true;
  const days = (Date.now() - new Date(r.last_message_at).getTime()) / 86_400_000;
  return days > 4;
}

function isStuck(r: AgencyRow): boolean {
  // stuck = active in chat but not turning ideas into action
  if (!r.last_message_at) return false;
  const days = (Date.now() - new Date(r.last_message_at).getTime()) / 86_400_000;
  if (days > 4) return false; // they're stale, not stuck
  return r.message_count >= 5 && r.videos_posted_30d === 0 && r.videos_in_calendar < 3;
}

function Row({ row, onNudge }: { row: AgencyRow; onNudge: () => void }) {
  const [pending, start] = useTransition();
  const stale = isStale(row);
  const stuck = isStuck(row);

  return (
    <tr className="border-t border-border align-top hover:bg-bg-elevated/50">
      <td className="px-4 py-3">
        <div className="font-medium">
          {row.display_name || row.email}
          {stale ? (
            <span className="ml-2 rounded-full bg-warning/15 px-2 py-0.5 text-[10px] uppercase text-warning">
              stale
            </span>
          ) : null}
          {stuck ? (
            <span className="ml-2 rounded-full bg-danger/15 px-2 py-0.5 text-[10px] uppercase text-danger">
              stuck
            </span>
          ) : null}
        </div>
        <div className="text-xs text-fg-subtle">
          {row.email}
          {row.tiktok_handle ? (
            <>
              {" · "}
              <span className="font-mono">@{row.tiktok_handle}</span>
            </>
          ) : null}
        </div>
        {row.niche ? (
          <div className="mt-1 line-clamp-1 max-w-md text-xs text-fg-muted">
            {row.niche}
          </div>
        ) : null}
      </td>
      <td className="px-4 py-3">
        <select
          defaultValue={row.tier}
          disabled={pending}
          onChange={(e) => {
            const next = e.target.value;
            start(async () => {
              await setUserTier(row.id, next);
            });
          }}
          className="rounded border border-border bg-bg-elevated px-2 py-1 text-xs"
        >
          {TIERS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </td>
      <td className="px-4 py-3 text-xs text-fg-muted">
        {row.last_message_at ? timeAgo(row.last_message_at) : "never"}
        <div className="text-fg-subtle">
          {row.message_count} msgs total
        </div>
      </td>
      <td className="px-4 py-3 text-xs">
        <div>📅 {row.videos_in_calendar} in calendar</div>
        <div>📤 {row.videos_posted_30d} posted (30d)</div>
        <div>
          🔴 {row.live_shows_30d} live{" "}
          <span className="text-fg-subtle">{row.brand_deals_open}/{row.brand_deals_total} deals</span>
        </div>
      </td>
      <td className="px-4 py-3 text-xs">
        <div className="font-mono">
          {row.monthly_tokens_used.toLocaleString()} /{" "}
          {row.monthly_token_cap === null
            ? "∞"
            : row.monthly_token_cap.toLocaleString()}
        </div>
        <div className="mt-1 flex gap-1">
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              start(async () => {
                const next = prompt(
                  "Set monthly cap (number, blank for unlimited):",
                  row.monthly_token_cap?.toString() ?? ""
                );
                if (next === null) return;
                const parsed = next.trim() === "" ? null : Number(next);
                if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0)) return;
                await setTokenCap(row.id, parsed);
              });
            }}
            className="text-fg-subtle hover:text-accent"
          >
            cap
          </button>
          <span className="text-fg-subtle">·</span>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (!confirm(`Reset ${row.email}'s token meter?`)) return;
              start(async () => {
                await resetTokenMeter(row.id);
              });
            }}
            className="text-fg-subtle hover:text-warning"
          >
            reset
          </button>
        </div>
      </td>
      <td className="px-4 py-3">
        <button
          type="button"
          onClick={onNudge}
          disabled={row.tier !== "vanguard" && row.tier !== "admin"}
          className="rounded border border-accent/40 bg-accent/10 px-2 py-1 text-xs text-accent hover:bg-accent/20 disabled:opacity-30"
        >
          Send Lens nudge
        </button>
      </td>
    </tr>
  );
}

function NudgeModal({ row, onClose }: { row: AgencyRow; onClose: () => void }) {
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const presets = [
    `Hey — noticed you haven't checked in in a few days. Want me to pull your last 5 posts and find what's worth doubling down on?`,
    `Quick check: nothing in your calendar yet for this week. Want to throw 3 hooks at me and we'll pick which one to film first?`,
    `You've got ${row.brand_deals_open} brand pitch${row.brand_deals_open === 1 ? "" : "es"} sitting in your queue. Want to walk through them with me?`,
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-xl border border-border bg-bg-elevated p-6">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <div className="text-xs text-fg-subtle">Send Lens message to</div>
            <div className="font-medium">{row.email}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-fg-subtle hover:text-fg"
          >
            ✕
          </button>
        </div>
        <p className="mb-3 text-xs text-fg-subtle">
          Drops into their next /app/c/[id] load as if Lens sent it. Don&apos;t
          sound like an admin — sound like Lens.
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          placeholder="Hey — quick thought…"
          className="w-full rounded-lg border border-border bg-bg-subtle px-3 py-2 text-sm focus:border-accent focus:outline-none"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          {presets.map((p, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setText(p)}
              className="rounded border border-border bg-bg-subtle px-2 py-1 text-[11px] text-fg-muted hover:border-accent"
            >
              Preset {i + 1}
            </button>
          ))}
        </div>
        {err ? (
          <p className="mt-2 text-xs text-danger">{err}</p>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-border px-3 py-1.5 text-sm hover:bg-bg-subtle"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={pending || text.trim().length < 4}
            onClick={() => {
              start(async () => {
                const r = await sendNudge(row.id, text);
                if (!r.ok) setErr(r.error ?? "Failed.");
                else onClose();
              });
            }}
            className="btn-primary text-sm"
          >
            {pending ? "Sending…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}

function FilterChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-full border px-3 py-1 text-xs transition " +
        (active
          ? "border-accent/50 bg-accent/15 text-accent"
          : "border-border bg-bg-elevated text-fg-muted hover:border-border-subtle")
      }
    >
      {label}
    </button>
  );
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = ms / 60_000;
  if (m < 60) return `${Math.round(m)}m ago`;
  const h = m / 60;
  if (h < 24) return `${Math.round(h)}h ago`;
  const d = h / 24;
  if (d < 30) return `${Math.round(d)}d ago`;
  return new Date(iso).toLocaleDateString();
}
