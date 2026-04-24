import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { runLens, type LensMessage } from "@/lib/lens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  conversation_id: z.string().uuid().optional(),
  message: z.string().min(1).max(10_000),
});

type StoredMessage = {
  role: "user" | "assistant";
  content: string;
  created_at: string;
  tool_calls?: Array<{ name: string; input: unknown; output: string }>;
};

export async function POST(req: Request) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const userId = auth.user.id;
  const admin = supabaseAdmin();

  // Check tier gate
  const { data: userRow } = await admin
    .from("users")
    .select("tier")
    .eq("id", userId)
    .single();
  const tier = userRow?.tier ?? "preorder";
  if (tier !== "vanguard" && tier !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const { message } = parsed.data;
  let { conversation_id } = parsed.data;

  // Load or create the conversation row
  let history: StoredMessage[] = [];
  if (conversation_id) {
    const { data: conv } = await admin
      .from("conversations")
      .select("id, user_id, messages")
      .eq("id", conversation_id)
      .eq("user_id", userId)
      .single();
    if (!conv) {
      return NextResponse.json({ error: "conversation_not_found" }, { status: 404 });
    }
    history = (conv.messages as StoredMessage[] | null) ?? [];
  } else {
    const { data: inserted, error: insertErr } = await admin
      .from("conversations")
      .insert({
        user_id: userId,
        channel: "web",
        title: null,
        messages: [],
        last_message_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (insertErr || !inserted) {
      return NextResponse.json(
        { error: "could_not_create_conversation", detail: insertErr?.message },
        { status: 500 }
      );
    }
    conversation_id = inserted.id;
  }

  // Append the user turn optimistically (saves even if the model call fails)
  const now = new Date().toISOString();
  const userStored: StoredMessage = { role: "user", content: message, created_at: now };

  const lensHistory: LensMessage[] = history
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role, content: m.content }));

  let result;
  try {
    result = await runLens({ userId, history: lensHistory, userMessage: message });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Persist the user message anyway so they can see their input reflected
    await admin
      .from("conversations")
      .update({
        messages: [...history, userStored],
        last_message_at: now,
      })
      .eq("id", conversation_id);
    return NextResponse.json({ error: "lens_failed", detail: msg }, { status: 500 });
  }

  const assistantStored: StoredMessage = {
    role: "assistant",
    content: result.reply || "(no response)",
    created_at: new Date().toISOString(),
    tool_calls: result.toolCalls.length ? result.toolCalls : undefined,
  };

  const newMessages = [...history, userStored, assistantStored];

  // Auto-title first conversation with a snippet of the first user message
  const title =
    history.length === 0
      ? message.trim().slice(0, 60) + (message.length > 60 ? "…" : "")
      : undefined;

  await admin
    .from("conversations")
    .update({
      messages: newMessages,
      last_message_at: assistantStored.created_at,
      ...(title ? { title } : {}),
    })
    .eq("id", conversation_id);

  return NextResponse.json({
    conversation_id,
    reply: assistantStored.content,
    tool_calls: result.toolCalls,
    stop_reason: result.stopReason,
  });
}
