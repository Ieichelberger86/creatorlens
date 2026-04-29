import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { OnboardingForm } from "./onboarding-form";

export const metadata: Metadata = {
  title: "Set up your Lens",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";
// Profile audit + Claude opener can take 30-60s; allow up to 120s.
export const maxDuration = 120;

export default async function OnboardingPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const admin = supabaseAdmin();
  const { data: profile } = await admin
    .from("creator_profile")
    .select("niche, onboarded_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profile?.onboarded_at) {
    redirect("/app");
  }
  // Mid-flight onboarding (form submitted, audit still running) — send them
  // to the live progress page instead of letting them re-fill the form.
  if (profile?.niche && !profile.onboarded_at) {
    redirect("/app/onboarding/running");
  }

  return (
    <main className="relative mx-auto flex w-full max-w-xl flex-1 flex-col px-4 py-8 sm:px-6 sm:py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[400px] hero-glow"
      />

      <div className="relative z-10">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-border bg-bg-elevated px-3 py-1 text-xs text-fg-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-accent animate-glow" />
          ~30 seconds
        </div>
        <h1 className="mb-3 font-display text-2xl font-bold tracking-tight sm:text-3xl sm:text-4xl">
          Quick setup.
        </h1>
        <p className="mb-8 text-sm text-fg-muted">
          Change anything later.
        </p>

        <OnboardingForm />
      </div>
    </main>
  );
}
