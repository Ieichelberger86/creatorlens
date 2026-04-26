"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";

const TIERS = ["preorder", "founding", "vanguard", "admin"] as const;

export async function sendNudge(userId: string, message: string) {
  if (!userId || !message || message.length < 4) {
    return { ok: false, error: "Need a real message." };
  }
  const admin = supabaseAdmin();
  const { error } = await admin.from("pending_lens_messages").insert({
    user_id: userId,
    source: "agency_nudge",
    payload: { content: message.trim() },
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/agency");
  return { ok: true };
}

export async function setUserTier(userId: string, tier: string) {
  if (!TIERS.includes(tier as (typeof TIERS)[number])) {
    return { ok: false, error: "Invalid tier." };
  }
  const admin = supabaseAdmin();
  const patch: Record<string, unknown> = { tier };
  if (tier === "vanguard" || tier === "admin") patch.vanguard_creator = true;
  const { error } = await admin.from("users").update(patch).eq("id", userId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/agency");
  return { ok: true };
}

export async function setTokenCap(userId: string, cap: number | null) {
  const admin = supabaseAdmin();
  const { error } = await admin
    .from("users")
    .update({ monthly_token_cap: cap })
    .eq("id", userId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/agency");
  return { ok: true };
}

export async function resetTokenMeter(userId: string) {
  const admin = supabaseAdmin();
  const { error } = await admin
    .from("users")
    .update({
      monthly_tokens_used: 0,
      monthly_period_start: new Date().toISOString(),
    })
    .eq("id", userId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/agency");
  return { ok: true };
}
