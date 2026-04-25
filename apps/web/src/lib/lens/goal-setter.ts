import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, LENS_MODEL } from "./client.js";
import { supabaseAdmin } from "@/lib/supabase/admin";

type GoalKind =
  | "followers"
  | "views"
  | "engagement"
  | "monetization"
  | "consistency"
  | "audience_quality"
  | "other";

type StructuredGoal = {
  title: string;
  kind: GoalKind;
  target_value: number | null;
  target_unit: string;
  target_date: string; // ISO date YYYY-MM-DD
  baseline_value: number | null;
  why_it_matters: string;
  action_plan: string;
  milestones: Array<{ title: string; target_date: string }>;
};

type GoalsPayload = {
  goals: StructuredGoal[];
  review: string;
};

const SAVE_GOALS_TOOL: Anthropic.Tool = {
  name: "save_goals",
  description:
    "Save the structured goal breakdown for this creator. Always include 1-3 goals (not more — focus matters) and a short review tying the audit findings to those goals.",
  input_schema: {
    type: "object",
    properties: {
      review: {
        type: "string",
        description:
          "100-180 word markdown review tying the audit findings to the chosen goals. Sets up *why* these are the right goals to chase right now.",
      },
      goals: {
        type: "array",
        minItems: 1,
        maxItems: 3,
        items: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description:
                "Short goal headline, e.g. 'Hit 50K followers by July 24, 2026' or 'Land 2 paid brand deals'.",
            },
            kind: {
              type: "string",
              enum: [
                "followers",
                "views",
                "engagement",
                "monetization",
                "consistency",
                "audience_quality",
                "other",
              ],
            },
            target_value: {
              type: "number",
              description:
                "Numeric target (e.g. 50000 for 50K followers). Null if not numeric.",
            },
            target_unit: {
              type: "string",
              description:
                "Unit for target_value, e.g. 'followers', 'avg views per post', '$ MRR', 'brand deals', 'videos posted'.",
            },
            target_date: {
              type: "string",
              description: "Target date in YYYY-MM-DD format. ~90 days from today.",
            },
            baseline_value: {
              type: "number",
              description:
                "Current value at goal creation time, taken from the audit metrics if available. Null if unknown.",
            },
            why_it_matters: {
              type: "string",
              description:
                "1-2 sentences. Tie this goal to the creator's monetization stream and 90-day vision. Be concrete: what does hitting this unlock?",
            },
            action_plan: {
              type: "string",
              description:
                "Markdown action plan, 250-400 words. Sections required: ## Week 1 (specific tactics this week) / ## Weeks 2-4 / ## Weeks 5-8 / ## Weeks 9-12. Each week block lists 3-5 specific actions, not generic advice. Reference the audit's 'what's working' patterns and 'experiments' where relevant.",
            },
            milestones: {
              type: "array",
              minItems: 3,
              maxItems: 5,
              items: {
                type: "object",
                properties: {
                  title: {
                    type: "string",
                    description: "Milestone marker, e.g. 'Hit 25K followers (50% mark)'.",
                  },
                  target_date: {
                    type: "string",
                    description: "Milestone date YYYY-MM-DD.",
                  },
                },
                required: ["title", "target_date"],
              },
            },
          },
          required: [
            "title",
            "kind",
            "target_unit",
            "target_date",
            "why_it_matters",
            "action_plan",
            "milestones",
          ],
        },
      },
    },
    required: ["review", "goals"],
  },
};

export type GoalSetterResult = {
  ok: boolean;
  goals_saved: number;
  review: string;
  goalsSummaryMarkdown: string;
};

/**
 * After the audit completes, decompose the creator's free-text 90-day goal
 * into 1-3 structured, measurable goals with action plans, and persist them
 * to public.goals. Returns markdown to append to the audit chat message.
 */
