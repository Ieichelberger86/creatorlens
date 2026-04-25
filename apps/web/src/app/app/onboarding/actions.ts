"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getSessionUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { runProfileAudit } from "@/lib/lens/audit";
import { setGoalsFromAudit } from "@/lib/lens/goal-setter";

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

  // 1. Upsert creator_profile
  const { error: profileErr } = await admin
    .from("creator_profile")
    .upsert(
      {
        user_id: user.id,
        niche,
        goals: { ninety_day: ninety_day_goal },
        monetization_streams,
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

  // 3. Live profile audit + personalized opener
  // Best-effort — if the scrape fails, runProfileAudit returns a fallback
  // template opener so onboarding never blocks on Apify.
  const audit = await runProfileAudit({
    userId: user.id,
    handle: tiktok_handle,
    niche,
    ninetyDayGoal: ninety_day_goal,
    monetizationStreams: monetization_streams,
    limit: 10,
  });

  // 4. Decompose the 90-day goal into structured goals + action plans
  // (best-effort — onboarding completes even if this step fails)
  let goalsBlock = "";
  if (audit.ok) {
    try {
      const goalsRes = await setGoalsFromAudit({
        userId: user.id,
        handle: tiktok_handle,
        niche,
        ninetyDayGoal: ninety_day_goal,
        monetizationStreams: monetization_streams,
        audit: audit.opener,
        baseline: audit.baseline,
      });
      goalsBlock = goalsRes.goalsSummaryMarkdown;
    } catch {
      goalsBlock = "";
    }
  }

  const fullOpener = audit.opener + goalsBlock;

  const now = new Date().toISOString();
  await admin.from("conversations").insert({
    user_id: user.id,
    channel: "web",
    title: audit.ok ? "Profile audit + goals" : "Welcome",
    messages: [
      {
        role: "assistant",
        content: fullOpener,
        created_at: now,
      },
    ],
    last_message_at: now,
  });

  redirect("/app");
}
