import type { Metadata } from "next";
import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const metadata: Metadata = {
  title: "Insights",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type Perf = {
  views?: number | null;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
  saves?: number | null;
  duration_sec?: number | null;
  posted_at?: string | null;
  caption?: string | null;
  hashtags?: string[] | null;
};

type VideoRow = {
  id: string;
  tiktok_url: string;
  is_own: boolean;
  performance: Perf | null;
  analyzed_at: string | null;
};

export default async function InsightsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("videos")
    .select("id, tiktok_url, is_own, performance, analyzed_at")
    .eq("user_id", user.id)
    .eq("is_own", true)
    .order("analyzed_at", { ascending: false })
    .limit(200);

  const rows = (data ?? []) as VideoRow[];

  const stats = computeStats(rows);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <header className="mb-8">
        <div className="font-mono text-xs text-fg-subtle">/app/insights</div>
        <h1 className="font-display text-3xl font-bold tracking-tight">
          Your numbers
        </h1>
        <p className="mt-1 text-sm text-fg-muted">
          Built from {rows.length} of your videos. Lens references this on every reply.
        </p>
      </header>

      {error ? (
        <div className="card mb-6 border-danger/40 bg-danger/5 text-danger">
          DB error: {error.message}
        </div>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <section className="mb-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Videos" value={stats.count.toString()} />
            <Stat
              label="Lifetime views"
              value={fmtBig(stats.totalViews)}
              sub={`${fmtBig(stats.totalLikes)} likes`}
            />
            <Stat label="Median views" value={fmtBig(stats.median)} />
            <Stat
              label="Top performer"
              value={fmtBig(stats.topViews)}
              sub={
                stats.topUrl ? (
                  <a
                    href={stats.topUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:underline"
                  >
                    open ↗
                  </a>
                ) : undefined
              }
            />
          </section>

          <section className="mb-10">
            <SectionHead title="View distribution" sub="Most recent 30 videos · most recent on the right" />
            <ViewBars values={stats.recentViewSeries} median={stats.median} />
          </section>

          <section className="mb-10 grid gap-6 lg:grid-cols-2">
            <div>
              <SectionHead
                title="Engagement rate (avg)"
                sub="Across all analyzed videos"
              />
              <div className="card flex flex-col gap-3 text-sm">
                <Bar label="Like rate" value={stats.likeRatePct} max={10} suffix="%" />
                <Bar label="Save rate" value={stats.saveRatePct} max={3} suffix="%" />
                <Bar
                  label="Comment rate"
                  value={stats.commentRatePct}
                  max={3}
                  suffix="%"
                />
                <Bar
                  label="Share rate"
                  value={stats.shareRatePct}
                  max={3}
                  suffix="%"
                />
              </div>
            </div>

            <div>
              <SectionHead title="Top hashtags" sub="Ranked by avg views per use" />
              <div className="card text-sm">
                {stats.topHashtags.length === 0 ? (
                  <p className="text-fg-muted">
                    No hashtag data yet — keep shipping with tags and Lens will track which
                    ones move the needle.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {stats.topHashtags.slice(0, 8).map((h) => (
                      <li
                        key={h.tag}
                        className="flex items-center justify-between gap-3"
                      >
                        <span className="font-mono text-fg">#{h.tag}</span>
                        <div className="flex flex-1 items-center gap-3">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg-elevated">
                            <div
                              className="h-full rounded-full bg-accent"
                              style={{
                                width: `${
                                  stats.topHashtags[0]
                                    ? (h.avgViews / stats.topHashtags[0].avgViews) * 100
                                    : 0
                                }%`,
                              }}
                            />
                          </div>
                          <span className="font-mono text-xs text-fg-muted">
                            {fmtBig(h.avgViews)} · {h.uses}×
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>

          <section className="mb-10">
            <SectionHead title="Best performers" sub="Top 5 by views" />
            <div className="overflow-hidden rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead className="bg-bg-elevated text-left text-xs uppercase tracking-wider text-fg-subtle">
                  <tr>
                    <th className="px-4 py-3">Caption / hook</th>
                    <th className="px-4 py-3">Views</th>
                    <th className="px-4 py-3">Engagement</th>
                    <th className="px-4 py-3">Posted</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.topVideos.map((v) => (
                    <tr key={v.id} className="border-t border-border">
                      <td className="px-4 py-3 align-top">
                        <a
                          href={v.url}
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium text-fg hover:text-accent"
                        >
                          {v.caption?.slice(0, 90) ?? "(no caption)"}
                        </a>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {fmtBig(v.views)}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-fg-muted">
                        {v.likeRate.toFixed(2)}% likes · {v.saveRate.toFixed(2)}% saves
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-fg-muted">
                        {v.postedAt
                          ? new Date(v.postedAt).toLocaleDateString()
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <SectionHead title="Posting cadence" sub="Videos per week, last 12 weeks" />
            <CadenceBars cadence={stats.cadence} />
          </section>
        </>
      )}
    </main>
  );
}

function EmptyState() {
  return (
    <div className="card text-center">
      <div className="mb-2 text-3xl">📊</div>
      <h2 className="mb-2 font-display text-xl font-semibold">
        Your stats fill in as Lens analyzes your videos.
      </h2>
      <p className="mx-auto mb-6 max-w-md text-sm text-fg-muted">
        Onboarding pulls your last 10 automatically. After that, drop a TikTok
        URL in chat or run a post-mortem on a recent post and the numbers
        compound here.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Link href={"/app" as Route} className="btn-primary text-sm">
          Drop a URL in chat
        </Link>
        <Link href={"/app/calendar" as Route} className="btn-secondary text-sm">
          Plan content instead
        </Link>
      </div>
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
  sub?: React.ReactNode;
}) {
  return (
    <div className="card">
      <div className="mb-1 text-xs uppercase tracking-wider text-fg-subtle">
        {label}
      </div>
      <div className="font-display text-2xl font-bold sm:text-3xl">{value}</div>
      {sub ? <div className="mt-1 text-xs text-fg-muted">{sub}</div> : null}
    </div>
  );
}

function SectionHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-3">
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      {sub ? <p className="text-xs text-fg-subtle">{sub}</p> : null}
    </div>
  );
}

function Bar({
  label,
  value,
  max,
  suffix,
}: {
  label: string;
  value: number;
  max: number;
  suffix: string;
}) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="flex items-center gap-3">
      <div className="w-28 shrink-0 text-fg-muted">{label}</div>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg-elevated">
        <div
          className="h-full rounded-full bg-accent"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="w-16 shrink-0 text-right font-mono text-xs">
        {value.toFixed(2)}
        {suffix}
      </div>
    </div>
  );
}

function ViewBars({ values, median }: { values: number[]; median: number }) {
  const max = Math.max(...values, 1);
  return (
    <div className="card">
      <div className="flex items-end gap-1 h-32">
        {values.map((v, i) => {
          const h = Math.max(2, (v / max) * 100);
          const isAboveMedian = v >= median;
          return (
            <div
              key={i}
              className="flex-1 rounded-t-sm transition"
              style={{
                height: `${h}%`,
                background: isAboveMedian
                  ? "rgb(139 92 246)"
                  : "rgb(70 70 80)",
              }}
              title={`${fmtBig(v)} views`}
            />
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-fg-subtle">
        <span>oldest</span>
        <span>median = {fmtBig(median)}</span>
        <span>newest</span>
      </div>
    </div>
  );
}

function CadenceBars({ cadence }: { cadence: Array<{ week: string; count: number }> }) {
  const max = Math.max(...cadence.map((c) => c.count), 1);
  return (
    <div className="card">
      <div className="flex items-end gap-1 h-24">
        {cadence.map((c) => {
          const h = Math.max(2, (c.count / max) * 100);
          return (
            <div
              key={c.week}
              className="flex-1 rounded-t-sm bg-accent/60"
              style={{ height: `${h}%` }}
              title={`${c.week}: ${c.count} video${c.count === 1 ? "" : "s"}`}
            />
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-fg-subtle">
        <span>{cadence[0]?.week}</span>
        <span>{cadence[cadence.length - 1]?.week}</span>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────

function fmtBig(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function computeStats(rows: VideoRow[]) {
  const own = rows.filter((r) => r.is_own && r.performance);
  const views = own
    .map((r) => r.performance?.views ?? 0)
    .filter((n): n is number => typeof n === "number" && n > 0);
  const sortedViews = [...views].sort((a, b) => a - b);
  const median = sortedViews.length
    ? sortedViews[Math.floor(sortedViews.length / 2)]!
    : 0;
  const totalViews = views.reduce((s, v) => s + v, 0);

  const totalLikes = own.reduce(
    (s, r) => s + (r.performance?.likes ?? 0),
    0
  );
  const totalComments = own.reduce(
    (s, r) => s + (r.performance?.comments ?? 0),
    0
  );
  const totalShares = own.reduce(
    (s, r) => s + (r.performance?.shares ?? 0),
    0
  );
  const totalSaves = own.reduce(
    (s, r) => s + (r.performance?.saves ?? 0),
    0
  );

  const likeRatePct = totalViews ? (totalLikes / totalViews) * 100 : 0;
  const commentRatePct = totalViews ? (totalComments / totalViews) * 100 : 0;
  const shareRatePct = totalViews ? (totalShares / totalViews) * 100 : 0;
  const saveRatePct = totalViews ? (totalSaves / totalViews) * 100 : 0;

  // Top performers
  const ranked = [...own].sort(
    (a, b) => (b.performance?.views ?? 0) - (a.performance?.views ?? 0)
  );
  const topRow = ranked[0];

  const topVideos = ranked.slice(0, 5).map((r) => ({
    id: r.id,
    url: r.tiktok_url,
    views: r.performance?.views ?? 0,
    caption: r.performance?.caption ?? null,
    likeRate: r.performance?.views
      ? ((r.performance.likes ?? 0) / r.performance.views) * 100
      : 0,
    saveRate: r.performance?.views
      ? ((r.performance.saves ?? 0) / r.performance.views) * 100
      : 0,
    postedAt: r.performance?.posted_at ?? null,
  }));

  // Hashtag aggregates
  const hashMap = new Map<string, { sumViews: number; uses: number }>();
  for (const r of own) {
    const tags = (r.performance?.hashtags ?? []) as string[];
    const v = r.performance?.views ?? 0;
    for (const t of tags) {
      const tag = String(t).trim().toLowerCase();
      if (!tag) continue;
      const cur = hashMap.get(tag) ?? { sumViews: 0, uses: 0 };
      cur.sumViews += v;
      cur.uses += 1;
      hashMap.set(tag, cur);
    }
  }
  const topHashtags = [...hashMap.entries()]
    .map(([tag, agg]) => ({
      tag,
      uses: agg.uses,
      avgViews: agg.uses ? agg.sumViews / agg.uses : 0,
    }))
    .filter((h) => h.uses >= 1)
    .sort((a, b) => b.avgViews - a.avgViews);

  // Recent view series — last 30 by analyzed_at, oldest left → newest right
  const recent = [...own]
    .sort((a, b) => {
      const ad = a.analyzed_at ? Date.parse(a.analyzed_at) : 0;
      const bd = b.analyzed_at ? Date.parse(b.analyzed_at) : 0;
      return ad - bd;
    })
    .slice(-30);
  const recentViewSeries = recent.map((r) => r.performance?.views ?? 0);

  // Posting cadence — last 12 weeks
  const cadence: Array<{ week: string; count: number }> = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const start = new Date(now);
    start.setDate(now.getDate() - i * 7);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 7);
    const count = own.filter((r) => {
      const t = r.performance?.posted_at
        ? Date.parse(r.performance.posted_at)
        : 0;
      return t >= start.getTime() && t < end.getTime();
    }).length;
    cadence.push({
      week: `${start.getMonth() + 1}/${start.getDate()}`,
      count,
    });
  }

  return {
    count: own.length,
    totalViews,
    totalLikes,
    median,
    topViews: topRow?.performance?.views ?? 0,
    topUrl: topRow?.tiktok_url ?? null,
    likeRatePct,
    commentRatePct,
    shareRatePct,
    saveRatePct,
    topVideos,
    topHashtags,
    recentViewSeries,
    cadence,
  };
}
