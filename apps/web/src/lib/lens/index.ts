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
};

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

  // Tool-use loop: keep going until Claude returns end_turn.
  // Hard cap on iterations to avoid runaway loops.
  const MAX_ITERS = 6;
  let reply = "";
  let stopReason: Anthropic.Messages.Message["stop_reason"] | null = null;

  for (let iter = 0; iter < MAX_ITERS; iter++) {
    const res = await client.messages.create({
      model: LENS_MODEL,
      max_tokens: LENS_MAX_TOKENS,
      system,
      tools: TOOLS,
      messages,
    });

    stopReason = res.stop_reason;

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

  return { reply, toolCalls, stopReason };
}
