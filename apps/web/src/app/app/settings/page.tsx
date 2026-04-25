import type { Metadata } from "next";
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
        "niche, voice_samples, monetization_streams, brand_notes, goals, onboarded_at"
      )
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

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

  return (
    <PageShell
      routeLabel="/app/settings"
      title="Settings"
      subtitle="Update what Lens knows about you. Changes apply to the next message and any new tool runs."
      width="narrow"
    >
      <SettingsForm initial={initial} />
    </PageShell>
  );
}
