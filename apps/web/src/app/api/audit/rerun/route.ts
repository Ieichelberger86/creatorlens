import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { runProfileAudit } from "@/lib/lens/audit";

export const runtime = "nodejs";
// Full-profile audits scrape up to 100 videos — Apify can take 2-3 min.
// Plus voice extraction + audit generation = ~30s of Claude work.
export const maxDuration = 240;

/**
 * Re-run the full-profile audit for the signed-in creator. Streams NDJSON
 * progress events. Persists a fresh audit message to a NEW conversation,
 * updates last_audited_at on creator_profile.
 *
 * No goal-setter call — re-audits don't reset goals (creators have
 * existing goals + progress they're tracking; if they want to refocus
 * goals, the set_goals tool handles that separately from chat).
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const admin = supabaseAdmin();

  const { data: profile } = await admin
    .from("creator_profile")
    .select("niche, goals, monetization_streams, last_audited_at, onboarded_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile?.onboarded_at) {
    return NextResponse.json(
      { error: "Not onboarded — finish onboarding first." },
      { status: 400 }
    );
  }

  const { data: userRow } = await admin
    .from("users")
    .select("tiktok_handle")
    .eq("id", user.id)
    .maybeSingle();

  const handle = userRow?.tiktok_handle ?? "";
  const niche = profile.niche ?? "";
  const goals = (profile.goals as { ninety_day?: string } | null) ?? {};
  const ninetyDayGoal = goals.ninety_day ?? "";
  const monetizationStreams =
    (profile.monetization_streams as string[] | null) ?? [];

  if (!handle || !niche) {
    return NextResponse.json(
      { error: "Profile incomplete — set your handle + niche in /app/settings." },
      { status: 400 }
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      };

      try {
        send({
          type: "step",
          step: "scrape",
          label: `Pulling @${handle}'s full profile (up to 100 videos)…`,
        });

        const audit = await runProfileAudit({
          userId: user.id,
          handle,
          niche,
          ninetyDayGoal,
          monetizationStreams,
          limit: 100,
        });

        if (!audit.ok) {
          send({
            type: "step",
            step: "scrape_warn",
            label: `Couldn't pull videos (${audit.fallbackReason ?? "unknown"}). Audit will be light on data.`,
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
            label: "Writing your fresh audit…",
          });
        }

        // Persist a fresh conversation with the audit
        const now = new Date().toISOString();
        const { data: conv } = await admin
          .from("conversations")
          .insert({
            user_id: user.id,
            channel: "web",
            title: `Audit · ${new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" })}`,
            messages: [
              {
                role: "assistant",
                content: audit.opener,
                created_at: now,
              },
            ],
            last_message_at: now,
          })
          .select("id")
          .single();

        // Update last_audited_at on the profile
        await admin
          .from("creator_profile")
          .update({ last_audited_at: new Date().toISOString() })
          .eq("user_id", user.id);

        send({
          type: "done",
          conversation_id: conv?.id ?? null,
          label: "Fresh audit ready",
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
