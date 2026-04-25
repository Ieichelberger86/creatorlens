"use server";

import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { reviewBrandDealExecutor } from "@/lib/lens/tools/review-brand-deal";

export async function submitBrandDealForReview(form: FormData) {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const offer_text = String(form.get("offer_text") ?? "").trim();
  const brand_name_hint = String(form.get("brand_name_hint") ?? "").trim() || undefined;

  if (offer_text.length < 30) {
    return { ok: false, error: "Paste the full offer text (at least a few sentences)." };
  }

  try {
    await reviewBrandDealExecutor(
      { offer_text, brand_name_hint },
      { userId: user.id }
    );
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Review failed.",
    };
  }
  revalidatePath("/app/brand-deals");
  return { ok: true };
}

export async function updateBrandDealStatus(id: string, status: string) {
  const user = await getSessionUser();
  if (!user) return { ok: false };
  const allowed = ["pending", "reviewed", "negotiating", "accepted", "declined", "expired"];
  if (!allowed.includes(status)) return { ok: false };
  const admin = supabaseAdmin();
  await admin
    .from("brand_deals")
    .update({ status })
    .eq("id", id)
    .eq("user_id", user.id);
  revalidatePath("/app/brand-deals");
  return { ok: true };
}

export async function deleteBrandDeal(id: string) {
  const user = await getSessionUser();
  if (!user) return { ok: false };
  const admin = supabaseAdmin();
  await admin.from("brand_deals").delete().eq("id", id).eq("user_id", user.id);
  revalidatePath("/app/brand-deals");
  return { ok: true };
}
