import type { Metadata } from "next";
import { adminClient } from "@creatorlens/db";
import { PRICING } from "@creatorlens/shared/pricing";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PreorderRow = {
  id: string;
  email: string;
  amount_cents: number;
  currency: string;
  status: string;
  converted: boolean;
  created_at: string;
  stripe_checkout_session_id: string | null;
  utm_source: string | null;
  utm_campaign: string | null;
};

async function loadStats() {
  const db = adminClient();
  const { data, error } = await db
    .from("preorders")
    .select(
      "id, email, amount_cents, currency, status, converted, created_at, stripe_checkout_session_id, utm_source, utm_campaign"
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    return { error: error.message, rows: [] as PreorderRow[] };
  }

  return { error: null, rows: (data ?? []) as PreorderRow[] };
}

export default async function AdminPage() {
  const { error, rows } = await loadStats();

  const total = rows.length;
  const paid = rows.filter((r) => r.status === "paid").length;
  const converted = rows.filter((r) => r.converted).length;
  const revenueCents = rows
    .filter((r) => r.status === "paid")
    .reduce((sum, r) => sum + (r.amount_cents ?? 0), 0);
  const target = PRICING.founding.spots;
  const pctOfTarget = Math.min(100, Math.round((total / target) * 100));

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      <header className="mb-10 flex items-center justify-between">
        <div>
          <div className="font-mono text-xs text-fg-subtle">/admin</div>
          <h1 className="font-display text-3xl font-bold tracking-tight">
            CreatorLens pre-orders
          </h1>
        </div>
        <div className="font-mono text-xs text-fg-subtle">
          {new Date().toISOString()}
        </div>
      </header>

      {error ? (
        <div className="card mb-8 border-danger/40 bg-danger/5 text-danger">
          DB error: {error}
        </div>
      ) : null}

      <section className="mb-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Pre-orders" value={total.toString()} sub={`of ${target}`} />
        <Stat label="Paid" value={paid.toString()} />
        <Stat
          label="Revenue"
          value={`$${(revenueCents / 100).toFixed(0)}`}
          sub="deposits"
        />
        <Stat
          label="Converted to paid"
          value={converted.toString()}
          sub={paid ? `${Math.round((converted / paid) * 100)}% of paid` : undefined}
        />
      </section>

      <section className="mb-10">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm text-fg-muted">Founding progress</div>
          <div className="font-mono text-xs text-fg-subtle">
            {total} / {target}
          </div>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-bg-elevated">
          <div
            className="h-full rounded-full bg-accent transition-all"
            style={{ width: `${pctOfTarget}%` }}
          />
        </div>
      </section>

      <section>
        <div className="mb-3 font-display text-lg font-semibold">
          Recent pre-orders
        </div>
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-bg-elevated text-left text-xs uppercase tracking-wider text-fg-subtle">
              <tr>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Stripe session</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-10 text-center text-fg-muted"
                  >
                    No pre-orders yet. When the first $10 checkout completes,
                    it&apos;ll show up here via Stripe webhook.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr
                    key={r.id}
                    className="border-t border-border hover:bg-bg-elevated/50"
                  >
                    <td className="px-4 py-3 font-medium">{r.email}</td>
                    <td className="px-4 py-3 font-mono text-xs">
                      ${(r.amount_cents / 100).toFixed(2)} {r.currency.toUpperCase()}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill status={r.status} converted={r.converted} />
                    </td>
                    <td className="px-4 py-3 text-xs text-fg-muted">
                      {r.utm_source ?? "—"}
                      {r.utm_campaign ? ` · ${r.utm_campaign}` : ""}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-fg-muted">
                      {new Date(r.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 font-mono text-[10px] text-fg-subtle">
                      {r.stripe_checkout_session_id?.slice(0, 16) ?? "—"}…
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
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
    <div className="card">
      <div className="mb-1 text-xs uppercase tracking-wider text-fg-subtle">
        {label}
      </div>
      <div className="font-display text-3xl font-bold">{value}</div>
      {sub ? <div className="mt-1 text-xs text-fg-muted">{sub}</div> : null}
    </div>
  );
}

function StatusPill({
  status,
  converted,
}: {
  status: string;
  converted: boolean;
}) {
  const palette: Record<string, string> = {
    pending: "bg-fg-subtle/20 text-fg-muted",
    paid: converted
      ? "bg-accent/20 text-accent"
      : "bg-success/20 text-success",
    refunded: "bg-danger/20 text-danger",
    failed: "bg-danger/20 text-danger",
  };
  const cls = palette[status] ?? palette.pending;
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs ${cls}`}>
      {converted ? "converted" : status}
    </span>
  );
}
