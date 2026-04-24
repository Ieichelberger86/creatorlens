import type Anthropic from "@anthropic-ai/sdk";
import { generateHooksTool, generateHooksExecutor } from "./generate-hooks.js";
import {
  analyzeTiktokVideoTool,
  analyzeTiktokVideoExecutor,
} from "./analyze-tiktok-video.js";
import { mineCommentsTool, mineCommentsExecutor } from "./mine-comments.js";

export type ToolExecutor = (
  input: Record<string, unknown>,
  ctx: { userId: string }
) => Promise<string>;

export const TOOLS: Anthropic.Tool[] = [
  generateHooksTool,
  analyzeTiktokVideoTool,
  mineCommentsTool,
];

export const EXECUTORS: Record<string, ToolExecutor> = {
  generate_hooks: generateHooksExecutor,
  analyze_tiktok_video: analyzeTiktokVideoExecutor,
  mine_comments: mineCommentsExecutor,
};
