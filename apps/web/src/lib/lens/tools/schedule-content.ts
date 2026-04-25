import type Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabase/admin";

const STATUSES = [
  "idea",
  "drafting",
  "shooting",
  "edited",
  "scheduled",
  "posted",
  "cancelled",
] as const;

export const scheduleContentTool: Anthropic.Tool = {
  name: "schedule_content",
  description:
    "Add a video to the creator's content calendar. Use when the creator says things like 'queue this up for Tuesday', 'add this to the calendar', 'remind me to shoot this'. Pass whatever the creator has — even just a title or hook — and we'll add it. Status defaults to 'scheduled' if a date is given, 'idea' otherwise.",
  input_schema: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description: "Short label for the video (e.g. 'DSCR explainer #2'). Required.",
      },
      hook: { type: "string", description: "The opening hook line, if known." },
      script: { type: "string", description: "Full or partial script body." },
      notes: { type: "string", description: "Anything the creator wants to remember." },
      scheduled_for: {
        type: "string",
        description:
          "ISO 8601 date or datetime in the creator's local timezone (e.g. '2026-04-29' or '2026-04-29T18:00:00-04:00'). Optional. If omitted the entry is saved as an 'idea'.",
      },
      status: {
        type: "string",
        enum: STATUSES as unknown as string[],
        description:
          "Optional explicit status. If omitted, defaults to 'scheduled' (when scheduled_for is set) or 'idea'.",
      },
    },
    required: ["title"],
  },
};

export async function scheduleContentExecutor(
  input: Record<string, unknown>,
  ctx: { userId: string }
): Promise<string> {
  const { title, hook, script, notes, scheduled_for, status } = input as {
    title: string;
    hook?: string;
    script?: string;
    notes?: string;
    scheduled_for?: string;
    status?: (typeof STATUSES)[number];
  };

  let scheduledFor: string | null = null;
  if (scheduled_for) {
    const d = new Date(scheduled_for);
    if (Number.isNaN(d.getTime())) {
      return `Couldn't parse "${scheduled_for}" as a date. Try ISO 8601 like "2026-04-29T18:00:00".`;
    }
    scheduledFor = d.toISOString();
  }

  const finalStatus =
    status ?? (scheduledFor ? "scheduled" : "idea");

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("content_calendar")
    .insert({
      user_id: ctx.userId,
      title,
      hook: hook ?? null,
      script: script ?? null,
      notes: notes ?? null,
      scheduled_for: scheduledFor,
      status: finalStatus,
    })
    .select("id, status, scheduled_for")
    .single();

  if (error || !data) {
    return `Couldn't save to calendar: ${error?.message ?? "unknown error"}.`;
  }

  const dateLabel = data.scheduled_for
    ? new Date(data.scheduled_for).toLocaleString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "unscheduled (saved as idea)";

  return `Saved to calendar — "${title}" · status=${data.status} · ${dateLabel}\nEntry id: ${data.id}\n\nThe creator can see it at /app/calendar.`;
}
