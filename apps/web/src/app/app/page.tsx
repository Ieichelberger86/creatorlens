import { redirect } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/supabase/server";
import { DashboardComposer } from "./dashboard-composer";

export const dynamic = "force-dynamic";

type GoalRow = {
  id: string;
  title: string;
  kind: string;
  baseline_value: number | null;
  current_value: number | null;
  target_value: number | null;
  target_unit: string | null;
  target_date: string | null;
  why_it_matters: string | null;
  action_plan: string | null;
};

type CalRow = {
  id: string;
  title: string;
  scheduled_for: string | null;
  status: string;
  hook: string | null;
};

type ConvRow = {
  id: string;
  title: string | null;
  last_message_at: string;
  messages: Array<{ role: string; content: string }> | null;
};

type PendingRow = {
  id: string;
  source: string;
  payload: { content?: string };
  created_at: string;
};

export default async function LensAppPage() {
  const user = await getSessionUser();
  if (!user) return null;

  const admin = supabaseAdmin();

  // Onboarding gate: bounce to form/running page if not done
  const { data: profile } = await admin
    .from("creator_profile")
    .select("niche, onboarded_at")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profile?.onboarded_at) {
    if (profile?.niche) redirect("/app/onboarding/running" as Route);
    redirect("/app/onboarding" as Route);
  }

  const sevenDaysFromNow = new Date(Date.now() + 7 * 86_400_000).toISOString();
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();

  const [
    userRowRes,
    goalsRes,
    calendarRes,
    pendingRes,
    convsRes,
    toolStatsRes,
    postedCountRes,
    livesCountRes,
  ] = await Promise.all([
    admin
      .from("users")
      .select("tiktok_handle, display_name")
      .eq("id", user.id)
      .maybeSingle(),
    admin
      .from("goals")
      .select(
        "id, title, kind, baseline_value, current_value, target_value, target_unit, target_date, why_it_matters, action_plan"
      )
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("target_date", { ascending: true })
      .limit(3),
    admin
      .from("content_calendar")
      .select("id, title, scheduled_for, status, hook")
      .eq("user_id", user.id)
      .gte("scheduled_for", new Date().toISOString())
      .lte("scheduled_for", sevenDaysFromNow)
      .order("scheduled_for", { ascending: true })
      .limit(8),
    admin
      .from("pending_lens_messages")
      .select("id, source, payload, created_at")
      .eq("user_id", user.id)
      .is("delivered_at", null)
      .order("created_at", { ascending: false })
      .limit(5),
    admin
      .from("conversations")
      .select("id, title, last_message_at, messages")
      .eq("user_id", user.id)
      .eq("channel", "web")
      .order("last_message_at", { ascending: false })
      .limit(6),
    admin
      .from("tool_runs")
      .select("tool_name")
      .eq("user_id", user.id)
      .gte("created_at", sevenDaysAgo),
    admin
      .from("content_calendar")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("posted_at", sevenDaysAgo),
    admin
      .from("live_shows")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("ended_at", sevenDaysAgo),
  ]);

  const userRow = userRowRes.data;
  const goals = (goalsRes.data ?? []) as GoalRow[];
  const upcoming = (calendarRes.data ?? []) as CalRow[];
  const pending = (pendingRes.data ?? []) as PendingRow[];
  const convs = (convsRes.data ?? []) as ConvRow[];

  // Aggregate tool counts by name
  const toolCounts = new Map<string, number>();
  for (const r of toolStatsRes.data ?? []) {
    const t = (r as { tool_name: string }).tool_name;
    toolCounts.set(t, (toolCounts.get(t) ?? 0) + 1);
  }
  const stat = (name: string) => toolCounts.get(name) ?? 0;
  const postedCount = postedCountRes.count ?? 0;
  const livesCount = livesCountRes.count ?? 0;

  const handle = userRow?.tiktok_handle ?? null;
  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
      <header className="mb-6">
        <div className="font-mono text-xs text-fg-subtle">{today}</div>
        <h1 className="mt-1 font-display text-3xl font-bold tracking-tight">
          Welcome back{userRow?.display_name ? `, ${userRow.display_name}` : ""}.
        </h1>
      </header>

      <div className="mb-8">
        <DashboardComposer handle={handle} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section>
          <SectionHead title="Active goals" link={{ href: "/app/goals", label: "All goals →" }} />
          {goals.length === 0 ? (
            <EmptyCard
              icon="🎯"
              text="No active goals yet."
              cta="Set my goals"
              href="/app/goals"
            />
          ) : (
            <div className="flex flex-col gap-3">
              {goals.map((g) => (
                <GoalCard key={g.id} g={g} />
              ))}
            </div>
          )}
        </section>

        <section>
          <SectionHead
            title="Lens has thoughts"
            sub={pending.length === 0 ? undefined : "Open chat to see in full."}
          />
          {pending.length === 0 ? (
            <div className="rounded-xl border border-border bg-bg-elevated/40 p-5 text-center text-xs text-fg-subtle">
              Nothing waiting. Lens scans hourly — new alerts will land here.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {pending.map((p) => (
                <NudgeCard key={p.id} p={p} />
              ))}
            </div>
          )}
        </section>

        <section>
          <SectionHead
            title="On deck (next 7 days)"
            link={{ href: "/app/calendar", label: "Open calendar →" }}
          />
          {upcoming.length === 0 ? (
            <EmptyCard
              icon="📅"
              text="Nothing scheduled in the next 7 days."
              cta="Plan content"
              href="/app/calendar"
            />
          ) : (
            <div className="flex flex-col gap-2">
              {upcoming.map((c) => (
                <CalendarRow key={c.id} c={c} />
              ))}
            </div>
          )}
        </section>

        <section>
          <SectionHead title="Last 7 days" />
          <div className="rounded-xl border border-border bg-bg-elevated/40 p-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Stat label="Posted" value={postedCount} icon="📤" />
              <Stat label="Hooks" value={stat("generate_hooks")} icon="🎣" />
              <Stat label="Trends" value={stat("find_trends")} icon="📈" />
              <Stat label="Post-mortems" value={stat("post_mortem")} icon="🔍" />
              <Stat label="Lives" value={livesCount} icon="🔴" />
              <Stat label="Deals reviewed" value={stat("review_brand_deal")} icon="🤝" />
            </div>
          </div>
        </section>
      </div>

      <section className="mt-10">
        <SectionHead
          title="Recent chats"
          sub={
            convs.length > 0
              ? "Pick up where you left off."
              : "No chats yet — start one above."
          }
        />
        {convs.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {convs.map((c) => (
              <Link
                key={c.id}
                href={`/app/c/${c.id}` as Route}
                className="group flex items-center justify-between rounded-lg border border-border bg-bg-elevated/40 px-4 py-3 transition hover:border-accent/40 hover:bg-bg-elevated"
              >
                <span className="truncate text-sm text-fg group-hover:text-accent">
                  {c.title ?? firstUserMessage(c.messages) ?? "New chat"}
                </span>
                <span className="ml-3 shrink-0 font-mono text-[10px] text-fg-subtle">
                  {timeAgo(c.last_message_at)}
                </span>
              </Link>
            ))}
          </div>
        ) : null}
      </section>
    </main>
  );
}

