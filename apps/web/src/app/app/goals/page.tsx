import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { GoalsClient, type GoalRow } from "./goals-client";

export const metadata: Metadata = {
  title: "Goals",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function GoalsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("goals")
    .select(
      "id, title, kind, target_value, target_unit, target_date, baseline_value, current_value, current_updated_at, status, why_it_matters, action_plan, milestones, source, created_at"
    )
    .eq("user_id", user.id)
    .order("status", { ascending: true })
    .order("target_date", { ascending: true })
    .limit(50);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <div className="mb-6 flex flex-col gap-1">
        <div className="font-mono text-xs text-fg-subtle">/app/goals</div>
        <h1 className="font-display text-2xl font-bold tracking-tight">
          Your 90-day goals
        </h1>
        <p className="text-sm text-fg-muted">
          Set during onboarding from your audit + 90-day vision. Lens uses these
          to bias every recommendation. Update progress as you go.
        </p>
      </div>

      {error ? (
        <div className="mb-6 rounded-lg border border-danger/40 bg-danger/5 p-4 text-sm text-danger">
          DB error: {error.message}
        </div>
      ) : null}

      <GoalsClient rows={(data ?? []) as GoalRow[]} />
    </main>
  );
}
