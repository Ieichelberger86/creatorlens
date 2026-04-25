import { redirect } from "next/navigation";
import type { Route } from "next";
import { getSessionUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * "Chat" nav target. Restores the pre-dashboard behavior of /app:
 *   - Onboarded users land in the most recent conversation.
 *   - If none exist, a fresh conversation is created and they're routed in.
 *
 * /app itself is now the Today dashboard.
 */
export default async function ChatRedirect() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const admin = supabaseAdmin();

  // Onboarding gate (mirrors /app)
  const { data: profile } = await admin
    .from("creator_profile")
    .select("niche, onboarded_at")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profile?.onboarded_at) {
    if (profile?.niche) redirect("/app/onboarding/running" as Route);
    redirect("/app/onboarding" as Route);
  }

  // Most recent web conversation
  const { data: conv } = await admin
    .from("conversations")
    .select("id")
    .eq("user_id", user.id)
    .eq("channel", "web")
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (conv?.id) redirect(`/app/c/${conv.id}` as Route);

  // None yet — create one
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

  redirect("/app" as Route);
}