function SectionHead({
  title,
  sub,
  link,
}: {
  title: string;
  sub?: string;
  link?: { href: string; label: string };
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-2">
      <div>
        <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-fg-muted">
          {title}
        </h2>
        {sub ? (
          <p className="mt-0.5 text-[11px] text-fg-subtle">{sub}</p>
        ) : null}
      </div>
      {link ? (
        <Link
          href={link.href as Route}
          className="text-[11px] text-fg-subtle hover:text-accent"
        >
          {link.label}
        </Link>
      ) : null}
    </div>
  );
}

function GoalCard({ g }: { g: GoalRow }) {
  const baseline = g.baseline_value;
  const current = g.current_value;
  const target = g.target_value;
  const pct =
    baseline !== null && target !== null && current !== null && target !== baseline
      ? Math.max(0, Math.min(100, ((current - baseline) / (target - baseline)) * 100))
      : null;

  const daysLeft = g.target_date
    ? Math.ceil((new Date(g.target_date).getTime() - Date.now()) / 86_400_000)
    : null;

  // Try to surface this week's first action from the action plan
  const thisWeek = extractCurrentWeekAction(g.action_plan);

  return (
    <div className="rounded-xl border border-border bg-bg-elevated/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[9px] uppercase tracking-wider text-accent">
              {g.kind}
            </span>
            {daysLeft !== null ? (
              <span className="text-[11px] text-fg-subtle">
                {daysLeft > 0
                  ? `${daysLeft}d left`
                  : daysLeft === 0
                    ? "due today"
                    : `${Math.abs(daysLeft)}d overdue`}
              </span>
            ) : null}
          </div>
          <h3 className="mt-1 text-sm font-semibold leading-tight">{g.title}</h3>
        </div>
      </div>

      {pct !== null ? (
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between text-[10px] text-fg-subtle">
            <span>
              {current ?? "?"} / {target ?? "?"} {g.target_unit ?? ""}
            </span>
            <span className="font-mono">{pct.toFixed(0)}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg-subtle">
            <div
              className={
                "h-full rounded-full transition-all " +
                (pct >= 100 ? "bg-success" : pct >= 50 ? "bg-accent" : "bg-fg-subtle")
              }
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      ) : null}

      {thisWeek ? (
        <div className="mt-3 rounded-lg border border-border bg-bg-subtle/50 px-3 py-2 text-xs">
          <span className="mr-1 text-fg-subtle">This week:</span>
          <span className="text-fg-muted">{thisWeek}</span>
        </div>
      ) : null}
    </div>
  );
}

