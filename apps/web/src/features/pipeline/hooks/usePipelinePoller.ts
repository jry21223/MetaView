import { useCallback, useEffect, useReducer, useState } from "react";
import { getPipelineRun } from "../api/pipelineApi";
import type { PipelineRunResult } from "../../../entities/pipeline/types";
import type { DirectorScript, PlaybookScript } from "../../../entities/playbook/types";

const POLL_INTERVAL_MS = 2000;
const SOFT_TIMEOUT_ATTEMPTS = 450;
/** Consecutive fetch failures tolerated before declaring a network failure. */
const MAX_CONSECUTIVE_FAILURES = 4;
/** Backoff delays after the 1st/2nd/3rd consecutive failure. */
const FAILURE_BACKOFF_MS = [2000, 4000, 8000] as const;
const ACTIVE_RUN_STATUSES = new Set<PipelineRunResult["status"]>(["queued", "running", "reviewing"]);
const STILL_RUNNING_MESSAGE = "仍在生成，可稍后到历史记录查看";
const NETWORK_ERROR_MESSAGE = "连接服务器失败，请检查网络后重试";

export type PipelineErrorKind = "network" | "run_failed";

interface State {
  playbook: PlaybookScript | null;
  director: DirectorScript | null;
  status: PipelineRunResult["status"] | null;
  error: string | null;
  errorKind: PipelineErrorKind | null;
  prompt: string | null;
  createdAt: string | null;
}

type Action =
  | { type: "reset" }
  | { type: "poll_success"; result: PipelineRunResult }
  | { type: "poll_error"; error: string }
  | { type: "soft_timeout" };

const INITIAL_STATE: State = {
  playbook: null,
  director: null,
  status: null,
  error: null,
  errorKind: null,
  prompt: null,
  createdAt: null,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "reset":
      return INITIAL_STATE;
    case "poll_success": {
      const { result } = action;
      const succeeded = result.status === "succeeded";
      const failed = result.status === "failed";
      return {
        status: result.status,
        playbook: succeeded ? (result.playbook ?? null) : state.playbook,
        director: succeeded ? (result.director ?? null) : state.director,
        prompt: result.prompt ?? state.prompt,
        createdAt: result.created_at ?? state.createdAt,
        error: failed
          ? (result.error ?? "生成失败，请返回重试")
          : state.error === STILL_RUNNING_MESSAGE && ACTIVE_RUN_STATUSES.has(result.status)
            ? STILL_RUNNING_MESSAGE
            : null,
        errorKind: failed ? "run_failed" : null,
      };
    }
    case "poll_error":
      return { ...state, status: "failed", error: action.error, errorKind: "network" };
    case "soft_timeout":
      return { ...state, status: state.status ?? "running", error: STILL_RUNNING_MESSAGE };
  }
}

export interface UsePipelinePollerResult {
  playbook: PlaybookScript | null;
  director: DirectorScript | null;
  status: PipelineRunResult["status"] | null;
  error: string | null;
  errorKind: PipelineErrorKind | null;
  prompt: string | null;
  createdAt: string | null;
  isLoading: boolean;
  /** Restart polling for the current run after a network failure. */
  retry: () => void;
}

export function usePipelinePoller(runId: string | null): UsePipelinePollerResult {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const [pollGeneration, setPollGeneration] = useState(0);

  const retry = useCallback(() => {
    setPollGeneration((generation) => generation + 1);
  }, []);

  useEffect(() => {
    if (!runId) {
      dispatch({ type: "reset" });
      return;
    }

    dispatch({ type: "reset" });
    let attempts = 0;
    let consecutiveFailures = 0;
    let softTimeoutShown = false;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = (delayMs: number) => {
      if (cancelled) return;
      timer = setTimeout(() => {
        void poll();
      }, delayMs);
    };

    const poll = async () => {
      attempts += 1;

      if (attempts > SOFT_TIMEOUT_ATTEMPTS && !softTimeoutShown) {
        softTimeoutShown = true;
        if (!cancelled) dispatch({ type: "soft_timeout" });
      }

      try {
        const result = await getPipelineRun(runId);
        if (cancelled) return;
        consecutiveFailures = 0;
        dispatch({ type: "poll_success", result });
        if (result.status !== "succeeded" && result.status !== "failed") {
          schedule(POLL_INTERVAL_MS);
        }
      } catch {
        if (cancelled) return;
        consecutiveFailures += 1;
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          dispatch({ type: "poll_error", error: NETWORK_ERROR_MESSAGE });
          return;
        }
        const backoff =
          FAILURE_BACKOFF_MS[Math.min(consecutiveFailures - 1, FAILURE_BACKOFF_MS.length - 1)];
        schedule(backoff);
      }
    };

    void poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [runId, pollGeneration]);

  const isLoading = runId !== null && (state.status === null || ACTIVE_RUN_STATUSES.has(state.status));

  return { ...state, isLoading, retry };
}
