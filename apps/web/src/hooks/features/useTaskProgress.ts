import { useEffect, useState } from "react";
import type { PipelineStage } from "../../types";

const STAGES: PipelineStage[] = [
  "domain_routing",
  "cir_planning",
  "script_coding",
  "render_output",
];

const STAGE_ADVANCE_MS = 5000;

export interface TaskProgressState {
  /** Index into STAGES (-1 = idle, 0-3 = active, 4 = all done) */
  currentStageIndex: number;
  stages: PipelineStage[];
  isIdle: boolean;
  isComplete: boolean;
}

/**
 * Simulates pipeline stage progression while a task is running.
 * The backend only exposes queued/running/succeeded/failed — no per-stage
 * granularity — so we advance stages on a timer.
 */
export function useTaskProgress(
  loading: boolean,
  hasCompletedPreview: boolean,
): TaskProgressState {
  const [stageIndex, setStageIndex] = useState(-1);

  // Reset when loading starts
  useEffect(() => {
    if (loading) {
      setStageIndex(0);
    } else if (!hasCompletedPreview) {
      setStageIndex(-1);
    }
  }, [loading, hasCompletedPreview]);

  // Mark complete when preview is ready
  useEffect(() => {
    if (hasCompletedPreview) {
      setStageIndex(STAGES.length);
    }
  }, [hasCompletedPreview]);

  // Auto-advance while loading
  useEffect(() => {
    if (!loading || stageIndex < 0 || stageIndex >= STAGES.length - 1) {
      return;
    }

    const timer = window.setTimeout(() => {
      setStageIndex((i) => Math.min(i + 1, STAGES.length - 1));
    }, STAGE_ADVANCE_MS);

    return () => window.clearTimeout(timer);
  }, [loading, stageIndex]);

  return {
    currentStageIndex: stageIndex,
    stages: STAGES,
    isIdle: stageIndex === -1,
    isComplete: stageIndex >= STAGES.length,
  };
}
