import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { runProfileAudit } from "@/lib/lens/audit";
import { setGoalsFromAudit } from "@/lib/lens/goal-setter";

export const runtime = "nodejs";
// Match the long-running budget on the page: audit 30-60s + goals 30-60s.
export const maxDuration = 180;

/**
 * Streams onboarding progress events as NDJSON. Drives /app/onboarding/running.
 * Idempotent: if the user's profile already has onboarded_at set, replays a
 * "done" event with the most recent conversation id and returns.
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const admin = supabaseAdmin();

  const { data: profile } = await admin
    .from("creator_profile")
    .select(
      "niche, goals, monetization_streams, onboarded_at"
    )
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile?.niche) {
    return NextResponse.json(
      { error: "Profile not started — go back to onboarding." },
      { status: 400 }
    );
  }

  const { data: userRow } = await admin
    .from("users")
    .select("tiktok_handle")
    .eq("id", user.id)
    .maybeSingle();

  const handle = userRow?.tiktok_handle ?? "";
  const niche = profile.niche;
  const goals = (profile.goals as { ninety_day?: string } | null) ?? {};
  const ninetyDayGoal = goals.ninety_day ?? "";
  const monetizationStreams =
    (profile.monetization_streams as string[] | null) ?? [];

  // Idempotency: if onboarded_at is already set, return the latest conversation
  if (profile.onboarded_at) {
    const { data: existingConv } = await admin
      .from("conversations")
      .select("id")
      .eq("user_id", user.id)
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return streamOnce({
      type: "done",
      conversation_id: existingConv?.id ?? null,
    });
  }

  if (!handle || !ninetyDayGoal) {
    return NextResponse.json(
      { error: "Onboarding inputs incomplete — go back and fill the form." },
      { status: 400 }
    );
  }

  // Stream audit + goal-setter progress as NDJSON events
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      };

      try {
        send({ type: "step", step: "scrape", label: `Pulling @${handle}'s last 10 videos…` });

        const audit = await runProfileAudit({
          userId: user.id,
          handle,
          niche,
          ninetyDayGoal,
          monetizationStreams,
          limit: 10,
        });

        if (!audit.ok) {
          send({
            type: "step",
            step: "scrape_warn",
            label: `Couldn't pull videos (${audit.fallbackReason ?? "unknown"}). Continuing with a template opener.`,
          });
        } else {
          send({
            type: "step",
            step: "scrape_done",
            label: `Analyzed ${audit.videosAnalyzed} videos`,
            data: {
              videosAnalyzed: audit.videosAnalyzed,
              followers: audit.baseline.followers,
              medianViews: audit.baseline.median_views,
              postsPerWeek: audit.baseline.posts_per_week,
            },
          });
          send({
            type: "step",
            step: "voice",
            label: "Distilling your voice from top transcripts…",
          });
          send({
            type: "step",
            step: "audit",
            label: "Writing your structured audit…",
          });
        }

        let goalsBlock = "";
        if (audit.ok) {
          send({ type: "step", step: "goals", label: "Setting your 90-day goals + action plans…" });
          try {
            const goalsRes = await setGoalsFromAudit({
              userId: user.id,
              handle,
              niche,
              ninetyDayGoal,
              monetizationStreams,
              audit: audit.opener,
              baseline: audit.baseline,
            });
            goalsBlock = goalsRes.goalsSummaryMarkdown;
            send({
              type: "step",
              step: "goals_done",
              label: `${goalsRes.goals_saved} goal${goalsRes.goals_saved === 1 ? "" : "s"} locked in`,
              data: { goalsSaved: goalsRes.goals_saved },
            });
          } catch (e) {
            send({
              type: "step",
              step: "goals_warn",
              label: `Couldn't auto-set goals (${e instanceof Error ? e.message : String(e)}). You can ask Lens later.`,
            });
          }
        }

        const fullOpener = audit.opener + goalsBlock;

        // Persist final state: conversation + onboarded_at
        const now = new Date().toISOString();
        const { data: conv } = await admin
          .from("conversations")
          .insert({
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
          })
          .select("id")
          .single();

        await admin
          .from("creator_profile")
          .update({ onboarded_at: new Date().toISOString() })
          .eq("user_id", user.id);

        send({
          type: "done",
          conversation_id: conv?.id ?? null,
          label: "Ready",
        });
        controller.close();
      } catch (err) {
        send({
          type: "error",
          message: err instanceof Error ? err.message : String(err),
        });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson",
      "cache-control": "no-store, no-transform",
    },
  });
}

function streamOnce(event: Record<string, unknown>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson",
      "cache-control": "no-store, no-transform",
    },
  });
}
