import type Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { anthropic, LENS_MODEL, LENS_MAX_TOKENS } from "./client.js";
import { TOOLS, EXECUTORS } from "./tools/index.js";
import { loadProfileSummary } from "./profile.js";

const PROMPT_PATH = (() => {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    return join(here, "prompts", "system.md");
  } catch {
    return null;
  }
})();

let _cachedPrompt: string | null = null;
function loadSystemPromptTemplate(): string {
  if (_cachedPrompt) return _cachedPrompt;
  if (!PROMPT_PATH) {
    _cachedPrompt = "You are Lens, a TikTok creator co-pilot.";
    return _cachedPrompt;
  }
  try {
    _cachedPrompt = readFileSync(PROMPT_PATH, "utf8");
  } catch {
    _cachedPrompt = "You are Lens, a TikTok creator co-pilot.";
  }
  return _cachedPrompt;
}

export async function buildSystemPrompt(userId: string): Promise<string> {
  const template = loadSystemPromptTemplate();
  const summary = await loadProfileSummary(userId);
  return template.replace("{{creator_profile_summary}}", summary);
}

export type LensMessage = {
  role: "user" | "assistant";
  content: string;
};

export type LensRunResult = {
  reply: string;
  toolCalls: Array<{ name: string; input: unknown; output: string }>;
  stopReason: Anthropic.Messages.Message["stop_reason"] | null;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    totalTokens: number;
  };
};

export type LensStreamEvent =
  | { type: "text_delta"; delta: string }
  | { type: "tool_use_start"; name: string; input: unknown; id: string }
  | { type: "tool_use_end"; id: string; output: string }
  | { type: "iteration"; index: number }
  | { type: "done"; result: LensRunResult };

/**
 * Run one turn of Lens: take the conversation history + a new user message,
 * return the assistant's reply after any tool calls have been resolved.
 *
 * Non-streaming for alpha — we can add streaming once the UX is dialed.
 */
export async function runLens(params: {
  userId: string;
  history: LensMessage[];
  userMessage: string;
}): Promise<LensRunResult> {
  const { userId, history, userMessage } = params;
  const client = anthropic();
  const system = await buildSystemPrompt(userId);

  const messages: Anthropic.Messages.MessageParam[] = [
    ...history.map<Anthropic.Messages.MessageParam>((m) => ({
      role: m.role,
      content: m.content,
    })),
    { role: "user", content: userMessage },
  ];

  const toolCalls: LensRunResult["toolCalls"] = [];

  // Prompt caching: system + tools are stable across turns within a 5-min
  // window, so cache them. Subsequent turns pay 0.1x for cached tokens
  // instead of full input rate. The LAST tool gets the cache_control marker,
  // which caches it and everything before it (the full tools array).
  const cachedSystem: Anthropic.Messages.TextBlockParam[] = [
    { type: "text", text: system, cache_control: { type: "ephemeral" } },
  ];
  const cachedTools: Anthropic.Tool[] = TOOLS.map((t, i) =>
    i === TOOLS.length - 1
      ? { ...t, cache_control: { type: "ephemeral" } }
      : t
  );

  const usage: LensRunResult["usage"] = {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    totalTokens: 0,
  };

  // Tool-use loop: keep going until Claude returns end_turn.
  // Hard cap on iterations to avoid runaway loops.
  const MAX_ITERS = 6;
  let reply = "";
  let stopReason: Anthropic.Messages.Message["stop_reason"] | null = null;

  for (let iter = 0; iter < MAX_ITERS; iter++) {
    const res = await client.messages.create({
      model: LENS_MODEL,
      max_tokens: LENS_MAX_TOKENS,
      system: cachedSystem,
      tools: cachedTools,
      messages,
    });

    stopReason = res.stop_reason;
    usage.inputTokens += res.usage?.input_tokens ?? 0;
    usage.outputTokens += res.usage?.output_tokens ?? 0;
    usage.cacheCreationTokens += res.usage?.cache_creation_input_tokens ?? 0;
    usage.cacheReadTokens += res.usage?.cache_read_input_tokens ?? 0;

    // Extract any text output from this turn
    const textBlocks = res.content.filter(
      (b): b is Anthropic.TextBlock => b.type === "text"
    );
    reply = textBlocks.map((b) => b.text).join("\n").trim();

    // Find any tool uses
    const toolUses = res.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );

    if (toolUses.length === 0 || res.stop_reason !== "tool_use") {
      break;
    }

    // Append assistant turn to the conversation (with its tool_use blocks)
    messages.push({ role: "assistant", content: res.content });

    // Execute each tool call and attach results
    const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];
    for (const call of toolUses) {
      const exec = EXECUTORS[call.name];
      let output: string;
      if (!exec) {
        output = `Unknown tool: ${call.name}`;
      } else {
        try {
          output = await exec(call.input as Record<string, unknown>, { userId });
        } catch (err) {
          output = `Tool error: ${err instanceof Error ? err.message : String(err)}`;
        }
      }
      toolCalls.push({ name: call.name, input: call.input, output });
      toolResults.push({
        type: "tool_result",
        tool_use_id: call.id,
        content: output,
      });
    }

    messages.push({ role: "user", content: toolResults });
  }

  usage.totalTokens =
    usage.inputTokens +
    usage.outputTokens +
    usage.cacheCreationTokens +
    usage.cacheReadTokens;

  return { reply, toolCalls, stopReason, usage };
}

