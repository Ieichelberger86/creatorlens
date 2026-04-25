"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSessionUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

const STATUSES = [
  "idea",
  "drafting",
  "shooting",
  "edited",
  "scheduled",
  "posted",
  "cancelled",
] as const;

const CreateSchema = z.object({
  title: z.string().min(1).max(200),
  hook: z.string().max(500).optional(),
  script: z.string().max(20_000).optional(),
  notes: z.string().max(5_000).optional(),
  scheduled_for: z.string().optional(),
  status: z.enum(STATUSES).optional(),
});

export async function createCalendarEntry(formData: FormData) {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const parsed = CreateSchema.safeParse({
    title: formData.get("title"),
    hook: formData.get("hook") || undefined,
    script: formData.get("script") || undefined,
    notes: formData.get("notes") || undefined,
    scheduled_for: formData.get("scheduled_for") || undefined,
    status: formData.get("status") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const { title, hook, script, notes, scheduled_for, status } = parsed.data;

  let scheduledIso: string | null = null;
  if (scheduled_for) {
    const d = new Date(scheduled_for);
    if (!Number.isNaN(d.getTime())) scheduledIso = d.toISOString();
  }

  const db = supabaseAdmin();
  const { error } = await db.from("content_calendar").insert({
    user_id: user.id,
    title,
    hook: hook ?? null,
    script: script ?? null,
    notes: notes ?? null,
    scheduled_for: scheduledIso,
    status: status ?? (scheduledIso ? "scheduled" : "idea"),
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/app/calendar");
  return { ok: true };
}

export async function updateCalendarStatus(id: string, status: string) {
  const user = await getSessionUser();
  if (!user) return { ok: false };
  if (!STATUSES.includes(status as (typeof STATUSES)[number])) return { ok: false };
  const db = supabaseAdmin();
  const patch: Record<string, unknown> = { status };
  if (status === "posted") patch.posted_at = new Date().toISOString();
  await db
    .from("content_calendar")
    .update(patch)
    .eq("id", id)
    .eq("user_id", user.id);
  revalidatePath("/app/calendar");
  return { ok: true };
}

export async function rescheduleEntry(id: string, scheduled_for: string) {
  const user = await getSessionUser();
  if (!user) return { ok: false };
  const db = supabaseAdmin();
  let iso: string | null = null;
  if (scheduled_for) {
    const d = new Date(scheduled_for);
    if (!Number.isNaN(d.getTime())) iso = d.toISOString();
  }
  await db
    .from("content_calendar")
    .update({ scheduled_for: iso })
    .eq("id", id)
    .eq("user_id", user.id);
  revalidatePath("/app/calendar");
  return { ok: true };
}

export async function markPosted(id: string, posted_url: string) {
  const user = await getSessionUser();
  if (!user) return { ok: false };
  const db = supabaseAdmin();
  await db
    .from("content_calendar")
    .update({
      status: "posted",
      posted_url: posted_url || null,
      posted_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", user.id);
  revalidatePath("/app/calendar");
  return { ok: true };
}

export async function deleteCalendarEntry(id: string) {
  const user = await getSessionUser();
  if (!user) return { ok: false };
  const db = supabaseAdmin();
  await db.from("content_calendar").delete().eq("id", id).eq("user_id", user.id);
  revalidatePath("/app/calendar");
  return { ok: true };
}
