"use client";

import { useState, useTransition } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  setGoalStatus,
  recordGoalProgress,
  deleteGoal,
} from "./actions";

export type GoalRow = {
  id: string;
  title: string;
  kind: string;
  target_value: number | null;
  target_unit: string | null;
  target_date: string | null;
  baseline_value: number | null;
  current_value: number | null;
  current_updated_at: string | null;
  status: "active" | "paused" | "hit" | "missed";
  why_it_matters: string | null;
  action_plan: string | null;
  milestones: Array<{ title: string; target_date: string; hit_at?: string }>;
  source: string | null;
  created_at: string;
};

export function GoalsClient({ rows }: { rows: GoalRow[] }) {
  const [filter, setFilter] = useState<"active" | "all" | "hit" | "missed">("active");
  const [openId, setOpenId] = useState<string | null>(null);

  const filtered = rows.filter((r) => {
    if (filter === "all") return true;
    return r.status === filter;
  });

  const counts = {
    active: rows.filter((r) => r.status === "active").length,
    hit: rows.filter((r) => r.status === "hit").length,
    missed: rows.filter((r) => r.status === "missed").length,
    all: rows.length,
  };

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Chip
          active={filter === "active"}
          label={`Active (${counts.active})`}
          onClick={() => setFilter("active")}
        />
        <Chip
          active={filter === "hit"}
          label={`Hit (${counts.hit})`}
          onClick={() => setFilter("hit")}
        />
        <Chip
          active={filter === "missed"}
          label={`Missed (${counts.missed})`}
          onClick={() => setFilter("missed")}
        />
        <Chip
          active={filter === "all"}
          label={`All (${counts.all})`}
          onClick={() => setFilter("all")}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-bg-elevated/40 p-10 text-center text-fg-muted">
          {filter === "active"
            ? "No active goals. Ask Lens to set goals — try \"set goals from my audit\" — or finish onboarding."
            : "Nothing in this bucket yet."}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {filtered.map((g) => (
            <GoalCard
              key={g.id}
              goal={g}
              open={openId === g.id}
              onToggle={() => setOpenId(openId === g.id ? null : g.id)}
            />
          ))}
        </div>
      )}
    </>
  );
}

