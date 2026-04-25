"use server";

import { revalidatePath } from "next/cache";
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
  display_name: z
    .string()
    .max(80)
    .optional()
    .transform((s) => (s ? s.trim() : undefined)),
  niche: z.string().min(8, "A sentence or two about your niche.").max(500),
  ninety_day_goal: z
    .string()
    .min(8, "What does winning in 90 days look like?")
    .max(500),
  brand_notes: z.string().max(2_000).optional(),
  monetization_streams: z
    .array(z.enum(STREAMS))
    .min(1, "Pick at least one revenue stream you're going after.")
    .max(9),
  voice_samples: z
    .array(z.string().min(2).max(600))
    .max(10),
});

export type SettingsState = {
  ok: boolean;
  saved?: boolean;
  error?: string;
  fieldErrors?: Partial<Record<keyof z.infer<typeof Schema>, string>>;
};

export async function saveSettings(
  _prev: SettingsState | null,
  form: FormData
): Promise<SettingsState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const voiceRaw = form.getAll("voice_samples").map((v) => String(v).trim());
  const voiceSamples = voiceRaw.filter((v) => v.length > 0);

  const raw = {
    tiktok_handle: String(form.get("tiktok_handle") ?? ""),
    display_name: String(form.get("display_name") ?? "") || undefined,
    niche: String(form.get("niche") ?? "").trim(),
    ninety_day_goal: String(form.get("ninety_day_goal") ?? "").trim(),
    brand_notes: String(form.get("brand_notes") ?? "").trim() || undefined,
    monetization_streams: form.getAll("monetization_streams").map(String),
    voice_samples: voiceSamples,
  };

  const parsed = Schema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: SettingsState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const k = issue.path[0] as keyof z.infer<typeof Schema>;
      if (k && !fieldErrors[k]) fieldErrors[k] = issue.message;
    }
    return { ok: false, error: "Fix the highlighted fields.", fieldErrors };
  }

  const {
    tiktok_handle,
    display_name,
    niche,
    ninety_day_goal,
    brand_notes,
    monetization_streams,
    voice_samples,
  } = parsed.data;

  const admin = supabaseAdmin();

  const { error: profileErr } = await admin
    .from("creator_profile")
    .upsert(
      {
        user_id: user.id,
        niche,
        goals: { ninety_day: ninety_day_goal },
        brand_notes: brand_notes ?? null,
        monetization_streams,
        voice_samples,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
  if (profileErr) {
    return { ok: false, error: `Couldn't save profile: ${profileErr.message}` };
  }

  await admin
    .from("users")
    .update({
      tiktok_handle,
      display_name: display_name ?? `@${tiktok_handle}`,
    })
    .eq("id", user.id);

  revalidatePath("/app/settings");
  return { ok: true, saved: true };
}
