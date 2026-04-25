import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { streamLens, type LensMessage, type LensStreamEvent } from "@/lib/lens";
import { anthropic, LENS_MODEL } from "@/lib/lens/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

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

  const { data: userRow } = await admin
    .from("users")
    .select("tier, monthly_token_cap, monthly_tokens_used")
    .eq("id", userId)
    .single();
  const tier = userRow?.tier ?? "preorder";
  if (tier !== "vanguard" && tier !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const cap = userRow?.monthly_token_cap;
  const used = userRow?.monthly_tokens_used ?? 0;
  if (cap !== null && cap !== undefined && used >= cap) {
    const now = new Date();
    const reset = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)
    );
    return NextResponse.json(
      {
        error: "monthly_cap_reached",
        used,
        cap,
        resets_at: reset.toISOString(),
      },
      { status: 429 }
    );
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const { message } = parsed.data;
  let { conversation_id } = parsed.data;

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

  const now = new Date().toISOString();
  const userStored: StoredMessage = { role: "user", content: message, created_at: now };

  const lensHistory: LensMessage[] = history
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role, content: m.content }));

  // Stream the response as newline-delimited JSON events. Each line is one
  // LensStreamEvent that the client renders incrementally.
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => {
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      };

      // Tell the client the conversation_id immediately so it can update its state
      send({ type: "conversation", conversation_id });

      let finalEvent: Extract<LensStreamEvent, { type: "done" }> | null = null;
      try {
        for await (const ev of streamLens({
          userId,
          history: lensHistory,
          userMessage: message,
        })) {
          send(ev);
          if (ev.type === "done") finalEvent = ev;
        }
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        send({ type: "error", detail });
        // Persist the user turn so they can see their input even on failure
        await admin
          .from("conversations")
          .update({
            messages: [...history, userStored],
            last_message_at: new Date().toISOString(),
          })
          .eq("id", conversation_id!);
        controller.close();
        return;
      }

      // Persist the user + assistant turns and tick the token meter
      const assistantStored: StoredMessage = {
        role: "assistant",
        content: finalEvent?.result.reply || "(no response)",
        created_at: new Date().toISOString(),
        tool_calls: finalEvent?.result.toolCalls.length
          ? finalEvent.result.toolCalls
          : undefined,
      };
      const newMessages = [...history, userStored, assistantStored];
      // Provisional title: truncated user message. Replaced by the smart
      // title call below (best-effort, runs in background).
      const provisionalTitle =
        history.length === 0
          ? message.trim().slice(0, 60) + (message.length > 60 ? "…" : "")
          : undefined;

      await admin
        .from("conversations")
        .update({
          messages: newMessages,
          last_message_at: assistantStored.created_at,
          ...(provisionalTitle ? { title: provisionalTitle } : {}),
        })
        .eq("id", conversation_id!);

      // Smart title: after the first turn, ask Claude to write a 4-6 word
      // descriptive title. Runs after persistence — best-effort, swallows
      // failures. Skips if the user sent the audit-onboarding starter
      // message ("Profile audit + goals" is already a fine title set by
      // the onboarding runner).
      if (history.length === 0 && conversation_id) {
        // Fire-and-forget; don't block the response stream
        void smartTitle(
          message,
          assistantStored.content,
          conversation_id,
          admin
        ).catch(() => {
          // silent — provisional title remains
        });
      }

      if (finalEvent) {
        await admin.rpc("tick_token_meter", {
          p_user_id: userId,
          p_input_tokens:
            finalEvent.result.usage.inputTokens +
            finalEvent.result.usage.cacheCreationTokens,
          p_output_tokens:
            finalEvent.result.usage.outputTokens +
            finalEvent.result.usage.cacheReadTokens,
        });
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}

/**
 * Background task: ask Claude for a short descriptive title for this
 * conversation given the user's first message + assistant's first reply.
 * Runs after the response stream has closed — never blocks the user.
 *
 * If it fails, the provisional title (truncated user message) stays.
 */
async function smartTitle(
  userMessage: string,
  assistantReply: string,
  conversationId: string,
  admin: ReturnType<typeof supabaseAdmin>
): Promise<void> {
  try {
    const res = await anthropic().messages.create({
      model: LENS_MODEL,
      max_tokens: 30,
      system:
        "Write a 3-6 word descriptive title for this conversation. No quotes, no period, sentence case. Examples: 'First-deal hook ideas', 'Brand pitch from Gymshark', 'Series plan for buyer agents'. Output ONLY the title.",
      messages: [
        {
          role: "user",
          content: `User opened with:\n${userMessage.slice(0, 500)}\n\nLens replied:\n${assistantReply.slice(0, 600)}`,
        },
      ],
    });
    const text = res.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("")
      .trim()
      .replace(/^["']|["']$/g, "")
      .slice(0, 80);
    if (text.length < 3) return;
    await admin
      .from("conversations")
      .update({ title: text })
      .eq("id", conversationId);
  } catch {
    // best-effort — provisional title remains
  }
}
