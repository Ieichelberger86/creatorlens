import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getSessionUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { PageShell } from "../../page-shell";

export const metadata: Metadata = {
  title: "Weekly review",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function ReviewDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { id } = await params;

  const admin = supabaseAdmin();
  const { data: review, error } = await admin
    .from("weekly_reviews")
    .select(
      "id, week_starting, last_week_summary, this_week_plan, goal_progress, videos_analyzed, generated_at"
    )
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !review) notFound();

  // Mark as read (best-effort, ignore failures)
  await admin
    .from("weekly_reviews")
    .update({ read_at: new Date().toISOString() })
    .eq("id", review.id)
    .is("read_at", null);

  const goalProgress = (review.goal_progress as Array<{
    goal_id: string;
    title: string;
    pct?: number | null;
    delta_this_week?: number | null;
  }>) ?? [];

  const week = formatWeek(review.week_starting as string);

  return (
    <PageShell
      routeLabel="/app/review"
      title={`Week of ${week}`}
      subtitle={`Generated ${new Date(review.generated_at as string).toLocaleDateString()} · ${(review.videos_analyzed as number | null) ?? 0} video${((review.videos_analyzed as number | null) ?? 0) === 1 ? "" : "s"} analyzed`}
    >
      <div className="space-y-6">
        <section className="rounded-2xl border border-border bg-bg-elevated/40 p-6">
          <div className="mb-3 text-[10px] uppercase tracking-wider text-fg-subtle">
            Last week
          </div>
          {review.last_week_summary ? (
            <div className="prose prose-sm prose-invert max-w-none break-words">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {review.last_week_summary as string}
              </ReactMarkdown>
            </div>
          ) : (
            <div className="text-sm text-fg-subtle">(empty)</div>
          )}
        </section>

        <section className="rounded-2xl border border-accent/20 bg-accent/5 p-6">
          <div className="mb-3 text-[10px] uppercase tracking-wider text-accent/80">
            This week
          </div>
          {review.this_week_plan ? (
            <div className="prose prose-sm prose-invert max-w-none break-words">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {review.this_week_plan as string}
              </ReactMarkdown>
            </div>
          ) : (
            <div className="text-sm text-fg-subtle">(empty)</div>
          )}
        </section>

        {goalProgress.length > 0 ? (
          <section>
            <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wider text-fg-muted">
              Goal progress this week
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {goalProgress.map((g) => (
                <div
                  key={g.goal_id}
                  className="rounded-xl border border-border bg-bg-elevated/40 p-4"
                >
                  <h3 className="text-sm font-semibold leading-tight">{g.title}</h3>
                  {g.pct !== null && g.pct !== undefined ? (
                    <div className="mt-1 text-xs text-fg-muted">
                      {g.pct.toFixed(0)}% of target
                      {g.delta_this_week !== null && g.delta_this_week !== undefined ? (
                        <span className="ml-2">
                          (Δ{" "}
                          <span
                            className={
                              g.delta_this_week > 0
                                ? "text-success"
                                : g.delta_this_week < 0
                                  ? "text-danger"
                                  : ""
                            }
                          >
                            {g.delta_this_week > 0 ? "+" : ""}
                            {g.delta_this_week}
                          </span>
                          )
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </PageShell>
  );
}

function formatWeek(s: string): string {
  return new Date(s + "T00:00:00Z").toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
