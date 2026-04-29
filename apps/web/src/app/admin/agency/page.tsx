import type { Metadata } from "next";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { AgencyClient, type AgencyRow } from "./agency-client";

export const metadata: Metadata = {
  title: "Agency · CreatorLens admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AgencyPage() {
  const admin = supabaseAdmin();

  // Single query against the agency_overview view — replaces the 5 parallel
  // .in() queries this page used to run.
  const { data, error } = await admin
    .from("agency_overview")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    return (
      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="font-display text-2xl font-bold">Agency</h1>
        <p className="mt-4 text-sm text-danger">DB error: {error.message}</p>
      </main>
    );
  }

  const rows: AgencyRow[] = (data ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      id: row.user_id as string,
      email: row.email as string,
      display_name: (row.display_name as string | null) ?? null,
      tiktok_handle: (row.tiktok_handle as string | null) ?? null,
      tier: (row.tier as string) ?? "preorder",
      monthly_token_cap: (row.monthly_token_cap as number | null) ?? null,
      monthly_tokens_used: (row.monthly_tokens_used as number | null) ?? 0,
      created_at: row.created_at as string,
      niche: (row.niche as string | null) ?? null,
      monetization_streams: (row.monetization_streams as string[] | null) ?? [],
      onboarded_at: (row.onboarded_at as string | null) ?? null,
      last_message_at: (row.last_message_at as string | null) ?? null,
      message_count: (row.message_count as number | null) ?? 0,
      videos_in_calendar: (row.videos_in_calendar as number | null) ?? 0,
      videos_posted_30d: (row.videos_posted_30d as number | null) ?? 0,
      brand_deals_open: (row.brand_deals_open as number | null) ?? 0,
      brand_deals_total: (row.brand_deals_total as number | null) ?? 0,
      live_shows_30d: (row.live_shows_30d as number | null) ?? 0,
    };
  });

  const vanguardRows = rows.filter((r) => r.tier === "vanguard");
  const stale = vanguardRows.filter((r) => {
    if (!r.last_message_at) return true;
    const d = (Date.now() - new Date(r.last_message_at).getTime()) / 86_400_000;
    return d > 4;
  });
  const stuck = vanguardRows.filter((r) => {
    if (!r.last_message_at) return false;
    const d = (Date.now() - new Date(r.last_message_at).getTime()) / 86_400_000;
    if (d > 4) return false;
    return r.message_count >= 5 && r.videos_posted_30d === 0 && r.videos_in_calendar < 3;
  });

  const totalDeals = rows.reduce((s, r) => s + r.brand_deals_total, 0);
  const totalLive30d = rows.reduce((s, r) => s + r.live_shows_30d, 0);

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-8">
        <div className="font-mono text-xs text-fg-subtle">/admin/agency</div>
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
          Agency control plane
        </h1>
        <p className="mt-1 text-sm text-fg-muted">
          One screen to see who&apos;s shipping, who&apos;s ghosting, who needs a
          nudge.
        </p>
      </header>

      <section className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Vanguard creators" value={vanguardRows.length.toString()} />
        <Stat
          label="Stale (>4d)"
          value={stale.length.toString()}
          tone={stale.length > 0 ? "warn" : undefined}
        />
        <Stat
          label="Stuck (chat ≠ ship)"
          value={stuck.length.toString()}
          tone={stuck.length > 0 ? "danger" : undefined}
        />
        <Stat label="Brand deals (all)" value={totalDeals.toString()} />
        <Stat label="Live shows (30d)" value={totalLive30d.toString()} />
      </section>

      <AgencyClient rows={rows} />
    </main>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "warn" | "danger";
}) {
  const valueClass =
    tone === "danger"
      ? "text-danger"
      : tone === "warn"
        ? "text-warning"
        : "text-fg";
  return (
    <div className="card">
      <div className="mb-1 text-xs uppercase tracking-wider text-fg-subtle">
        {label}
      </div>
      <div className={`font-display text-2xl font-bold ${valueClass}`}>{value}</div>
    </div>
  );
}
