import type { Metadata } from "next";
import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { SettingsForm, type SettingsInitial } from "./settings-form";
import { PageShell } from "../page-shell";

export const metadata: Metadata = {
  title: "Settings",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const admin = supabaseAdmin();
  const [{ data: row }, { data: profile }] = await Promise.all([
    admin
      .from("users")
      .select("tiktok_handle, display_name, email")
      .eq("id", user.id)
      .maybeSingle(),
    admin
      .from("creator_profile")
      .select(
        "niche, voice_samples, monetization_streams, brand_notes, goals, onboarded_at, last_audited_at"
      )
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  // Latest weekly review (drives the Weekly Review settings card)
  const { data: latestReview } = await admin
    .from("weekly_reviews")
    .select("id, week_starting, generated_at")
    .eq("user_id", user.id)
    .order("week_starting", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!profile?.onboarded_at) {
    redirect("/app/onboarding");
  }

  const goals = (profile?.goals as Record<string, unknown> | null) ?? {};
  const ninetyDay = typeof goals.ninety_day === "string" ? goals.ninety_day : "";

  const initial: SettingsInitial = {
    tiktok_handle: row?.tiktok_handle ?? "",
    display_name: row?.display_name ?? "",
    niche: profile?.niche ?? "",
    ninety_day_goal: ninetyDay,
    brand_notes: profile?.brand_notes ?? "",
    monetization_streams:
      (profile?.monetization_streams as string[] | null) ?? [],
    voice_samples: (profile?.voice_samples as string[] | null) ?? [],
  };

  const lastAuditAt = (profile?.last_audited_at as string | null) ?? null;
  const lastAuditDate = lastAuditAt ? new Date(lastAuditAt) : null;
  const daysSince = lastAuditDate
    ? Math.floor((Date.now() - lastAuditDate.getTime()) / 86_400_000)
    : null;
  const eligible = daysSince === null || daysSince >= 25;
  const eligibleAt =
    lastAuditDate && !eligible
      ? new Date(lastAuditDate.getTime() + 25 * 86_400_000)
      : null;

  return (
    <PageShell
      routeLabel="/app/settings"
      title="Settings"
      subtitle="What Lens knows about you."
      width="narrow"
    >
      <SettingsForm initial={initial} />

      <section className="mt-8 rounded-xl border border-border bg-bg-elevated/40 p-5">
        <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wider text-fg-muted">
          Weekly review
        </h2>
        <p className="mb-4 text-sm text-fg-muted">
          Mondays 8am UTC. Or run one now.
        </p>

        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Stat
            label="Latest review"
            value={
              latestReview
                ? `Week of ${new Date(
                    (latestReview.week_starting as string) + "T00:00:00Z"
                  ).toLocaleDateString(undefined, {
                    month: "long",
                    day: "numeric",
                  })}`
                : "—"
            }
            sub={
              latestReview
                ? `Generated ${new Date(latestReview.generated_at as string).toLocaleDateString()}`
                : "First one runs Monday 8am UTC, or run now"
            }
          />
          <Stat
            label="Last full audit"
            value={
              lastAuditDate
                ? lastAuditDate.toLocaleDateString(undefined, {
                    month: "long",
                    day: "numeric",
                  })
                : "—"
            }
            sub={
              daysSince !== null
                ? `${daysSince} day${daysSince === 1 ? "" : "s"} ago`
                : undefined
            }
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={"/app/review/running" as Route}
            className="btn-primary text-sm"
          >
            Run review
          </Link>
          <Link
            href={"/app/audit/running" as Route}
            className="btn-secondary text-sm"
          >
            Run audit
          </Link>
        </div>
        <p className="mt-2 text-[11px] text-fg-subtle">
          Review ~60s · Audit ~120s (full profile rescan)
        </p>
      </section>
    </PageShell>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "ok" | "muted";
}) {
  return (
    <div className="rounded-lg border border-border bg-bg-subtle/50 px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider text-fg-subtle">
        {label}
      </div>
      <div
        className={
          "mt-0.5 text-sm font-semibold " +
          (tone === "ok"
            ? "text-success"
            : tone === "muted"
              ? "text-fg-muted"
              : "text-fg")
        }
      >
        {value}
      </div>
      {sub ? (
        <div className="mt-0.5 text-[11px] text-fg-subtle">{sub}</div>
      ) : null}
    </div>
  );
}
