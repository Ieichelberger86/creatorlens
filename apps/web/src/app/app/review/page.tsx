import type { Metadata } from "next";
import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { PageShell } from "../page-shell";
import { RunReviewButton } from "../run-review-button";

export const metadata: Metadata = {
  title: "Reviews",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function ReviewListPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("weekly_reviews")
    .select("id, week_starting, generated_at, videos_analyzed, status")
    .eq("user_id", user.id)
    .order("week_starting", { ascending: false })
    .limit(52);

  return (
    <PageShell
      routeLabel="/app/review"
      title="Weekly reviews"
      subtitle="Lens runs a structured review every Monday — last week's recap + next week's plan. Click any week to read it."
      actions={<RunReviewButton variant="secondary" label="🔁 Run now" />}
    >
      {error ? (
        <div className="mb-6 rounded-lg border border-danger/40 bg-danger/5 p-4 text-sm text-danger">
          DB error: {error.message}
        </div>
      ) : null}

      {!data || data.length === 0 ? (
        <div className="rounded-xl border border-border bg-bg-elevated/40 p-8 text-center">
          <div className="mb-2 text-3xl">📋</div>
          <p className="mb-4 text-sm text-fg-muted">
            No reviews yet. Your first one will land Monday at 8am UTC, or
            run one now.
          </p>
          <RunReviewButton />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {data.map((r) => (
            <Link
              key={r.id}
              href={`/app/review/${r.id}` as Route}
              className="group flex items-center gap-3 rounded-xl border border-border bg-bg-elevated/40 px-4 py-3 transition hover:border-accent/40 hover:bg-bg-elevated"
            >
              <div className="flex-1">
                <div className="font-medium text-fg group-hover:text-accent">
                  Week of {formatWeek(r.week_starting as string)}
                </div>
                <div className="text-[11px] text-fg-subtle">
                  {(r.videos_analyzed as number | null) ?? 0} video
                  {((r.videos_analyzed as number | null) ?? 0) === 1 ? "" : "s"}{" "}
                  analyzed · generated{" "}
                  {new Date(r.generated_at as string).toLocaleDateString()}
                </div>
              </div>
              <span className="font-mono text-[10px] text-fg-subtle">→</span>
            </Link>
          ))}
        </div>
      )}
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
