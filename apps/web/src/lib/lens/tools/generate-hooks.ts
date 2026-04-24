import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, LENS_MODEL } from "../client.js";

export const generateHooksTool: Anthropic.Tool = {
  name: "generate_hooks",
  description:
    "Generate 10 TikTok hook variants optimized for the first 2 seconds of retention. Returns a numbered list. Call when the creator is brainstorming new videos or stuck on an opener.",
  input_schema: {
    type: "object",
    properties: {
      niche: {
        type: "string",
        description:
          "The creator's niche in their own words (e.g., 'real estate investor content for young women', 'home coffee gear reviews').",
      },
      topic: {
        type: "string",
        description:
          "The specific topic or angle the hooks should explore (e.g., 'DSCR loans', 'cheap espresso machines', 'my biggest mistake as a creator').",
      },
      voice_samples: {
        type: "string",
        description:
          "Optional: past winning hooks or lines from the creator so hooks match their voice. Paste verbatim.",
      },
      count: {
        type: "integer",
        description: "Number of hooks to generate. Default 10, max 20.",
        minimum: 1,
        maximum: 20,
      },
    },
    required: ["niche", "topic"],
  },
};

export async function generateHooksExecutor(
  input: Record<string, unknown>
): Promise<string> {
  const { niche, topic, voice_samples, count } = input as {
    niche: string;
    topic: string;
    voice_samples?: string;
    count?: number;
  };
  const n = Math.min(Math.max(count ?? 10, 1), 20);

  const res = await anthropic().messages.create({
    model: LENS_MODEL,
    max_tokens: 1024,
    system: `You are a TikTok hook lab. You output exactly ${n} hooks, one per line, numbered 1-${n}. No preamble, no explanation, no post-script. Each hook is ≤ 12 words, written to grab in the first 2 seconds of a vertical video. Vary the structures: curiosity gap, pattern interrupt, contrarian claim, identity callout, visual cue, specific number, direct question. Never use clichés ("POV:", "Tell me you're X without telling me"). Each hook stands alone.`,
    messages: [
      {
        role: "user",
        content: `Niche: ${niche}
Topic: ${topic}${voice_samples ? `\n\nPast winning hooks / voice reference:\n${voice_samples}` : ""}

Write ${n} hooks.`,
      },
    ],
  });

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  return text || "(no hooks generated — try again with a more specific topic)";
}
