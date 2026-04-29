import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { GoalsClient, type GoalRow } from "./goals-client";
import { PageShell } from "../page-shell";

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
    <PageShell
      routeLabel="/app/goals"
      title="Your 90-day goals"
      subtitle="Set during onboarding."
    >
      {error ? (
        <div className="mb-6 rounded-lg border border-danger/40 bg-danger/5 p-4 text-sm text-danger">
          DB error: {error.message}
        </div>
      ) : null}

      <GoalsClient rows={(data ?? []) as GoalRow[]} />
    </PageShell>
  );
}
