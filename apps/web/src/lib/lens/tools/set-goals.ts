import type Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { setGoalsFromAudit } from "../goal-setter.js";

export const setGoalsTool: Anthropic.Tool = {
  name: "set_goals",
  description:
    "Decompose the creator's 90-day vision into 1-3 structured, measurable goals with week-by-week action plans. Saves to the goals table and surfaces at /app/goals. Use when the creator says 'set my goals', 'reset goals', 'I want to refocus', or any time their direction has materially shifted. NEVER call without user intent — Lens already runs this once during onboarding.",
  input_schema: {
    type: "object",
    properties: {
      ninety_day_goal: {
        type: "string",
        description:
          "The creator's stated 90-day vision in plain English. If empty, falls back to creator_profile.goals.ninety_day.",
      },
      replace_existing: {
        type: "boolean",
        description:
          "If true, mark all existing active goals as paused before creating new ones. Default false.",
      },
    },
  },
};

export async function setGoalsExecutor(
  input: Record<string, unknown>,
  ctx: { userId: string }
): Promise<string> {
  const { ninety_day_goal, replace_existing } = input as {
    ninety_day_goal?: string;
    replace_existing?: boolean;
  };

  const db = supabaseAdmin();

  // Pull the creator's profile + handle
  const [{ data: profile }, { data: userRow }] = await Promise.all([
    db
      .from("creator_profile")
      .select("niche, monetization_streams, top_videos, goals")
      .eq("user_id", ctx.userId)
      .maybeSingle(),
    db
      .from("users")
      .select("tiktok_handle, display_name, email")
      .eq("id", ctx.userId)
      .maybeSingle(),
  ]);

  if (!profile) {
    return "Can't set goals — your profile isn't set up yet. Finish onboarding first at /app/onboarding.";
  }

  const niche = profile.niche ?? "(unknown niche)";
  const monetizationStreams =
    (profile.monetization_streams as string[] | null) ?? [];
  const handle = userRow?.tiktok_handle ?? "creator";

  const goalText =
    ninety_day_goal ||
    (profile.goals && typeof profile.goals === "object"
      ? ((profile.goals as Record<string, unknown>).ninety_day as string | undefined)
      : undefined) ||
    "";

  if (!goalText) {
    return "I need a 90-day goal to decompose. Tell me what winning looks like for you over the next 90 days.";
  }

  // Pull baseline metrics from the most recent videos
  const { data: videos } = await db
    .from("videos")
    .select("performance, analyzed_at")
    .eq("user_id", ctx.userId)
    .eq("is_own", true)
    .order("analyzed_at", { ascending: false })
    .limit(20);

  const own = (videos ?? [])
    .map((v) => v.performance as Record<string, unknown> | null)
    .filter((p): p is Record<string, unknown> => p !== null);

  const views = own
    .map((p) => (typeof p.views === "number" ? p.views : 0))
    .filter((v) => v > 0);
  const median = views.length
    ? views.sort((a, b) => a - b)[Math.floor(views.length / 2)] ?? null
    : null;
  const avg = views.length
    ? Math.round(views.reduce((s, v) => s + v, 0) / views.length)
    : null;

  // Pause existing active goals if requested
  if (replace_existing) {
    await db
      .from("goals")
      .update({ status: "paused" })
      .eq("user_id", ctx.userId)
      .eq("status", "active");
  }

  // Pull the most recent assistant audit message from conversations to ground
  // the goal-setter in real findings (best-effort)
  const { data: recentConv } = await db
    .from("conversations")
    .select("messages")
    .eq("user_id", ctx.userId)
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const messages = (recentConv?.messages as Array<{ role: string; content: string }> | null) ?? [];
  const auditMessage =
    messages.find(
      (m) => m.role === "assistant" && typeof m.content === "string" && m.content.startsWith("# Your audit")
    )?.content ?? "(no audit on file — set goals from stated vision alone)";

  const result = await setGoalsFromAudit({
    userId: ctx.userId,
    handle,
    niche,
    ninetyDayGoal: goalText,
    monetizationStreams,
    audit: auditMessage,
    baseline: {
      followers: null, // not cached; goal-setter handles null
      median_views: median,
      avg_views: avg,
      posts_per_week: null,
      like_rate_pct: null,
      save_rate_pct: null,
      comment_rate_pct: null,
      videos_analyzed: own.length,
    },
  });

  if (!result.ok) {
    return "Couldn't generate goals. Try again or paste your vision in plain English.";
  }

  return result.goalsSummaryMarkdown.trim() || "Goals saved. See /app/goals.";
}
