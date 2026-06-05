import { useEffect, useRef, useReducer } from "react";
import { getPipelineRun } from "../api/pipelineApi";
import type { PipelineRunResult } from "../../../entities/pipeline/types";
import type { DirectorScript, PlaybookScript } from "../../../entities/playbook/types";

const POLL_INTERVAL_MS = 2000;
const SOFT_TIMEOUT_ATTEMPTS = 450;
const ACTIVE_RUN_STATUSES = new Set<PipelineRunResult["status"]>(["queued", "running", "reviewing"]);
const STILL_RUNNING_MESSAGE = "仍在生成，可稍后到历史记录查看";

interface State {
  playbook: PlaybookScript | null;
  director: DirectorScript | null;
  status: PipelineRunResult["status"] | null;
  error: string | null;
}

type Action =
  | { type: "reset" }
  | { type: "poll_success"; result: PipelineRunResult }
  | { type: "poll_error"; error: string }
  | { type: "soft_timeout" };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "reset":
      return { playbook: null, director: null, status: null, error: null };
    case "poll_success": {
      const { result } = action;
      const succeeded = result.status === "succeeded";
      return {
        status: result.status,
        playbook: succeeded ? (result.playbook ?? null) : state.playbook,
        director: succeeded ? (result.director ?? null) : state.director,
        error:
          result.status === "failed"
            ? (result.error ?? "生成失败，请返回重试")
            : state.error === STILL_RUNNING_MESSAGE && ACTIVE_RUN_STATUSES.has(result.status)
              ? STILL_RUNNING_MESSAGE
              : null,
      };
    }
    case "poll_error":
      return { ...state, status: "failed", error: action.error };
    case "soft_timeout":
      return { ...state, status: state.status ?? "running", error: STILL_RUNNING_MESSAGE };
  }
}

export interface UsePipelinePollerResult {
  playbook: PlaybookScript | null;
  director: DirectorScript | null;
  status: PipelineRunResult["status"] | null;
  error: string | null;
  isLoading: boolean;
}

export function usePipelinePoller(runId: string | null): UsePipelinePollerResult {
  const [state, dispatch] = useReducer(reducer, {
    playbook: null,
    director: null,
    status: null,
    error: null,
  });
  const attemptsRef = useRef(0);
  const softTimeoutShownRef = useRef(false);

  useEffect(() => {
    if (!runId) {
      dispatch({ type: "reset" });
      return;
    }

    dispatch({ type: "reset" });
    attemptsRef.current = 0;
    softTimeoutShownRef.current = false;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const poll = async () => {
      attemptsRef.current += 1;

      if (attemptsRef.current > SOFT_TIMEOUT_ATTEMPTS && !softTimeoutShownRef.current) {
        softTimeoutShownRef.current = true;
        if (!cancelled) dispatch({ type: "soft_timeout" });
      }

      try {
        const result = await getPipelineRun(runId);
        if (cancelled) return;
        dispatch({ type: "poll_success", result });
        if (result.status === "succeeded" || result.status === "failed") {
          if (timer) clearInterval(timer);
        }
      } catch (err) {
        if (timer) clearInterval(timer);
        if (!cancelled) {
          dispatch({
            type: "poll_error",
            error: err instanceof Error ? err.message : "查询失败，请返回重试",
          });
        }
      }
    };

    void poll();
    timer = setInterval(() => {
      void poll();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [runId]);

  const isLoading = runId !== null && (state.status === null || ACTIVE_RUN_STATUSES.has(state.status));

  return { ...state, isLoading };
}
