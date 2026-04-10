import { useEffect, useReducer } from "react";
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

interface ProgressState {
  autoStageIndex: number;
  runId: string | null;
}

type ProgressAction =
  | { type: "sync-run"; runId: string | null }
  | { type: "advance-stage" };

function reduceProgressState(state: ProgressState, action: ProgressAction): ProgressState {
  switch (action.type) {
    case "sync-run":
      if (state.runId === action.runId) {
        return state;
      }
      return {
        runId: action.runId,
        autoStageIndex: 0,
      };
    case "advance-stage":
      if (state.autoStageIndex >= STAGES.length - 1) {
        return state;
      }
      return {
        ...state,
        autoStageIndex: state.autoStageIndex + 1,
      };
  }
}

/**
 * Simulates pipeline stage progression while a task is running.
 * The backend only exposes queued/running/succeeded/failed — no per-stage
 * granularity — so we advance stages on a timer.
 */
export function useTaskProgress(
  runId: string | null,
  loading: boolean,
  hasCompletedPreview: boolean,
): TaskProgressState {
  const [{ autoStageIndex }, dispatch] = useReducer(reduceProgressState, {
    runId,
    autoStageIndex: 0,
  });

  useEffect(() => {
    dispatch({ type: "sync-run", runId });
  }, [runId]);

  useEffect(() => {
    if (!loading || autoStageIndex >= STAGES.length - 1) {
      return;
    }

    const timer = window.setTimeout(() => {
      dispatch({ type: "advance-stage" });
    }, STAGE_ADVANCE_MS);

    return () => window.clearTimeout(timer);
  }, [loading, autoStageIndex]);

  const stageIndex = hasCompletedPreview
    ? STAGES.length
    : loading
      ? autoStageIndex
      : -1;

  return {
    currentStageIndex: stageIndex,
    stages: STAGES,
    isIdle: stageIndex === -1,
    isComplete: stageIndex >= STAGES.length,
  };
}
