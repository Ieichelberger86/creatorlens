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

export const updateCalendarEntryTool: Anthropic.Tool = {
  name: "update_calendar_entry",
  description:
    "Modify or remove an existing calendar entry by id. Use to mark something posted (with the URL), reschedule, change status, edit script/notes, or delete. Pass the entry_id (from list_calendar or schedule_content). Pass `delete: true` to remove.",
  input_schema: {
    type: "object",
    properties: {
      entry_id: {
        type: "string",
        description: "UUID of the calendar entry to update.",
      },
      delete: {
        type: "boolean",
        description: "If true, the entry is removed permanently.",
      },
      title: { type: "string" },
      hook: { type: "string" },
      script: { type: "string" },
      notes: { type: "string" },
      status: {
        type: "string",
        enum: STATUSES as unknown as string[],
      },
      scheduled_for: {
        type: "string",
        description:
          "New ISO 8601 datetime. Pass empty string '' to clear (turns it back into an unscheduled idea).",
      },
      posted_url: {
        type: "string",
        description:
          "TikTok URL of the posted video. Setting this auto-flips status to 'posted' and stamps posted_at if empty.",
      },
    },
    required: ["entry_id"],
  },
};

export async function updateCalendarEntryExecutor(
  input: Record<string, unknown>,
  ctx: { userId: string }
): Promise<string> {
  const { entry_id, delete: deleteFlag, scheduled_for, posted_url, ...rest } =
    input as {
      entry_id: string;
      delete?: boolean;
      title?: string;
      hook?: string;
      script?: string;
      notes?: string;
      status?: (typeof STATUSES)[number];
      scheduled_for?: string;
      posted_url?: string;
    };

  const db = supabaseAdmin();

  if (deleteFlag) {
    const { error } = await db
      .from("content_calendar")
      .delete()
      .eq("id", entry_id)
      .eq("user_id", ctx.userId);
    if (error) return `Delete failed: ${error.message}`;
    return `Deleted calendar entry ${entry_id}.`;
  }

  const patch: Record<string, unknown> = { ...rest };

  if (scheduled_for !== undefined) {
    if (scheduled_for === "") {
      patch.scheduled_for = null;
    } else {
      const d = new Date(scheduled_for);
      if (Number.isNaN(d.getTime())) {
        return `Couldn't parse "${scheduled_for}" as a date.`;
      }
      patch.scheduled_for = d.toISOString();
    }
  }

  if (posted_url) {
    patch.posted_url = posted_url;
    if (!patch.status) patch.status = "posted";
    patch.posted_at = new Date().toISOString();
  }

  if (Object.keys(patch).length === 0) {
    return "Nothing to update — pass at least one field besides entry_id.";
  }

  const { data, error } = await db
    .from("content_calendar")
    .update(patch)
    .eq("id", entry_id)
    .eq("user_id", ctx.userId)
    .select("id, status, scheduled_for, title")
    .single();

  if (error || !data) {
    return `Update failed: ${error?.message ?? "entry not found"}.`;
  }

  const dateLabel = data.scheduled_for
    ? new Date(data.scheduled_for).toLocaleString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "unscheduled";

  return `Updated "${data.title}" — status=${data.status} · ${dateLabel}.`;
}
