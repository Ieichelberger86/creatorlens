"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getSessionUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

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
});

export type OnboardingState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Partial<Record<keyof z.infer<typeof Schema>, string>>;
};

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

  const { tiktok_handle, niche, ninety_day_goal } = parsed.data;
  const admin = supabaseAdmin();

  // 1. Upsert creator_profile
  const { error: profileErr } = await admin
    .from("creator_profile")
    .upsert(
      {
        user_id: user.id,
        niche,
        goals: { ninety_day: ninety_day_goal },
        onboarded_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
  if (profileErr) {
    return { ok: false, error: `Couldn't save profile: ${profileErr.message}` };
  }

  // 2. Patch users.tiktok_handle if not already set
  await admin
    .from("users")
    .update({ tiktok_handle, display_name: `@${tiktok_handle}` })
    .eq("id", user.id);

  // 3. Seed a personalized opener conversation so /app isn't a cold start
  const opener = `Got it — you're on **@${tiktok_handle}** doing _${niche}_, chasing **${ninety_day_goal}** over the next 90 days. Solid focus.

Let's open with a quick content audit. Paste me **1–3 of your best recent videos** — TikTok links or just the hooks if that's faster — and I'll pull the patterns we can lean into.

If you'd rather start from scratch, just tell me the next video idea on your mind and we'll build the hook from there.`;

  const now = new Date().toISOString();
  await admin.from("conversations").insert({
    user_id: user.id,
    channel: "web",
    title: "Welcome",
    messages: [
      {
        role: "assistant",
        content: opener,
        created_at: now,
      },
    ],
    last_message_at: now,
  });

  redirect("/app");
}
