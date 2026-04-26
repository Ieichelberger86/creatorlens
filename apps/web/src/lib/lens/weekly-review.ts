import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, LENS_MODEL } from "./client.js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { scrapeTikTokProfile, fetchSubtitleText, type TikTokPost } from "./apify.js";

export type WeeklyReviewResult = {
  ok: boolean;
  weekStarting: string; // YYYY-MM-DD
  reviewId: string | null;
  videosAnalyzed: number;
  reason?: string;
};

type GoalProgressEntry = {
  goal_id: string;
  title: string;
  baseline: number | null;
  current: number | null;
  target: number | null;
  pct: number | null;
  delta_this_week: number | null;
};

type VideoPlan = {
  title: string;
  hook: string;
  format: "talking-to-camera" | "stitch" | "b-roll" | "live" | "other";
  target_day_offset: number; // 0=Mon, 6=Sun of the week the review covers
  description: string;
  hashtags: string[];
  why: string;
  goal_id?: string | null; // which active goal this video serves
};

type WeeklyReviewPayload = {
  last_week_summary: string;
  this_week_plan: string;
  videos: VideoPlan[];
  goal_progress: GoalProgressEntry[];
  biggest_leverage_move: string;
};

const REVIEW_TOOL: Anthropic.Tool = {
  name: "save_weekly_review",
  description: "Save the structured weekly review to the system.",
  input_schema: {
    type: "object",
    properties: {
      last_week_summary: {
        type: "string",
        description:
          "200-400 word markdown review of the last 7 days. Sections: ## What shipped (each video posted with views vs baseline) / ## What worked / ## What missed / ## Goal progress (one line per active goal). Cite numbers throughout.",
      },
      this_week_plan: {
        type: "string",
        description:
          "200-400 word markdown narrative for the human reader: why these 5 videos this week, what theme connects them, what's the big bet. The structured `videos` array carries the actual ideas — keep this section about the strategy, not the per-video details.",
      },
      videos: {
        type: "array",
        minItems: 4,
        maxItems: 7,
        description:
          "5-7 specific video ideas for the next 7 days. Each becomes a calendar entry the creator can film as-is.",
        items: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description: "Short internal title for the calendar entry (≤80 chars).",
            },
            hook: {
              type: "string",
              description:
                "Opening line in the creator's voice. Max 14 words. The literal first line they'd say on camera.",
            },
            format: {
              type: "string",
              enum: ["talking-to-camera", "stitch", "b-roll", "live", "other"],
            },
            target_day_offset: {
              type: "integer",
              minimum: 0,
              maximum: 6,
              description: "0 = Monday, 6 = Sunday of the upcoming week.",
            },
            description: {
              type: "string",
              description:
                "TikTok caption — 80-180 chars. Hook-driven, pulls in keywords from the niche, includes 1-2 hashtags inline if natural. NO 'follow for more' fluff.",
            },
            hashtags: {
              type: "array",
              minItems: 4,
              maxItems: 8,
              items: { type: "string" },
              description:
                "Hashtag set (without the # symbol). 4-8 tags mixing one big-volume tag, two niche tags, one specific topic tag. Same casing as TikTok would render them (lowercase).",
            },
            why: {
              type: "string",
              description: "1-sentence reasoning tied to the audit / last week's data + which goal this video serves.",
            },
            goal_id: {
              type: "string",
              description:
                "The id (8-char prefix is fine) of the active goal this video directly serves. Required if there are active goals. Leave empty only if no active goals exist.",
            },
          },
          required: [
            "title",
            "hook",
            "format",
            "target_day_offset",
            "description",
            "hashtags",
            "why",
          ],
        },
      },
      goal_progress: {
        type: "array",
        items: {
          type: "object",
          properties: {
            goal_id: { type: "string" },
            title: { type: "string" },
            baseline: { type: "number" },
            current: { type: "number" },
            target: { type: "number" },
            pct: { type: "number" },
            delta_this_week: { type: "number" },
          },
          required: ["goal_id", "title"],
        },
      },
      biggest_leverage_move: {
        type: "string",
        description:
          "ONE thing — a single sentence — picking the highest-leverage move for the week. Must be specific. NOT a list.",
      },
    },
    required: [
      "last_week_summary",
      "this_week_plan",
      "videos",
      "goal_progress",
      "biggest_leverage_move",
    ],
  },
};

