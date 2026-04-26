import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ReviewRunningClient } from "./running-client";

export const metadata: Metadata = {
  title: "Running review…",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";
export const maxDuration = 180;

export default async function ReviewRunningPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const admin = supabaseAdmin();
  const { data: profile } = await admin
    .from("creator_profile")
    .select("niche, onboarded_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile?.onboarded_at) {
    if (profile?.niche) redirect("/app/onboarding/running");
    redirect("/app/onboarding");
  }

  return <ReviewRunningClient />;
}
