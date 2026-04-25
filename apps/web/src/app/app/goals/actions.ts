"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSessionUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

const STATUSES = ["active", "paused", "hit", "missed"] as const;

export async function setGoalStatus(id: string, status: string) {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Not signed in." };
  if (!STATUSES.includes(status as (typeof STATUSES)[number])) {
    return { ok: false, error: "Invalid status." };
  }
  const db = supabaseAdmin();
  const { error } = await db
    .from("goals")
    .update({ status })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/app/goals");
  return { ok: true };
}

const ProgressSchema = z.object({
  current_value: z.number().min(0),
});

export async function recordGoalProgress(id: string, currentValue: number) {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Not signed in." };
  const parsed = ProgressSchema.safeParse({ current_value: currentValue });
  if (!parsed.success) return { ok: false, error: "Need a non-negative number." };

  const db = supabaseAdmin();
  const { error } = await db
    .from("goals")
    .update({
      current_value: parsed.data.current_value,
      current_updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/app/goals");
  return { ok: true };
}

export async function deleteGoal(id: string) {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Not signed in." };
  const db = supabaseAdmin();
  const { error } = await db
    .from("goals")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/app/goals");
  return { ok: true };
}
