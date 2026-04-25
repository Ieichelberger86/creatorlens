import type Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const listCalendarTool: Anthropic.Tool = {
  name: "list_calendar",
  description:
    "Read the creator's current content calendar. Returns upcoming scheduled posts, ideas without dates, and recently posted videos. Use when the creator asks about their pipeline ('what's coming up', 'what do I have on deck', 'remind me what's queued'), or before recommending new ideas so you don't suggest duplicates.",
  input_schema: {
    type: "object",
    properties: {
      window_days: {
        type: "integer",
        description:
          "How many days forward + backward to include scheduled/posted items. Default 30.",
        minimum: 1,
        maximum: 180,
      },
      include_ideas: {
        type: "boolean",
        description: "Include unscheduled idea entries. Default true.",
      },
    },
  },
};

type CalendarRow = {
  id: string;
  status: string;
  title: string;
  hook: string | null;
  scheduled_for: string | null;
  posted_at: string | null;
  posted_url: string | null;
  notes: string | null;
};

export async function listCalendarExecutor(
  input: Record<string, unknown>,
  ctx: { userId: string }
): Promise<string> {
  const { window_days, include_ideas } = input as {
    window_days?: number;
    include_ideas?: boolean;
  };
  const days = Math.min(Math.max(window_days ?? 30, 1), 180);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("content_calendar")
    .select("id, status, title, hook, scheduled_for, posted_at, posted_url, notes")
    .eq("user_id", ctx.userId)
    .or(
      `scheduled_for.gte.${since},scheduled_for.lte.${until},posted_at.gte.${since}` +
        (include_ideas !== false ? ",scheduled_for.is.null" : "")
    )
    .order("scheduled_for", { ascending: true, nullsFirst: false })
    .limit(100);

  if (error) return `Calendar read failed: ${error.message}`;
  const rows = (data ?? []) as CalendarRow[];
  if (!rows.length) return "Calendar is empty.";

  const upcoming = rows.filter(
    (r) =>
      r.scheduled_for &&
      new Date(r.scheduled_for) >= new Date() &&
      r.status !== "posted" &&
      r.status !== "cancelled"
  );
  const ideas = rows.filter((r) => !r.scheduled_for && r.status === "idea");
  const posted = rows.filter(
    (r) => r.status === "posted" || r.posted_at
  );
  const inProgress = rows.filter(
    (r) =>
      r.scheduled_for &&
      ["drafting", "shooting", "edited"].includes(r.status)
  );

  const fmtDate = (s: string | null) =>
    s
      ? new Date(s).toLocaleString(undefined, {
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })
      : "(unscheduled)";

  const sections: string[] = [];
  if (upcoming.length) {
    sections.push(
      "UPCOMING:\n" +
        upcoming
          .map(
            (r) =>
              `  • [${r.status}] ${fmtDate(r.scheduled_for)} — ${r.title}${
                r.hook ? ` :: "${r.hook.slice(0, 100)}"` : ""
              }`
          )
          .join("\n")
    );
  }
  if (inProgress.length) {
    sections.push(
      "IN PROGRESS:\n" +
        inProgress
          .map((r) => `  • [${r.status}] ${r.title}`)
          .join("\n")
    );
  }
  if (ideas.length && include_ideas !== false) {
    sections.push(
      `IDEAS (${ideas.length}):\n` +
        ideas
          .slice(0, 15)
          .map(
            (r) => `  • ${r.title}${r.hook ? ` :: "${r.hook.slice(0, 80)}"` : ""}`
          )
          .join("\n")
    );
  }
  if (posted.length) {
    sections.push(
      "POSTED (recent):\n" +
        posted
          .slice(0, 10)
          .map(
            (r) =>
              `  • ${fmtDate(r.posted_at ?? r.scheduled_for)} — ${r.title}${
                r.posted_url ? ` (${r.posted_url})` : ""
              }`
          )
          .join("\n")
    );
  }

  return sections.join("\n\n");
}
