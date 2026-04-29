import { redirect } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/supabase/server";
import { RunReviewButton } from "./run-review-button";

export const dynamic = "force-dynamic";

type GoalProgress = {
  goal_id: string;
  title: string;
  baseline?: number | null;
  current?: number | null;
  target?: number | null;
  pct?: number | null;
  delta_this_week?: number | null;
};

type ReviewRow = {
  id: string;
  week_starting: string;
  status: string;
  last_week_summary: string | null;
  this_week_plan: string | null;
  goal_progress: GoalProgress[];
  videos_analyzed: number | null;
  generated_at: string;
};

type CalRow = {
  id: string;
  title: string;
  scheduled_for: string | null;
  status: string;
  hook: string | null;
};

export default async function LensAppPage() {
  const user = await getSessionUser();
  if (!user) return null;
  const admin = supabaseAdmin();

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

  const [latestReviewRes, pastReviewsRes, calendarRes, userRowRes] = await Promise.all([
    admin
      .from("weekly_reviews")
      .select(
        "id, week_starting, status, last_week_summary, this_week_plan, goal_progress, videos_analyzed, generated_at"
      )
      .eq("user_id", user.id)
      .order("week_starting", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("weekly_reviews")
      .select("id, week_starting, generated_at, videos_analyzed")
      .eq("user_id", user.id)
      .order("week_starting", { ascending: false })
      .range(1, 6),
    admin
      .from("content_calendar")
      .select("id, title, scheduled_for, status, hook")
      .eq("user_id", user.id)
      .gte("scheduled_for", new Date().toISOString())
      .lte("scheduled_for", sevenDaysFromNow)
      .order("scheduled_for", { ascending: true })
      .limit(8),
    admin
      .from("users")
      .select("tiktok_handle, display_name")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  const latest = latestReviewRes.data as ReviewRow | null;
  const past = (pastReviewsRes.data ?? []) as Array<
    Pick<ReviewRow, "id" | "week_starting" | "generated_at" | "videos_analyzed">
  >;
  const upcoming = (calendarRes.data ?? []) as CalRow[];
  const userRow = userRowRes.data;
  const handle = userRow?.tiktok_handle ?? null;
  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6">
      <header className="mb-6">
        <div className="font-mono text-xs text-fg-subtle">{today}</div>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight sm:text-3xl">
          {handle ? `@${handle}` : "Welcome back"}
        </h1>
      </header>

      {latest ? (
        <ReviewView review={latest} upcoming={upcoming} />
      ) : (
        <NoReviewYet />
      )}

      {past.length > 0 ? (
        <section className="mt-10">
          <SectionHead
            title="Past reviews"
            link={{ href: "/app/review", label: "All →" }}
          />
          <div className="grid gap-2 sm:grid-cols-2">
            {past.map((p) => (
              <Link
                key={p.id}
                href={`/app/review/${p.id}` as Route}
                className="group flex items-center justify-between rounded-lg border border-border bg-bg-elevated/40 px-4 py-3 transition hover:border-accent/40 hover:bg-bg-elevated"
              >
                <span className="text-sm text-fg group-hover:text-accent">
                  Week of {formatWeek(p.week_starting)}
                </span>
                <span className="ml-3 shrink-0 font-mono text-[10px] text-fg-subtle">
                  {p.videos_analyzed ?? 0} vids
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}

function ReviewView({
  review,
  upcoming,
}: {
  review: ReviewRow;
  upcoming: CalRow[];
}) {
  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-accent/20 bg-accent/5 p-4">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-accent/80">
            This week
          </div>
          <div className="mt-0.5 font-display text-lg font-semibold">
            {formatWeek(review.week_starting)}
          </div>
          <div className="mt-0.5 text-xs text-fg-subtle">
            {timeAgo(review.generated_at)} · {review.videos_analyzed ?? 0} video
            {(review.videos_analyzed ?? 0) === 1 ? "" : "s"}
          </div>
        </div>
        <RunReviewButton />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section>
          <SectionHead title="Last week" />
          <div className="rounded-xl border border-border bg-bg-elevated/40 p-5">
            {review.last_week_summary ? (
              <div className="prose prose-sm prose-invert max-w-none break-words">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {review.last_week_summary}
                </ReactMarkdown>
              </div>
            ) : (
              <div className="text-sm text-fg-subtle">No review yet.</div>
            )}
          </div>
        </section>

        <section>
          <SectionHead
            title="This week"
            link={{ href: "/app/calendar", label: "Calendar →" }}
          />
          <div className="rounded-xl border border-border bg-bg-elevated/40 p-5">
            {review.this_week_plan ? (
              <div className="prose prose-sm prose-invert max-w-none break-words">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {review.this_week_plan}
                </ReactMarkdown>
              </div>
            ) : (
              <div className="text-sm text-fg-subtle">No plan yet.</div>
            )}
          </div>
        </section>

        {Array.isArray(review.goal_progress) && review.goal_progress.length > 0 ? (
          <section className="lg:col-span-2">
            <SectionHead
              title="Goal progress"
              link={{ href: "/app/goals", label: "All goals →" }}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              {review.goal_progress.map((g) => (
                <GoalCard key={g.goal_id} g={g} />
              ))}
            </div>
          </section>
        ) : null}

        {upcoming.length > 0 ? (
          <section className="lg:col-span-2">
            <SectionHead
              title="On deck"
              link={{ href: "/app/calendar", label: "Calendar →" }}
            />
            <div className="flex flex-col gap-2">
              {upcoming.map((c) => (
                <Link
                  key={c.id}
                  href={"/app/calendar" as Route}
                  className="group flex items-center gap-3 rounded-lg border border-border bg-bg-elevated/40 px-4 py-3 transition hover:border-accent/40 hover:bg-bg-elevated"
                >
                  <span className="shrink-0 font-mono text-[11px] text-fg-subtle">
                    {c.scheduled_for
                      ? new Date(c.scheduled_for).toLocaleString(undefined, {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })
                      : "(no date)"}
                  </span>
                  <span className="flex-1 truncate text-sm text-fg group-hover:text-accent">
                    {c.title}
                  </span>
                  <span className="shrink-0 rounded-full bg-bg-subtle px-2 py-0.5 text-[9px] uppercase tracking-wider text-fg-muted">
                    {c.status}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </>
  );
}

function NoReviewYet() {
  return (
    <div className="rounded-2xl border border-border bg-bg-elevated/40 p-8 text-center">
      <div className="mb-2 text-3xl">📋</div>
      <h2 className="mb-2 font-display text-xl font-semibold">
        First review lands here.
      </h2>
      <p className="mx-auto mb-5 max-w-md text-sm text-fg-muted">
        Mondays 8am UTC. Or run one now.
      </p>
      <RunReviewButton />
    </div>
  );
}

function GoalCard({ g }: { g: GoalProgress }) {
  const baseline = g.baseline ?? null;
  const current = g.current ?? null;
  const target = g.target ?? null;
  const pct = g.pct ?? null;
  const delta = g.delta_this_week ?? null;

  // Compute "pct of target gained this week" — nice to surface progress
  // velocity (e.g. "+0.8% toward goal" instead of just raw "+200")
  const totalGap =
    baseline !== null && target !== null && target !== baseline
      ? target - baseline
      : null;
  const deltaPctOfTarget =
    delta !== null && totalGap !== null && totalGap !== 0
      ? +((delta / totalGap) * 100).toFixed(1)
      : null;

  return (
    <div className="rounded-xl border border-border bg-bg-elevated/40 p-4">
      <h3 className="text-sm font-semibold leading-tight">{g.title}</h3>
      {pct !== null ? (
        <>
          <div className="mt-2 flex items-center justify-between text-[10px] text-fg-subtle">
            <span>
              {current ?? "?"} / {target ?? "?"}
            </span>
            <span className="font-mono">{pct.toFixed(0)}%</span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-bg-subtle">
            <div
              className={
                "h-full rounded-full " +
                (pct >= 100 ? "bg-success" : pct >= 50 ? "bg-accent" : "bg-fg-subtle")
              }
              style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
            />
          </div>
        </>
      ) : (
        <div className="mt-2 text-xs text-fg-subtle">
          {baseline ?? "?"} → {target ?? "?"} (progress not measured yet)
        </div>
      )}
      {delta !== null ? (
        <div className="mt-2 flex items-center gap-2 text-[11px]">
          <span className="text-fg-subtle">This week:</span>
          <span
            className={
              delta > 0
                ? "font-semibold text-success"
                : delta < 0
                  ? "font-semibold text-danger"
                  : "text-fg-muted"
            }
          >
            {delta > 0 ? "+" : ""}
            {delta.toLocaleString()}
            {deltaPctOfTarget !== null && Math.abs(deltaPctOfTarget) >= 0.1 ? (
              <span className="ml-1 font-normal text-fg-subtle">
                ({deltaPctOfTarget > 0 ? "+" : ""}
                {deltaPctOfTarget}% toward target)
              </span>
            ) : null}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function SectionHead({
  title,
  link,
}: {
  title: string;
  link?: { href: string; label: string };
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-2">
      <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-fg-muted">
        {title}
      </h2>
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

function formatWeek(weekStarting: string): string {
  const d = new Date(weekStarting + "T00:00:00Z");
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
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