/**
 * Generate a structured weekly review for one creator.
 * - Pulls last 7 days of posted videos via Apify
 * - Compares against existing baseline + active goals
 * - Asks Claude (via tool_use) to write last-week recap + this-week plan
 * - Persists to weekly_reviews table (one row per user_id+week_starting)
 *
 * Idempotent on (user_id, week_starting) — re-running for the same week
 * updates the existing row.
 */
export async function generateWeeklyReview(args: {
  userId: string;
}): Promise<WeeklyReviewResult> {
  const { userId } = args;
  const db = supabaseAdmin();

  // Compute the week-starting date (Monday of this week, UTC)
  const now = new Date();
  const day = now.getUTCDay(); // 0 = Sun, 1 = Mon, …
  const offsetToMonday = ((day + 6) % 7); // days back to Monday
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - offsetToMonday);
  monday.setUTCHours(0, 0, 0, 0);
  const weekStarting = monday.toISOString().slice(0, 10);

  // Pull profile + handle + active goals + recent calendar
  const [{ data: profile }, { data: userRow }, { data: goals }] = await Promise.all([
    db
      .from("creator_profile")
      .select("niche, voice_samples, monetization_streams, brand_notes")
      .eq("user_id", userId)
      .maybeSingle(),
    db
      .from("users")
      .select("tiktok_handle, display_name")
      .eq("id", userId)
      .maybeSingle(),
    db
      .from("goals")
      .select(
        "id, title, kind, baseline_value, current_value, target_value, target_unit, target_date, action_plan"
      )
      .eq("user_id", userId)
      .eq("status", "active")
      .order("target_date", { ascending: true }),
  ]);

  const handle = userRow?.tiktok_handle ?? "";
  const niche = profile?.niche ?? "";
  if (!handle || !niche) {
    return {
      ok: false,
      weekStarting,
      reviewId: null,
      videosAnalyzed: 0,
      reason: "Profile incomplete — set handle + niche first.",
    };
  }

  // Pull last 30 videos and filter to the last 7 days. Apify scrapes are
  // newest-first, so 30 covers most weekly cadences with headroom.
  let recentPosts: TikTokPost[] = [];
  try {
    recentPosts = await scrapeTikTokProfile(handle, 30);
  } catch (err) {
    return {
      ok: false,
      weekStarting,
      reviewId: null,
      videosAnalyzed: 0,
      reason: err instanceof Error ? err.message : String(err),
    };
  }

  const sevenDaysAgo = Date.now() - 7 * 86_400_000;
  const lastWeekVideos = recentPosts.filter((p) => {
    if (!p.createTimeISO) return false;
    return Date.parse(p.createTimeISO) >= sevenDaysAgo;
  });

  // Best-effort transcript fetch for the videos that posted in the last week
  await Promise.all(
    lastWeekVideos.map(async (p) => {
      const en = (p.videoMeta?.subtitleLinks ?? []).find((s) =>
        (s.language ?? "").toLowerCase().startsWith("en")
      );
      if (en?.downloadLink && !p.text) {
        const t = await fetchSubtitleText(en.downloadLink);
        if (t) p.text = t;
      }
    })
  );

  // Persist the videos so /app/insights stats stay current
  if (lastWeekVideos.length) {
    await db.from("videos").upsert(
      lastWeekVideos
        .filter((p) => p.webVideoUrl)
        .map((p) => ({
          user_id: userId,
          tiktok_url: p.webVideoUrl as string,
          tiktok_id: p.id ?? null,
          is_own: true,
          transcript: p.text ?? null,
          performance: {
            views: p.playCount ?? null,
            likes: p.diggCount ?? null,
            comments: p.commentCount ?? null,
            shares: p.shareCount ?? null,
            saves: p.collectCount ?? null,
            posted_at: p.createTimeISO ?? null,
            duration_sec: p.videoMeta?.duration ?? null,
            hashtags: (p.hashtags ?? []).map((h) => h.name).filter(Boolean),
            caption: p.text ?? null,
          },
          analyzed_at: new Date().toISOString(),
        })),
      { onConflict: "user_id,tiktok_url" }
    );
  }

  // Compute baselines from broader history (all videos in our `videos`
  // table, not just last-week)
  const { data: history } = await db
    .from("videos")
    .select("performance, analyzed_at")
    .eq("user_id", userId)
    .eq("is_own", true)
    .order("analyzed_at", { ascending: false })
    .limit(100);

  const allViews = (history ?? [])
    .map((v) => {
      const perf = v.performance as { views?: number } | null;
      return perf?.views ?? 0;
    })
    .filter((v) => v > 0);
  const sortedViews = [...allViews].sort((a, b) => a - b);
  const medianViews = sortedViews.length
    ? sortedViews[Math.floor(sortedViews.length / 2)] ?? 0
    : 0;
  const avgViews = allViews.length
    ? Math.round(allViews.reduce((s, v) => s + v, 0) / allViews.length)
    : 0;

  // Compactly describe last-week videos for Claude
  const lastWeekCompact = lastWeekVideos.map((p, i) => ({
    n: i + 1,
    url: p.webVideoUrl,
    posted_at: p.createTimeISO,
    views: p.playCount,
    likes: p.diggCount,
    comments: p.commentCount,
    saves: p.collectCount,
    duration_sec: p.videoMeta?.duration,
    vs_median: p.playCount && medianViews > 0
      ? +((p.playCount / medianViews)).toFixed(2)
      : null,
    caption: p.text?.slice(0, 200),
    hashtags: (p.hashtags ?? []).map((h) => h.name).filter(Boolean),
  }));

  // Auto-derive new current values for each goal based on the freshest data.
  // For followers/views/consistency we can compute it; for monetization/other
  // we leave the existing manual value.
  const followerCount =
    (recentPosts[0]?.authorMeta?.fans as number | undefined) ?? null;

  const lastWeekTotalViews = lastWeekVideos.reduce(
    (s, p) => s + (p.playCount ?? 0),
    0
  );
  const last30dPosts = recentPosts
    .filter((p) => p.createTimeISO)
    .filter(
      (p) =>
        Date.parse(p.createTimeISO ?? "") >= Date.now() - 30 * 86_400_000
    );
  const recentAvgViews = last30dPosts.length
    ? Math.round(
        last30dPosts.reduce((s, p) => s + (p.playCount ?? 0), 0) /
          last30dPosts.length
      )
    : 0;
  const postsLastWeek = lastWeekVideos.length;

  // Pull last week's review (if any) to compute deltas
  const { data: priorReview } = await db
    .from("weekly_reviews")
    .select("goal_progress")
    .eq("user_id", userId)
    .lt("week_starting", weekStarting)
    .order("week_starting", { ascending: false })
    .limit(1)
    .maybeSingle();
  const priorProgressMap = new Map<string, number>();
  if (priorReview?.goal_progress && Array.isArray(priorReview.goal_progress)) {
    for (const p of priorReview.goal_progress as Array<{
      goal_id: string;
      current?: number | null;
    }>) {
      if (typeof p.current === "number") priorProgressMap.set(p.goal_id, p.current);
    }
  }

  // Compute newCurrent per goal kind
  const goalUpdates: Array<{
    id: string;
    newCurrent: number | null;
    delta: number | null;
  }> = [];
  for (const g of goals ?? []) {
    const id = g.id as string;
    const kind = g.kind as string;
    const existingCurrent = (g.current_value as number | null) ?? null;
    let newCurrent: number | null = existingCurrent;

    if (kind === "followers" && followerCount !== null) {
      newCurrent = followerCount;
    } else if (kind === "views") {
      // Two interpretations: weekly view count target vs. avg-views target.
      // Heuristic: if baseline≈avg_views range, treat as avg target; else cumulative.
      const baseline = (g.baseline_value as number | null) ?? 0;
      if (baseline > 0 && baseline < 1_000_000) {
        // Looks like an avg-views target
        newCurrent = recentAvgViews;
      } else {
        // Cumulative: bump by last week's total
        newCurrent = (existingCurrent ?? baseline ?? 0) + lastWeekTotalViews;
      }
    } else if (kind === "consistency") {
      newCurrent = postsLastWeek;
    }
    // engagement / monetization / audience_quality / other → leave manual

    const prior = priorProgressMap.get(id) ?? existingCurrent ?? null;
    const delta =
      newCurrent !== null && prior !== null ? newCurrent - prior : null;

    goalUpdates.push({ id, newCurrent, delta });

    if (newCurrent !== null && newCurrent !== existingCurrent) {
      await db
        .from("goals")
        .update({
          current_value: newCurrent,
          current_updated_at: new Date().toISOString(),
        })
        .eq("id", id);
    }
  }

  // Build the active-goals summary for the prompt — uses NEW current values
  const goalsForPrompt = (goals ?? []).map((g) => {
    const id = g.id as string;
    const baseline = (g.baseline_value as number | null) ?? null;
    const update = goalUpdates.find((u) => u.id === id);
    const current = update?.newCurrent ?? (g.current_value as number | null) ?? null;
    const target = (g.target_value as number | null) ?? null;
    const pct =
      baseline !== null && target !== null && current !== null && target !== baseline
        ? +((((current - baseline) / (target - baseline)) * 100).toFixed(1))
        : null;
    return {
      id,
      title: g.title as string,
      kind: g.kind as string,
      baseline,
      current,
      target,
      target_unit: g.target_unit as string | null,
      target_date: g.target_date as string | null,
      pct,
      delta_this_week: update?.delta ?? null,
    };
  });

  const voiceSamples = ((profile?.voice_samples as string[] | null) ?? []).slice(0, 3);

  const res = await anthropic().messages.create({
    model: LENS_MODEL,
    max_tokens: 4000,
    tools: [REVIEW_TOOL],
    tool_choice: { type: "tool", name: "save_weekly_review" },
    system: `You're Lens running a structured weekly review for a TikTok creator.

You produce a complete package every Monday the creator can act on for
the next 7 days:

1. Review of last week's posted videos vs their baseline + goals
2. Strategic narrative for this week (the "why")
3. 5-7 specific video ideas — each ready-to-post AND directly serving a goal
4. One biggest-leverage move

Goal coupling (the most important constraint):
- Every video idea you generate MUST directly serve one of the active goals.
  Tag each with the goal_id field.
- The strategic narrative (this_week_plan) must explicitly tie the week's
  bets to specific goals — "this week we attack Goal A by …".
- goal_progress array must include EVERY active goal with the latest
  values from the user message + the delta_this_week we computed.

Output constraints:
- Cite real numbers throughout — view counts, multipliers vs median, goal pct,
  delta gained this week.
- Hooks must be in the creator's voice (use the samples below). Max 14 words.
- Descriptions are TikTok captions: 80-180 chars, hook-driven, no "follow for more" fluff.
- Hashtag sets are 4-8 tags mixing big-volume + niche + specific topic. Lowercase, no # symbol.
- target_day_offset: 0=Mon, 6=Sun of THIS upcoming week. Spread the videos across days.
- Format options: talking-to-camera / stitch / b-roll / live / other.
- "biggest_leverage_move": ONE sentence picking the single highest-impact move. NOT a list.
- If they didn't post anything last week, say so plainly in last_week_summary and pivot to this week — don't pad.
- Tone: warm, direct, creator-native. Like a sharp agency co-pilot.

Call save_weekly_review with the structured output.`,
    messages: [
      {
        role: "user",
        content: `Creator: @${handle}
Niche: ${niche}
Monetization streams: ${(profile?.monetization_streams ?? []).join(", ") || "(unknown)"}
Voice samples:
${voiceSamples.length ? voiceSamples.map((v) => `- "${v}"`).join("\n") : "- (warm, direct)"}

WEEK-OVER-WEEK BASELINE:
- Median views (last 100 videos): ${medianViews}
- Avg views: ${avgViews}

CURRENT FOLLOWERS: ${followerCount ?? "(unknown)"}
LAST WEEK TOTAL VIEWS: ${lastWeekTotalViews}
RECENT AVG VIEWS (last 30d): ${recentAvgViews}
POSTS LAST WEEK: ${postsLastWeek}

ACTIVE GOALS (current values are AUTO-UPDATED before this prompt — use these
exact numbers in the goal_progress array, computing delta_this_week as the
delta from the prior week's review):
${
  goalsForPrompt.length === 0
    ? "(no active goals — leave goal_progress as an empty array, leave goal_id empty on videos)"
    : goalsForPrompt
        .map(
          (g) =>
            `- [id=${g.id}] ${g.title}
  baseline=${g.baseline ?? "?"}, current=${g.current ?? "?"}, target=${g.target ?? "?"} ${g.target_unit ?? ""}
  pct=${g.pct === null ? "?" : g.pct + "%"} · delta this week=${g.delta_this_week === null ? "?" : g.delta_this_week > 0 ? "+" + g.delta_this_week : g.delta_this_week} · target_date=${g.target_date ?? "?"}
  kind=${g.kind}`
        )
        .join("\n")
}

LAST 7 DAYS — ${lastWeekVideos.length} VIDEOS POSTED:
${
  lastWeekVideos.length === 0
    ? "(no posts in the last 7 days — make this the headline, then plan a strong week)"
    : JSON.stringify(lastWeekCompact, null, 2)
}

Now generate the weekly review. Use save_weekly_review.`,
      },
    ],
  });

  const toolUse = res.content.find(
    (b): b is Anthropic.ToolUseBlock =>
      b.type === "tool_use" && b.name === "save_weekly_review"
  );

  if (!toolUse) {
    return {
      ok: false,
      weekStarting,
      reviewId: null,
      videosAnalyzed: lastWeekVideos.length,
      reason: "Claude didn't return a structured review.",
    };
  }

  const payload = toolUse.input as WeeklyReviewPayload;

  // Build a goal_id → title lookup for the renderer (so each video card
  // shows which goal it serves)
  const goalLookup = new Map<string, string>();
  for (const g of goals ?? []) {
    goalLookup.set(g.id as string, g.title as string);
  }

  // Compose the markdown plan from the structured videos so the human-
  // readable view (dashboard + /app/review/[id]) gets the per-video
  // hook/desc/hashtags inline.
  const renderedPlan = renderPlan(payload, monday, goalLookup);

  // Persist (upsert on user+week so re-runs replace)
  const { data: saved, error: saveErr } = await db
    .from("weekly_reviews")
    .upsert(
      {
        user_id: userId,
        week_starting: weekStarting,
        status: "generated",
        last_week_summary: payload.last_week_summary,
        this_week_plan: renderedPlan,
        goal_progress: payload.goal_progress,
        videos_analyzed: lastWeekVideos.length,
        generated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,week_starting" }
    )
    .select("id")
    .single();

  if (saveErr) {
    return {
      ok: false,
      weekStarting,
      reviewId: null,
      videosAnalyzed: lastWeekVideos.length,
      reason: `DB error: ${saveErr.message}`,
    };
  }

  // Auto-populate the calendar with this week's video ideas.
  // Each entry lands as status="idea" — creator can move them to
  // "scheduled" when they're ready to film. Uses metadata.weekly_review_id
  // so re-runs can clean up.
  if (saved?.id) {
    // Wipe any existing auto-created entries for this week before re-inserting
    // (handles the manual re-run case)
    await db
      .from("content_calendar")
      .delete()
      .eq("user_id", userId)
      .eq("status", "idea")
      .filter("metadata->>weekly_review_id", "eq", saved.id);

    const calendarRows = payload.videos.map((v) => {
      const dayOffset = Math.max(0, Math.min(6, v.target_day_offset));
      const targetDay = new Date(monday);
      targetDay.setUTCDate(monday.getUTCDate() + dayOffset);
      targetDay.setUTCHours(18, 0, 0, 0);
      // Resolve full goal id from prefix if Claude returned a short id
      let resolvedGoalId: string | null = null;
      if (v.goal_id) {
        if (goalLookup.has(v.goal_id)) {
          resolvedGoalId = v.goal_id;
        } else {
          for (const id of goalLookup.keys()) {
            if (id.startsWith(v.goal_id) || v.goal_id.startsWith(id.slice(0, 8))) {
              resolvedGoalId = id;
              break;
            }
          }
        }
      }
      const goalLabel = resolvedGoalId ? goalLookup.get(resolvedGoalId) : null;
      return {
        user_id: userId,
        title: v.title.slice(0, 200),
        hook: v.hook.slice(0, 500),
        notes: `**Description:** ${v.description}\n\n**Hashtags:** ${v.hashtags.map((h) => "#" + h).join(" ")}\n\n**Format:** ${v.format}\n\n${goalLabel ? `**Serves goal:** ${goalLabel}\n\n` : ""}**Why:** ${v.why}`,
        status: "idea" as const,
        scheduled_for: targetDay.toISOString(),
        metadata: {
          weekly_review_id: saved.id,
          format: v.format,
          hashtags: v.hashtags,
          description: v.description,
          goal_id: resolvedGoalId,
        },
      };
    });

    if (calendarRows.length > 0) {
      await db.from("content_calendar").insert(calendarRows);
    }
  }

  return {
    ok: true,
    weekStarting,
    reviewId: saved?.id ?? null,
    videosAnalyzed: lastWeekVideos.length,
  };
}

