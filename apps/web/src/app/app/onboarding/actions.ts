"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getSessionUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

const STREAMS = [
  "live_gifts",
  "creator_rewards",
  "brand_deals",
  "tiktok_shop_affiliate",
  "tiktok_shop_seller",
  "subscriptions",
  "lead_gen",
  "info_product",
  "ugc_contracts",
] as const;

const Schema = z.object({
  tiktok_handle: z
    .string()
    .min(1, "Add your TikTok handle.")
    .max(40)
    .transform((s) => s.trim().replace(/^@+/, "").toLowerCase())
    .pipe(
      z
        .string()
        .regex(
          /^[a-z0-9._]{1,40}$/,
          "Handle should be the part after @ — letters, numbers, dots, underscores."
        )
    ),
  niche: z
    .string()
    .min(8, "A sentence or two about your niche.")
    .max(500),
  ninety_day_goal: z
    .string()
    .min(8, "What does winning in 90 days look like?")
    .max(500),
  monetization_streams: z
    .array(z.enum(STREAMS))
    .min(1, "Pick at least one revenue stream you're going after.")
    .max(9),
});

export type OnboardingState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Partial<Record<keyof z.infer<typeof Schema>, string>>;
};

/**
 * Form action: saves the creator profile inputs (niche, goal, monetization)
 * and redirects to /app/onboarding/running, which runs the audit + goals
 * and streams live progress to the user. Avoids a 60-90s silent wait on
 * the form submit.
 */
export async function saveOnboarding(
  _prev: OnboardingState | null,
  form: FormData
): Promise<OnboardingState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const raw = {
    tiktok_handle: String(form.get("tiktok_handle") ?? ""),
    niche: String(form.get("niche") ?? "").trim(),
    ninety_day_goal: String(form.get("ninety_day_goal") ?? "").trim(),
    monetization_streams: form.getAll("monetization_streams").map(String),
  };

  const parsed = Schema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: OnboardingState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const k = issue.path[0] as keyof z.infer<typeof Schema>;
      if (k && !fieldErrors[k]) fieldErrors[k] = issue.message;
    }
    return { ok: false, error: "Fix the highlighted fields.", fieldErrors };
  }

  const { tiktok_handle, niche, ninety_day_goal, monetization_streams } = parsed.data;
  const admin = supabaseAdmin();

  // Save profile inputs WITHOUT onboarded_at — that fires after audit completes
  // on the streaming runner. niche is set so /app/onboarding/running knows
  // there's work in progress.
  const { error: profileErr } = await admin
    .from("creator_profile")
    .upsert(
      {
        user_id: user.id,
        niche,
        goals: { ninety_day: ninety_day_goal },
        monetization_streams,
        // onboarded_at intentionally null — set by the streaming runner
      },
      { onConflict: "user_id" }
    );
  if (profileErr) {
    return { ok: false, error: `Couldn't save profile: ${profileErr.message}` };
  }

  await admin
    .from("users")
    .update({ tiktok_handle, display_name: `@${tiktok_handle}` })
    .eq("id", user.id);

  redirect("/app/onboarding/running");
}
