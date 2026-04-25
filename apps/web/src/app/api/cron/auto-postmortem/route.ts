import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isAuthorizedCron, alertCronFailure } from "@/lib/cron";
import { postMortemExecutor } from "@/lib/lens/tools/post-mortem";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    return await runAutoPostmortem();
  } catch (err) {
    await alertCronFailure({ job: "auto-postmortem", error: err });
    return NextResponse.json(
      {
        error: "auto_postmortem_failed",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}

async function runAutoPostmortem(): Promise<Response> {
  const admin = supabaseAdmin();

  // Find calendar entries that:
  //   - status = 'posted'
  //   - posted_url present
  //   - posted_at between 24-72 hours ago
  //   - haven't already had an auto-postmortem queued (metadata.auto_postmortem_at)
  const lower = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
  const upper = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: candidates } = await admin
    .from("content_calendar")
    .select("id, user_id, title, posted_url, posted_at, metadata")
    .eq("status", "posted")
    .not("posted_url", "is", null)
    .gte("posted_at", lower)
    .lte("posted_at", upper)
    .limit(20);

  const results: Array<{
    entry: string;
    status: string;
    detail?: string;
  }> = [];

  for (const c of candidates ?? []) {
    const meta = (c.metadata as Record<string, unknown>) ?? {};
    if (meta.auto_postmortem_at) {
      results.push({ entry: c.id, status: "skip_already_done" });
      continue;
    }

    try {
      const output = await postMortemExecutor(
        { url: c.posted_url, notes: `auto-postmortem of "${c.title}"` },
        { userId: c.user_id }
      );

      await admin.from("pending_lens_messages").insert({
        user_id: c.user_id,
        source: "auto_postmortem",
        payload: {
          content: `**Post-mortem on "${c.title}" (24h check-in).**\n\n${output}`,
          tool_calls: [
            { name: "post_mortem", input: { url: c.posted_url }, output },
          ],
        },
      });

      await admin
        .from("content_calendar")
        .update({
          metadata: { ...meta, auto_postmortem_at: new Date().toISOString() },
        })
        .eq("id", c.id);

      results.push({ entry: c.id, status: "queued" });
    } catch (err) {
      results.push({
        entry: c.id,
        status: "error",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({ ok: true, processed: results.length, results });
}
