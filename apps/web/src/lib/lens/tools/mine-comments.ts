import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, LENS_MODEL } from "../client.js";
import { scrapeTikTokPost } from "../apify.js";

export const mineCommentsTool: Anthropic.Tool = {
  name: "mine_comments",
  description:
    "Pull the top comments from a TikTok video and cluster them into themes + 5 concrete content ideas. Auto-fetches via Apify — you only pass the URL. Use when the creator wants to find ideas rooted in real audience pain points or questions, on their own video or any other public TikTok.",
  input_schema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "Full TikTok video URL.",
      },
      limit: {
        type: "integer",
        description: "How many top comments to pull. Default 50, max 200.",
        minimum: 10,
        maximum: 200,
      },
      context: {
        type: "string",
        description:
          "Optional: what the video was about, to help cluster the comments.",
      },
    },
    required: ["url"],
  },
};

export async function mineCommentsExecutor(
  input: Record<string, unknown>
): Promise<string> {
  const { url, limit, context } = input as {
    url: string;
    limit?: number;
    context?: string;
  };

  if (!/tiktok\.com\/.+\/video\/\d+/.test(url)) {
    return "That URL doesn't look like a TikTok video link. Pass the full URL like https://www.tiktok.com/@handle/video/1234567890.";
  }

  const n = Math.min(Math.max(limit ?? 50, 10), 200);

  let post: Awaited<ReturnType<typeof scrapeTikTokPost>>;
  try {
    post = await scrapeTikTokPost(url, { withComments: true, commentsLimit: n });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Couldn't pull comments (${msg}). Ask the creator to paste 15-25 top comments and I'll cluster from there.`;
  }

  const comments = post?.comments ?? [];
  if (!comments.length) {
    return `No comments came back for this video — it may have comments disabled, be very new, or the scraper hit a limit. Ask the creator to paste a sample.`;
  }

  const formatted = comments
    .map((c) => {
      const handle = c.user?.uniqueId ? `@${c.user.uniqueId}` : "";
      const likes = typeof c.diggCount === "number" ? ` (${c.diggCount}♥)` : "";
      return `${handle}${likes}: ${c.text ?? ""}`.trim();
    })
    .filter(Boolean)
    .join("\n");

  // Cluster + ideate via Claude
  const res = await anthropic().messages.create({
    model: LENS_MODEL,
    max_tokens: 1536,
    system: `You cluster TikTok comment sections into 3-6 themes, then surface 5 concrete video ideas rooted in those themes.

Output exactly this format, no preamble:

THEMES (3-6):
1. <theme name> — <one-line summary> (<N> comments)
2. ...

QUESTIONS BEING ASKED (top 5):
- "<direct quote or paraphrase>"
- ...

CONTENT IDEAS (5, each one video):
1. <hook> — <1-sentence premise>
2. ...`,
    messages: [
      {
        role: "user",
        content: `${context ? `Video context: ${context}\n\n` : ""}Top ${comments.length} comments from ${url}:

${formatted}`,
      },
    ],
  });

  const analysis = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  const header = `Pulled ${comments.length} comments from ${url}.\n\n`;
  return header + (analysis || "(theme analysis came back empty — try again with a different URL)");
}