function CalendarRow({ c }: { c: CalRow }) {
  const when = c.scheduled_for
    ? new Date(c.scheduled_for).toLocaleString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "(no date)";
  return (
    <Link
      href={"/app/calendar" as Route}
      className="group flex items-center gap-3 rounded-lg border border-border bg-bg-elevated/40 px-4 py-3 transition hover:border-accent/40 hover:bg-bg-elevated"
    >
      <span className="shrink-0 font-mono text-[11px] text-fg-subtle">
        {when}
      </span>
      <span className="flex-1 truncate text-sm text-fg group-hover:text-accent">
        {c.title}
      </span>
      <span
        className={
          "shrink-0 rounded-full px-2 py-0.5 text-[9px] uppercase tracking-wider " +
          (c.status === "scheduled"
            ? "bg-accent/15 text-accent"
            : "bg-bg-subtle text-fg-muted")
        }
      >
        {c.status}
      </span>
    </Link>
  );
}

function NudgeCard({ p }: { p: PendingRow }) {
  const text = p.payload?.content ?? "";
  // Strip any markdown link syntax for the preview
  const preview = text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").slice(0, 200);
  const sourceLabel: Record<string, string> = {
    competitor_watch: "🚨 Competitor breakout",
    auto_postmortem: "📊 Post-mortem ready",
    digest: "📬 Weekly digest",
    agency_nudge: "👋 Agency nudge",
  };
  return (
    <div className="rounded-xl border border-warning/30 bg-warning/5 p-4">
      <div className="mb-1 text-[10px] uppercase tracking-wider text-warning">
        {sourceLabel[p.source] ?? p.source}
      </div>
      <p className="text-sm text-fg-muted line-clamp-3">{preview}</p>
    </div>
  );
}

function Stat({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-baseline gap-1.5">
        <span className="text-base">{icon}</span>
        <span className="font-display text-xl font-bold tabular-nums">{value}</span>
      </div>
      <span className="text-[10px] uppercase tracking-wider text-fg-subtle">
        {label}
      </span>
    </div>
  );
}

function EmptyCard({
  icon,
  text,
  cta,
  href,
}: {
  icon: string;
  text: string;
  cta: string;
  href: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-bg-elevated/40 p-5 text-center">
      <div className="mb-2 text-2xl">{icon}</div>
      <p className="mb-3 text-xs text-fg-muted">{text}</p>
      <Link href={href as Route} className="btn-secondary text-xs">
        {cta}
      </Link>
    </div>
  );
}

function firstUserMessage(messages: ConvRow["messages"]): string | null {
  if (!messages?.length) return null;
  const m = messages.find((x) => x.role === "user");
  if (!m) return null;
  const text = String(m.content ?? "").trim();
  if (!text) return null;
  return text.length > 50 ? text.slice(0, 50) + "…" : text;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = ms / 60_000;
  if (m < 60) return `${Math.round(m)}m`;
  const h = m / 60;
  if (h < 24) return `${Math.round(h)}h`;
  const d = h / 24;
  if (d < 30) return `${Math.round(d)}d`;
  return new Date(iso).toLocaleDateString();
}

/**
 * Best-effort extraction of "this week's" first action from a goal's
 * action plan markdown. Looks for ## Week N / ## Weeks N-M headings,
 * computes which one is current, returns the first bullet.
 */
function extractCurrentWeekAction(
  actionPlan: string | null
): string | null {
  if (!actionPlan) return null;

  // Match ## Week 1 / ## Weeks 1-4 / ## Week 1: Foundation etc.
  const sections = actionPlan.split(/^##\s+/m).slice(1);
  if (sections.length === 0) return null;

  // Find the first section whose week number includes "1"
  // (we don't track per-goal start date here — first week is good default)
  const firstSection = sections[0];
  if (!firstSection) return null;

  // Pull the first bullet
  const bulletMatch = firstSection.match(/^[-*]\s+(.+?)(?:\n|$)/m);
  if (!bulletMatch?.[1]) return null;

  let bullet = bulletMatch[1].trim();
  // Strip leading bold markers
  bullet = bullet.replace(/^\*\*([^*]+)\*\*:?\s*/, "$1: ");
  if (bullet.length > 140) bullet = bullet.slice(0, 137) + "…";
  return bullet;
}
