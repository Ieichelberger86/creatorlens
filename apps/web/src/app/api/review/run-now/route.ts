import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/supabase/server";
import { generateWeeklyReview } from "@/lib/lens/weekly-review";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

/**
 * Manual trigger for the signed-in creator's weekly review.
 *
 * Streams progress NDJSON like /api/onboarding/run so the running page
 * can show live updates.
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
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
          label: "Pulling your last 7 days of posts…",
        });

        const r = await generateWeeklyReview({ userId: user.id });

        if (!r.ok) {
          send({
            type: "error",
            message: r.reason ?? "Couldn't generate the review.",
          });
          controller.close();
          return;
        }

        send({
          type: "step",
          step: "analyze",
          label: `Analyzed ${r.videosAnalyzed} video${r.videosAnalyzed === 1 ? "" : "s"}.`,
        });
        send({
          type: "step",
          step: "write",
          label: "Writing your review + next-week plan…",
        });

        send({
          type: "done",
          review_id: r.reviewId,
          week_starting: r.weekStarting,
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