function GoalCard({
  goal,
  open,
  onToggle,
}: {
  goal: GoalRow;
  open: boolean;
  onToggle: () => void;
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const baseline = goal.baseline_value;
  const current = goal.current_value;
  const target = goal.target_value;

  const pct =
    baseline !== null && target !== null && current !== null && target !== baseline
      ? Math.max(
          0,
          Math.min(100, ((current - baseline) / (target - baseline)) * 100)
        )
      : null;

  const daysLeft = goal.target_date
    ? Math.ceil(
        (new Date(goal.target_date).getTime() - Date.now()) / 86_400_000
      )
    : null;

  const isOverdue = daysLeft !== null && daysLeft < 0 && goal.status === "active";

  return (
    <div
      className={
        "rounded-xl border p-5 transition " +
        (goal.status === "hit"
          ? "border-success/40 bg-success/5"
          : goal.status === "missed"
            ? "border-danger/40 bg-danger/5"
            : goal.status === "paused"
              ? "border-border bg-bg-elevated/40 opacity-70"
              : "border-border bg-bg-elevated/60")
      }
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span
              className={
                "rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider " +
                (goal.status === "active"
                  ? "bg-accent/15 text-accent"
                  : goal.status === "hit"
                    ? "bg-success/15 text-success"
                    : goal.status === "missed"
                      ? "bg-danger/15 text-danger"
                      : "bg-fg-subtle/15 text-fg-muted")
              }
            >
              {goal.status}
            </span>
            <span className="rounded-full bg-bg-subtle px-2 py-0.5 text-[10px] uppercase tracking-wider text-fg-muted">
              {goal.kind}
            </span>
            {isOverdue ? (
              <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[10px] uppercase text-warning">
                overdue
              </span>
            ) : null}
          </div>
          <h2 className="mt-2 font-display text-lg font-semibold leading-tight">
            {goal.title}
          </h2>
          {goal.why_it_matters ? (
            <p className="mt-1 text-sm text-fg-muted">{goal.why_it_matters}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onToggle}
          className="text-xs text-fg-muted hover:text-fg"
        >
          {open ? "Hide plan" : "Show plan"}
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Baseline" value={baseline?.toString() ?? "—"} />
        <Stat label="Current" value={current?.toString() ?? "—"} />
        <Stat label="Target" value={target?.toString() ?? "—"} sub={goal.target_unit ?? undefined} />
        <Stat
          label={isOverdue ? "Overdue by" : "Days left"}
          value={
            daysLeft === null ? "—" : isOverdue ? `${Math.abs(daysLeft)}d` : `${daysLeft}d`
          }
          sub={goal.target_date ?? undefined}
        />
      </div>

      {pct !== null ? (
        <div className="mt-4">
          <div className="mb-1 flex items-center justify-between text-[11px] text-fg-subtle">
            <span>Progress</span>
            <span className="font-mono">{pct.toFixed(0)}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-bg-subtle">
            <div
              className={
                "h-full rounded-full " +
                (goal.status === "hit"
                  ? "bg-success"
                  : pct >= 100
                    ? "bg-success"
                    : pct >= 50
                      ? "bg-accent"
                      : "bg-fg-subtle")
              }
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      ) : null}

      {goal.milestones && goal.milestones.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {goal.milestones.map((m, i) => (
            <span
              key={i}
              className={
                "rounded border px-2 py-1 text-[11px] " +
                (m.hit_at
                  ? "border-success/40 bg-success/10 text-success"
                  : "border-border bg-bg-subtle text-fg-muted")
              }
              title={m.target_date}
            >
              {m.hit_at ? "✓ " : ""}
              {m.title}
            </span>
          ))}
        </div>
      ) : null}

      {open && goal.action_plan ? (
        <div className="mt-5 border-t border-border pt-4">
          <div className="mb-2 text-xs uppercase tracking-wider text-fg-subtle">
            Action plan
          </div>
          <div className="prose prose-invert prose-sm max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {goal.action_plan}
            </ReactMarkdown>
          </div>
        </div>
      ) : null}

      {open ? (
        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border pt-4">
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              start(async () => {
                const next = prompt(
                  `Update current value (was ${current ?? "—"}):`,
                  current?.toString() ?? ""
                );
                if (next === null) return;
                const num = Number(next);
                if (!Number.isFinite(num) || num < 0) {
                  setErr("Need a non-negative number.");
                  return;
                }
                const r = await recordGoalProgress(goal.id, num);
                if (!r.ok) setErr(r.error ?? "Failed.");
                else setErr(null);
              });
            }}
            className="rounded border border-border bg-bg-subtle px-3 py-1.5 text-xs hover:border-accent"
          >
            Log progress
          </button>
          {goal.status === "active" ? (
            <>
              <button
                type="button"
                disabled={pending}
                onClick={() => start(async () => void (await setGoalStatus(goal.id, "hit")))}
                className="rounded border border-success/40 bg-success/10 px-3 py-1.5 text-xs text-success hover:bg-success/20"
              >
                Mark hit ✓
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => start(async () => void (await setGoalStatus(goal.id, "paused")))}
                className="rounded border border-border bg-bg-subtle px-3 py-1.5 text-xs hover:border-accent"
              >
                Pause
              </button>
            </>
          ) : null}
          {goal.status === "paused" ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => start(async () => void (await setGoalStatus(goal.id, "active")))}
              className="rounded border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs text-accent hover:bg-accent/20"
            >
              Resume
            </button>
          ) : null}
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (!confirm(`Delete "${goal.title}"?`)) return;
              start(async () => void (await deleteGoal(goal.id)));
            }}
            className="ml-auto rounded border border-border bg-bg-subtle px-3 py-1.5 text-xs text-fg-muted hover:border-danger hover:text-danger"
          >
            Delete
          </button>
          {err ? (
            <span className="w-full text-xs text-danger">{err}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-bg-subtle/50 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-fg-subtle">{label}</div>
      <div className="mt-0.5 font-mono text-sm font-semibold">{value}</div>
      {sub ? <div className="text-[10px] text-fg-muted">{sub}</div> : null}
    </div>
  );
}

function Chip({
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
