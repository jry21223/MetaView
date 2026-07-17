import type { PipelineRunResult } from "../../../entities/pipeline/types";

type ActiveStatus = Extract<
  PipelineRunResult["status"],
  "queued" | "running" | "reviewing" | "succeeded"
>;

/** Rotating descriptive copy shown under the loader label per stage. */
export const PIPELINE_STAGE_HINTS: Record<ActiveStatus, readonly string[]> = {
  queued: [
    "任务已进入队列，马上开始…",
    "正在分配生成资源…",
  ],
  running: [
    "正在分析题目结构，拆解教学步骤…",
    "正在编排画面对象与动画脚本…",
    "正在撰写每一步的旁白讲解…",
  ],
  reviewing: [
    "正在检查讲解步骤的正确性…",
    "正在校对公式、代码与画面同步…",
    "发现问题会自动修正后再交付…",
  ],
  succeeded: ["渲染完成，即将进入播放…"],
};