/**
 * Streaming version of runLens — yields events for text deltas, tool use,
 * and final completion. Use from /api/chat to send live progress to the UI.
 *
 * Events are NDJSON-friendly and arrive in order:
 *   { type: "iteration", index }              — every loop iteration
 *   { type: "text_delta", delta: "..." }      — text streaming from Claude
 *   { type: "tool_use_start", name, input, id }  — tool about to run
 *   { type: "tool_use_end", id, output }      — tool finished
 *   { type: "done", result: { reply, toolCalls, stopReason, usage } }
 */
export async function* streamLens(params: {
  userId: string;
  history: LensMessage[];
  userMessage: string;
}): AsyncGenerator<LensStreamEvent, void, void> {
  const { userId, history, userMessage } = params;
  const client = anthropic();
  const system = await buildSystemPrompt(userId);

  // Cache breakpoint #1: system prompt + tools (stable per user)
  const cachedSystem: Anthropic.Messages.TextBlockParam[] = [
    { type: "text", text: system, cache_control: { type: "ephemeral" } },
  ];
  const cachedTools: Anthropic.Tool[] = TOOLS.map((t, i) =>
    i === TOOLS.length - 1
      ? { ...t, cache_control: { type: "ephemeral" } }
      : t
  );

  // Cache breakpoint #2: conversation history (stable across follow-up turns)
  // Mark the last historical message with cache_control so when the same
  // history is replayed next turn, everything up to it reads from cache.
  const messages: Anthropic.Messages.MessageParam[] = history.map<
    Anthropic.Messages.MessageParam
  >((m, i) => {
    const isLastHistorical = i === history.length - 1;
    if (!isLastHistorical) {
      return { role: m.role, content: m.content };
    }
    return {
      role: m.role,
      content: [
        {
          type: "text",
          text: m.content,
          cache_control: { type: "ephemeral" },
        },
      ],
    };
  });
  messages.push({ role: "user", content: userMessage });

  const toolCalls: LensRunResult["toolCalls"] = [];
  const usage: LensRunResult["usage"] = {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    totalTokens: 0,
  };

  const MAX_ITERS = 6;
  let reply = "";
  let stopReason: Anthropic.Messages.Message["stop_reason"] | null = null;

  for (let iter = 0; iter < MAX_ITERS; iter++) {
    yield { type: "iteration", index: iter };

    const stream = client.messages.stream({
      model: LENS_MODEL,
      max_tokens: LENS_MAX_TOKENS,
      system: cachedSystem,
      tools: cachedTools,
      messages,
    });

    let iterText = "";
    const iterToolUses: Array<{
      id: string;
      name: string;
      input: unknown;
    }> = [];

    for await (const event of stream) {
      if (event.type === "content_block_start") {
        if (event.content_block.type === "tool_use") {
          const tu = event.content_block;
          iterToolUses.push({ id: tu.id, name: tu.name, input: {} });
          // We yield tool_use_start *after* we have the full input,
          // which arrives via input_json_delta and is finalized at stop.
        }
      } else if (event.type === "content_block_delta") {
        if (event.delta.type === "text_delta") {
          iterText += event.delta.text;
          yield { type: "text_delta", delta: event.delta.text };
        }
        // input_json_delta accumulates tool input; we read final from snapshot.
      }
    }

    const final = await stream.finalMessage();
    stopReason = final.stop_reason;
    if (final.usage) {
      usage.inputTokens += final.usage.input_tokens ?? 0;
      usage.outputTokens += final.usage.output_tokens ?? 0;
      usage.cacheCreationTokens += final.usage.cache_creation_input_tokens ?? 0;
      usage.cacheReadTokens += final.usage.cache_read_input_tokens ?? 0;
    }

    if (iterText) reply = iterText;

    // Resolve tool inputs from final message blocks
    const toolUses = final.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );

    if (toolUses.length === 0 || final.stop_reason !== "tool_use") {
      break;
    }

    // Emit start events with full inputs now that we have them, then run.
    messages.push({ role: "assistant", content: final.content });
    const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];

    for (const call of toolUses) {
      yield {
        type: "tool_use_start",
        id: call.id,
        name: call.name,
        input: call.input,
      };
      const exec = EXECUTORS[call.name];
      let output: string;
      if (!exec) {
        output = `Unknown tool: ${call.name}`;
      } else {
        try {
          output = await exec(call.input as Record<string, unknown>, { userId });
        } catch (err) {
          output = `Tool error: ${
            err instanceof Error ? err.message : String(err)
          }`;
        }
      }
      toolCalls.push({ name: call.name, input: call.input, output });
      toolResults.push({
        type: "tool_result",
        tool_use_id: call.id,
        content: output,
      });
      yield { type: "tool_use_end", id: call.id, output };
    }

    messages.push({ role: "user", content: toolResults });
  }

  usage.totalTokens =
    usage.inputTokens +
    usage.outputTokens +
    usage.cacheCreationTokens +
    usage.cacheReadTokens;

  yield {
    type: "done",
    result: { reply, toolCalls, stopReason, usage },
  };
}
