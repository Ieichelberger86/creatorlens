import type Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const analyzeTiktokVideoTool: Anthropic.Tool = {
  name: "analyze_tiktok_video",
  description:
    "Record a TikTok video the creator (or a competitor) has posted. In alpha, the creator pastes the URL + transcript + any stats they have; this tool persists it and returns a structured summary you can reference. If transcript is missing, ask the creator to paste it manually.",
  input_schema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "The TikTok URL, e.g. https://www.tiktok.com/@handle/video/1234567890",
      },
      is_own: {
        type: "boolean",
        description:
          "True if this is the creator's own video. False if it's a competitor or inspiration.",
      },
      transcript: {
        type: "string",
        description:
          "The spoken transcript, pasted by the creator. Leave empty if unknown.",
      },
      views: { type: "integer", description: "Total views if known." },
      likes: { type: "integer", description: "Likes if known." },
      comments_count: {
        type: "integer",
        description: "Number of comments if known.",
      },
      notes: {
        type: "string",
        description:
          "Free-form context from the creator (what they were trying, what they noticed, etc.).",
      },
    },
    required: ["url", "is_own"],
  },
};

export async function analyzeTiktokVideoExecutor(
  input: Record<string, unknown>,
  ctx: { userId: string }
): Promise<string> {
  const {
    url,
    is_own,
    transcript,
    views,
    likes,
    comments_count,
    notes,
  } = input as {
    url: string;
    is_own: boolean;
    transcript?: string;
    views?: number;
    likes?: number;
    comments_count?: number;
    notes?: string;
  };

  const performance: Record<string, unknown> = {};
  if (typeof views === "number") performance.views = views;
  if (typeof likes === "number") performance.likes = likes;
  if (typeof comments_count === "number") performance.comments_count = comments_count;
  if (notes) performance.notes = notes;

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("videos")
    .upsert(
      {
        user_id: ctx.userId,
        tiktok_url: url,
        is_own: !!is_own,
        transcript: transcript ?? null,
        performance,
        analyzed_at: new Date().toISOString(),
      },
      { onConflict: "user_id,tiktok_url" }
    )
    .select()
    .single();

  if (error) {
    return `Could not save this video: ${error.message}`;
  }

  const lines = [
    `Recorded video ${is_own ? "(own)" : "(competitor/inspiration)"} — ${url}`,
    transcript
      ? `Transcript captured (${transcript.length} chars).`
      : "No transcript yet — ask the creator to paste it if needed.",
    Object.keys(performance).length
      ? `Performance: ${JSON.stringify(performance)}`
      : "No performance data — ask for views/likes if relevant.",
    `Row id: ${data?.id ?? "?"}`,
  ];
  return lines.join("\n");
}
