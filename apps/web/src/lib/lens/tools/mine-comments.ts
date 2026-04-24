import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, LENS_MODEL } from "../client.js";

export const mineCommentsTool: Anthropic.Tool = {
  name: "mine_comments",
  description:
    "Extract themes, questions, and content ideas from comments on a video. In alpha, the creator pastes a block of comments and this tool clusters them. Ask the creator to paste at least 15-25 comments for good signal.",
  input_schema: {
    type: "object",
    properties: {
      comments_raw: {
        type: "string",
        description:
          "The raw comment block, one comment per line (or separated by newlines). At least 15-25 comments recommended.",
      },
      context: {
        type: "string",
        description:
          "What the video was about — helps classify comments. E.g. 'a POV video on DSCR loans for first-time investors'.",
      },
    },
    required: ["comments_raw"],
  },
};

export async function mineCommentsExecutor(
  input: Record<string, unknown>
): Promise<string> {
  const { comments_raw, context } = input as {
    comments_raw: string;
    context?: string;
  };

  if (!comments_raw || comments_raw.trim().length < 20) {
    return "Need at least a handful of comments pasted in (15-25 is ideal). Ask the creator to paste them and call me again.";
  }

  const res = await anthropic().messages.create({
    model: LENS_MODEL,
    max_tokens: 1536,
    system: `You cluster TikTok comment sections into 3-6 themes, then surface 5 concrete video ideas rooted in those themes. Output format:

THEMES (3-6):
1. <theme name> — <one-line summary> (<N> comments)
2. ...

QUESTIONS BEING ASKED (top 5):
- "<direct quote or paraphrase>"
- ...

CONTENT IDEAS (5, each one video):
1. <hook> — <1-sentence premise>
2. ...

No preamble. No caveats. Just the three sections.`,
    messages: [
      {
        role: "user",
        content: `${context ? `Video context: ${context}\n\n` : ""}Comments:
${comments_raw.trim()}`,
      },
    ],
  });

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  return text || "(no themes extracted)";
}
