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

  const { data: users, error: usersErr } = await admin
    .from("users")
    .select(
      "id, email, display_name, tiktok_handle, tier, monthly_token_cap, monthly_tokens_used, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(500);

  if (usersErr) {
    return (
      <main className="mx-auto w-full max-w-6xl px-6 py-10">
        <h1 className="font-display text-2xl font-bold">Agency</h1>
        <p className="mt-4 text-sm text-danger">DB error: {usersErr.message}</p>
      </main>
    );
  }

  const userIds = (users ?? []).map((u) => u.id);

  const [profilesRes, convsRes, calendarRes, brandDealsRes, liveRes] =
    await Promise.all([
      admin
        .from("creator_profile")
        .select("user_id, niche, monetization_streams, onboarded_at")
        .in("user_id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]),
      admin
        .from("conversations")
        .select("user_id, last_message_at, messages")
        .in("user_id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]),
      admin
        .from("content_calendar")
        .select("user_id, status, posted_at")
        .in("user_id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]),
      admin
        .from("brand_deals")
        .select("user_id, verdict, created_at")
        .in("user_id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]),
      admin
        .from("live_shows")
        .select("user_id, scheduled_for, ended_at, created_at")
        .in("user_id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]),
    ]);

  const profileByUser = new Map<string, { niche: string | null; monetization_streams: string[]; onboarded_at: string | null }>();
  for (const p of profilesRes.data ?? []) {
    profileByUser.set(p.user_id as string, {
      niche: (p.niche as string | null) ?? null,
      monetization_streams: (p.monetization_streams as string[] | null) ?? [],
      onboarded_at: (p.onboarded_at as string | null) ?? null,
    });
  }

  const convAgg = new Map<string, { last: string | null; total: number }>();
  for (const c of convsRes.data ?? []) {
    const uid = c.user_id as string;
    const last = (c.last_message_at as string | null) ?? null;
    const messages = (c.messages as unknown[]) ?? [];
    const prev = convAgg.get(uid) ?? { last: null, total: 0 };
    convAgg.set(uid, {
      last:
        prev.last && (!last || prev.last > last) ? prev.last : last ?? prev.last,
      total: prev.total + messages.length,
    });
  }

  const cutoff30d = Date.now() - 30 * 86_400_000;

  const calendarAgg = new Map<string, { inCal: number; posted30d: number }>();
  for (const e of calendarRes.data ?? []) {
    const uid = e.user_id as string;
    const status = (e.status as string) ?? "";
    const postedAt = e.posted_at as string | null;
    const prev = calendarAgg.get(uid) ?? { inCal: 0, posted30d: 0 };
    if (status !== "posted" && status !== "cancelled") prev.inCal += 1;
    if (postedAt && new Date(postedAt).getTime() >= cutoff30d) prev.posted30d += 1;
    calendarAgg.set(uid, prev);
  }

  const dealsAgg = new Map<string, { open: number; total: number }>();
  for (const d of brandDealsRes.data ?? []) {
    const uid = d.user_id as string;
    const verdict = (d.verdict as string) ?? "";
    const prev = dealsAgg.get(uid) ?? { open: 0, total: 0 };
    prev.total += 1;
    if (verdict === "looks_legit" || verdict === "negotiate") prev.open += 1;
    dealsAgg.set(uid, prev);
  }

  const liveAgg = new Map<string, number>();
  for (const l of liveRes.data ?? []) {
    const uid = l.user_id as string;
    const t =
      (l.ended_at as string | null) ??
      (l.scheduled_for as string | null) ??
      (l.created_at as string | null);
    if (t && new Date(t).getTime() >= cutoff30d) {
      liveAgg.set(uid, (liveAgg.get(uid) ?? 0) + 1);
    }
  }

  const rows: AgencyRow[] = (users ?? []).map((u) => {
    const prof = profileByUser.get(u.id);
    const conv = convAgg.get(u.id) ?? { last: null, total: 0 };
    const cal = calendarAgg.get(u.id) ?? { inCal: 0, posted30d: 0 };
    const deals = dealsAgg.get(u.id) ?? { open: 0, total: 0 };
    return {
      id: u.id,
      email: u.email,
      display_name: u.display_name ?? null,
      tiktok_handle: u.tiktok_handle ?? null,
      tier: u.tier,
      monthly_token_cap: u.monthly_token_cap ?? null,
      monthly_tokens_used: u.monthly_tokens_used ?? 0,
      created_at: u.created_at,
      niche: prof?.niche ?? null,
      monetization_streams: prof?.monetization_streams ?? [],
      onboarded_at: prof?.onboarded_at ?? null,
      last_message_at: conv.last,
      message_count: conv.total,
      videos_in_calendar: cal.inCal,
      videos_posted_30d: cal.posted30d,
      brand_deals_open: deals.open,
      brand_deals_total: deals.total,
      live_shows_30d: liveAgg.get(u.id) ?? 0,
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
    <main className="mx-auto w-full max-w-7xl px-6 py-10">
      <header className="mb-8">
        <div className="font-mono text-xs text-fg-subtle">/admin/agency</div>
        <h1 className="font-display text-3xl font-bold tracking-tight">
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