/**
 * Render the structured payload into the markdown blob shown on the
 * dashboard and review pages. Per-video hook, description, hashtags
 * appear as inline blocks the creator can copy-paste. Each video is
 * tagged with the goal it serves.
 */
function renderPlan(
  payload: WeeklyReviewPayload,
  monday: Date,
  goalLookup: Map<string, string>
): string {
  const dayName = (offset: number) => {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + offset);
    return d.toLocaleDateString(undefined, { weekday: "long" });
  };

  const intro = payload.this_week_plan?.trim() ?? "";
  const videoBlocks = payload.videos
    .map((v, i) => {
      const day = dayName(v.target_day_offset);
      const tagLine = v.hashtags.map((h) => "#" + h).join(" ");
      // Resolve goal title from id (handles 8-char prefix matches too)
      let goalLabel = "";
      if (v.goal_id) {
        const fullMatch = goalLookup.get(v.goal_id);
        if (fullMatch) {
          goalLabel = fullMatch;
        } else {
          // 8-char prefix match
          for (const [id, title] of goalLookup) {
            if (id.startsWith(v.goal_id) || v.goal_id.startsWith(id.slice(0, 8))) {
              goalLabel = title;
              break;
            }
          }
        }
      }
      const goalLine = goalLabel
        ? `**Serves goal:** ${goalLabel}\n\n`
        : "";
      return `### ${i + 1}. ${v.title}

**${day} · ${v.format}**

${goalLine}> ${v.hook}

**Caption:** ${v.description}

**Tags:** ${tagLine}

*Why:* ${v.why}`;
    })
    .join("\n\n");

  const leverage = payload.biggest_leverage_move
    ? `\n\n---\n\n**🎯 Biggest leverage move this week:** ${payload.biggest_leverage_move}`
    : "";

  return `${intro}\n\n## This week's videos\n\n${videoBlocks}${leverage}`;
}
