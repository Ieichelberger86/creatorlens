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
import {
  scheduleContentTool,
  scheduleContentExecutor,
} from "./schedule-content.js";
import { listCalendarTool, listCalendarExecutor } from "./list-calendar.js";
import {
  updateCalendarEntryTool,
  updateCalendarEntryExecutor,
} from "./update-calendar-entry.js";
// generate_thumbnail removed — product no longer ships thumbnail generation.
import {
  reviewBrandDealTool,
  reviewBrandDealExecutor,
} from "./review-brand-deal.js";
import { planLiveShowTool, planLiveShowExecutor } from "./plan-live-show.js";
import {
  recordLiveRecapTool,
  recordLiveRecapExecutor,
} from "./record-live-recap.js";
import {
  repurposeVideoTool,
  repurposeVideoExecutor,
} from "./repurpose-video.js";
import {
  cloneCompetitorHookTool,
  cloneCompetitorHookExecutor,
} from "./clone-competitor-hook.js";
import { planSeriesTool, planSeriesExecutor } from "./plan-series.js";
import {
  draftCommentReplyTool,
  draftCommentReplyExecutor,
} from "./draft-comment-reply.js";
import { setGoalsTool, setGoalsExecutor } from "./set-goals.js";

export type ToolExecutor = (
  input: Record<string, unknown>,
  ctx: { userId: string }
) => Promise<string>;

export const TOOLS: Anthropic.Tool[] = [
  generateHooksTool,
  draftScriptTool,
  planSeriesTool,
  findTrendsTool,
  cloneCompetitorHookTool,
  analyzeTiktokVideoTool,
  mineCommentsTool,
  draftCommentReplyTool,
  postMortemTool,
  repurposeVideoTool,
  reviewBrandDealTool,
  planLiveShowTool,
  recordLiveRecapTool,
  scheduleContentTool,
  listCalendarTool,
  updateCalendarEntryTool,
  setGoalsTool,
];

export const EXECUTORS: Record<string, ToolExecutor> = {
  generate_hooks: generateHooksExecutor,
  draft_script: draftScriptExecutor,
  plan_series: planSeriesExecutor,
  find_trends: findTrendsExecutor,
  clone_competitor_hook: cloneCompetitorHookExecutor,
  analyze_tiktok_video: analyzeTiktokVideoExecutor,
  mine_comments: mineCommentsExecutor,
  draft_comment_reply: draftCommentReplyExecutor,
  post_mortem: postMortemExecutor,
  repurpose_video: repurposeVideoExecutor,
  review_brand_deal: reviewBrandDealExecutor,
  plan_live_show: planLiveShowExecutor,
  record_live_recap: recordLiveRecapExecutor,
  schedule_content: scheduleContentExecutor,
  list_calendar: listCalendarExecutor,
  update_calendar_entry: updateCalendarEntryExecutor,
  set_goals: setGoalsExecutor,
};
