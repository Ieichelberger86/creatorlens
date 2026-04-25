import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { RunningClient } from "./running-client";

export const metadata: Metadata = {
  title: "Building your account…",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";
// The audit + goals can take up to ~120s combined.
export const maxDuration = 180;

export default async function OnboardingRunningPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const admin = supabaseAdmin();
  const { data: profile } = await admin
    .from("creator_profile")
    .select("niche, onboarded_at")
    .eq("user_id", user.id)
    .maybeSingle();

  // No profile inputs yet — bounce to the form
  if (!profile?.niche) {
    redirect("/app/onboarding");
  }

  // Audit already complete — go to chat
  if (profile.onboarded_at) {
    redirect("/app");
  }

  return <RunningClient />;
}