export async function setGoalsFromAudit(args: {
  userId: string;
  handle: string;
  niche: string;
  ninetyDayGoal: string;
  monetizationStreams: string[];
  audit: string; // the full audit markdown so the model can ground goals in real findings
  baseline: {
    followers: number | null;
    median_views: number | null;
    avg_views: number | null;
    posts_per_week: number | null;
    like_rate_pct: number | null;
    save_rate_pct: number | null;
    comment_rate_pct: number | null;
    videos_analyzed: number;
  };
}): Promise<GoalSetterResult> {
  const { userId, handle, niche, ninetyDayGoal, monetizationStreams, audit, baseline } = args;
  const today = new Date().toISOString().slice(0, 10);
  const ninetyOut = new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10);

  let payload: GoalsPayload | null = null;

  try {
    const res = await anthropic().messages.create({
      model: LENS_MODEL,
      max_tokens: 3500,
      tools: [SAVE_GOALS_TOOL],
      tool_choice: { type: "tool", name: "save_goals" },
      system: `You're Lens setting structured 90-day goals for a creator who just finished onboarding.

You've seen their full audit, their stated 90-day vision, their niche, their monetization streams, and their baseline metrics.

Translate their stated 90-day goal into 1-3 SMART goals that:
1. Are measurable (numeric target where possible)
2. Are tied to the monetization stream they actually care about
3. Have a baseline number captured from the audit metrics (so progress is provable later)
4. Have a 90-day target date (use the date provided in the user message)
5. Have a real action plan — week-by-week — that references the audit's findings

Constraints:
- Pick 1-3 goals, not more. Focus is the entire point.
- If their stated goal is fuzzy ("get bigger"), break it into a measurable proxy (e.g. "Hit 25K followers" + "Land 1 brand deal under $1k").
- The action_plan must reference specific patterns from the audit (e.g. "Lean into the 3-tip format that hit 142K — schedule one per week"). NEVER write generic advice like "post more consistently" or "engage with comments".
- Milestones split the 90 days into 3-5 checkpoints with concrete numbers.

Call save_goals with the structured plan.`,
      messages: [
        {
          role: "user",
          content: `Today's date: ${today}
Target date for 90-day goals: ${ninetyOut}

Creator: @${handle}
Niche: ${niche}
Their stated 90-day goal: "${ninetyDayGoal}"
Monetization streams (where they actually make money): ${
            monetizationStreams.length ? monetizationStreams.join(", ") : "(not specified)"
          }

BASELINE METRICS (snapshot from audit):
- Followers: ${baseline.followers ?? "unknown"}
- Median views (last ${baseline.videos_analyzed}): ${baseline.median_views ?? "unknown"}
- Average views: ${baseline.avg_views ?? "unknown"}
- Posting cadence: ${baseline.posts_per_week ?? "unknown"} videos/week
- Engagement rates: like ${baseline.like_rate_pct ?? "?"}%, save ${baseline.save_rate_pct ?? "?"}%, comment ${baseline.comment_rate_pct ?? "?"}%

THE AUDIT (what you already told them):
"""
${audit}
"""

Now decompose their 90-day goal into structured goals + action plans. Use baseline_value from the metrics above where it makes sense (e.g. for a "followers" goal, baseline_value = current followers).`,
        },
      ],
    });

    const toolUse = res.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "save_goals"
    );
    if (toolUse) {
      payload = toolUse.input as GoalsPayload;
    }
  } catch (err) {
    return {
      ok: false,
      goals_saved: 0,
      review: "",
      goalsSummaryMarkdown: `\n\n---\n\n_(Goal-setter failed: ${
        err instanceof Error ? err.message : String(err)
      } — you can run \`set_goals\` from chat anytime.)_`,
    };
  }

  if (!payload || !payload.goals?.length) {
    return {
      ok: false,
      goals_saved: 0,
      review: "",
      goalsSummaryMarkdown: "",
    };
  }

  const db = supabaseAdmin();

  // Insert each goal
  const rows = payload.goals.map((g) => ({
    user_id: userId,
    title: g.title,
    kind: g.kind,
    target_value: g.target_value ?? null,
    target_unit: g.target_unit,
    target_date: g.target_date,
    baseline_value: g.baseline_value ?? null,
    baseline_captured_at: new Date().toISOString(),
    current_value: g.baseline_value ?? null,
    current_updated_at: new Date().toISOString(),
    status: "active" as const,
    why_it_matters: g.why_it_matters,
    action_plan: g.action_plan,
    milestones: g.milestones,
    source: "onboarding_audit",
  }));

  const { data: saved, error } = await db.from("goals").insert(rows).select("id, title");
  if (error) {
    return {
      ok: false,
      goals_saved: 0,
      review: payload.review,
      goalsSummaryMarkdown: `\n\n---\n\n_(Couldn't save goals to the goals table: ${error.message})_`,
    };
  }

  const goalsSummaryMarkdown = renderGoalsBlock(payload, saved?.length ?? 0);

  return {
    ok: true,
    goals_saved: saved?.length ?? 0,
    review: payload.review,
    goalsSummaryMarkdown,
  };
}

function renderGoalsBlock(payload: GoalsPayload, savedCount: number): string {
  const goalLines = payload.goals
    .map(
      (g, i) =>
        `**${i + 1}. ${g.title}**  \n` +
        `*Why it matters:* ${g.why_it_matters}  \n` +
        (g.target_value !== null && g.target_value !== undefined
          ? `*Baseline → target:* ${(g.baseline_value ?? "?").toString()} → ${g.target_value} ${g.target_unit} by ${g.target_date}\n`
          : `*Target:* ${g.target_unit} by ${g.target_date}\n`)
    )
    .join("\n");

  return `\n\n---\n\n# Your 90-day goals\n\n${payload.review}\n\n${goalLines}\n\n👉 Full action plans (week-by-week tactics) are saved at **/app/goals**. ${
    savedCount === 1
      ? "1 goal locked in."
      : `${savedCount} goals locked in.`
  } Want to start working on goal #1 right now?`;
}
