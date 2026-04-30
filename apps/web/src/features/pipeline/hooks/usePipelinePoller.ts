import { useEffect, useRef, useReducer } from "react";
import { getPipelineRun } from "../api/pipelineApi";
import type { PipelineRunResult } from "../../../entities/pipeline/types";
import type { PlaybookScript } from "../../../entities/playbook/types";

const POLL_INTERVAL_MS = 2000;
const MAX_ATTEMPTS = 120;

interface State {
  playbook: PlaybookScript | null;
  status: PipelineRunResult["status"] | null;
  error: string | null;
}

type Action =
  | { type: "reset" }
  | { type: "poll_success"; result: PipelineRunResult }
  | { type: "poll_error"; error: string }
  | { type: "timeout" };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "reset":
      return { playbook: null, status: null, error: null };
    case "poll_success": {
      const { result } = action;
      return {
        status: result.status,
        playbook: result.status === "succeeded" ? (result.playbook ?? null) : state.playbook,
        error: result.status === "failed" ? (result.error ?? "生成失败，请返回重试") : null,
      };
    }
    case "poll_error":
      return { ...state, status: "failed", error: action.error };
    case "timeout":
      return { ...state, status: "failed", error: "生成超时，请返回重试" };
  }
}

export interface UsePipelinePollerResult {
  playbook: PlaybookScript | null;
  status: PipelineRunResult["status"] | null;
  error: string | null;
  isLoading: boolean;
}

export function usePipelinePoller(runId: string | null): UsePipelinePollerResult {
  const [state, dispatch] = useReducer(reducer, { playbook: null, status: null, error: null });
  const attemptsRef = useRef(0);

  useEffect(() => {
    if (!runId) return;

    dispatch({ type: "reset" });
    attemptsRef.current = 0;

    const timer = setInterval(async () => {
      attemptsRef.current += 1;

      if (attemptsRef.current > MAX_ATTEMPTS) {
        clearInterval(timer);
        dispatch({ type: "timeout" });
        return;
      }

      try {
        const result = await getPipelineRun(runId);
        dispatch({ type: "poll_success", result });
        if (result.status === "succeeded" || result.status === "failed") {
          clearInterval(timer);
        }
      } catch (err) {
        clearInterval(timer);
        dispatch({
          type: "poll_error",
          error: err instanceof Error ? err.message : "查询失败，请返回重试",
        });
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [runId]);

  const isLoading =
    runId !== null && (state.status === "queued" || state.status === "running" || state.status === null);

  return { ...state, isLoading };
}
