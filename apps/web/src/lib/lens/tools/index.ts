import type Anthropic from "@anthropic-ai/sdk";
import { generateHooksTool, generateHooksExecutor } from "./generate-hooks.js";
import {
  analyzeTiktokVideoTool,
  analyzeTiktokVideoExecutor,
} from "./analyze-tiktok-video.js";
import { mineCommentsTool, mineCommentsExecutor } from "./mine-comments.js";
import { draftScriptTool, draftScriptExecutor } from "./draft-script.js";
import { postMortemTool, postMortemExecutor } from "./post-mortem.js";
import { findTrendsTool, findTrendsExecutor } from "./find-trends.js";

export type ToolExecutor = (
  input: Record<string, unknown>,
  ctx: { userId: string }
) => Promise<string>;

export const TOOLS: Anthropic.Tool[] = [
  generateHooksTool,
  draftScriptTool,
  findTrendsTool,
  analyzeTiktokVideoTool,
  mineCommentsTool,
  postMortemTool,
];

export const EXECUTORS: Record<string, ToolExecutor> = {
  generate_hooks: generateHooksExecutor,
  draft_script: draftScriptExecutor,
  find_trends: findTrendsExecutor,
  analyze_tiktok_video: analyzeTiktokVideoExecutor,
  mine_comments: mineCommentsExecutor,
  post_mortem: postMortemExecutor,
};
