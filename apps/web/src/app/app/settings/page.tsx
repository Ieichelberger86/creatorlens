import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { SettingsForm, type SettingsInitial } from "./settings-form";

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
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-10">
      <div className="mb-6 flex flex-col gap-1">
        <h1 className="font-display text-2xl font-bold tracking-tight">
          Settings
        </h1>
        <p className="text-sm text-fg-muted">
          Update what Lens knows about you. Changes apply to the next message
          and any new tool runs.
        </p>
      </div>

      <SettingsForm initial={initial} />
    </main>
  );
}
