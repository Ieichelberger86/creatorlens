"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { Route } from "next";
import { getSessionUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function createNewConversation(): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const admin = supabaseAdmin();
  const { data } = await admin
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

  if (!data) redirect("/app" as Route);
  revalidatePath("/app");
  redirect(`/app/c/${data.id}` as Route);
}

/**
 * Create a brand-new conversation, seed it with the user's first message,
 * and redirect into it with a query flag so chat-client picks up the
 * pending prompt and auto-sends. Used by the dashboard hero composer.
 */
export async function createConversationFromPrompt(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const message = String(formData.get("message") ?? "").trim();
  if (!message) redirect("/app" as Route);

  const admin = supabaseAdmin();
  const { data } = await admin
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

  if (!data) redirect("/app" as Route);
  revalidatePath("/app");
  // ?send=<encoded> tells chat-client to auto-fire the message on mount
  redirect(`/app/c/${data.id}?send=${encodeURIComponent(message)}` as Route);
}

export async function deleteConversation(id: string) {
  const user = await getSessionUser();
  if (!user) return { ok: false };
  const admin = supabaseAdmin();
  await admin
    .from("conversations")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  revalidatePath("/app");
  return { ok: true };
}

export async function renameConversation(id: string, title: string) {
  const user = await getSessionUser();
  if (!user) return { ok: false };
  const admin = supabaseAdmin();
  await admin
    .from("conversations")
    .update({ title: title.trim().slice(0, 100) || null })
    .eq("id", id)
    .eq("user_id", user.id);
  revalidatePath("/app");
  return { ok: true };
}

export async function saveDraftToCalendar(args: {
  title: string;
  hook?: string | null;
  script?: string | null;
  notes?: string | null;
  scheduledFor?: string | null;
  sourceConversationId?: string | null;
}) {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "not signed in" };
  const admin = supabaseAdmin();

  let scheduledIso: string | null = null;
  if (args.scheduledFor) {
    const d = new Date(args.scheduledFor);
    if (!Number.isNaN(d.getTime())) scheduledIso = d.toISOString();
  }

  const { data, error } = await admin
    .from("content_calendar")
    .insert({
      user_id: user.id,
      title: args.title.slice(0, 200),
      hook: args.hook ?? null,
      script: args.script ?? null,
      notes: args.notes ?? null,
      scheduled_for: scheduledIso,
      status: scheduledIso ? "scheduled" : "idea",
      source_conversation_id: args.sourceConversationId ?? null,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "save failed" };
  revalidatePath("/app/calendar");
  return { ok: true, id: data.id };
}
