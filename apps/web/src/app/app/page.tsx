import { redirect } from "next/navigation";
import type { Route } from "next";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function LensAppPage() {
  const user = await getSessionUser();
  if (!user) return null;

  const admin = supabaseAdmin();

  // Onboarding gate
  const { data: profile } = await admin
    .from("creator_profile")
    .select("onboarded_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile?.onboarded_at) {
    redirect("/app/onboarding");
  }

  // Find the most recent web conversation; create one if none exists.
  const { data: conv } = await admin
    .from("conversations")
    .select("id")
    .eq("user_id", user.id)
    .eq("channel", "web")
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (conv?.id) {
    redirect(`/app/c/${conv.id}` as Route);
  }

  const { data: created } = await admin
    .from("conversations")
    .insert({
      user_id: user.id,
      channel: "web",
      title: null,
      messages: [],
      last_message_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (created?.id) redirect(`/app/c/${created.id}` as Route);
  // If insert failed for some reason, just send them onboarding-side
  redirect("/app/onboarding");
}
