import { useState, useEffect, useCallback, useReducer } from "react";
import type { PipelineRunResult } from "../../../entities/pipeline/types";
import { getPipelineRuns } from "../api/historyApi";

/** Delay between silent re-fetches while runs are still in flight. */
const IN_FLIGHT_REFRESH_MS = 5000;

const IN_FLIGHT_STATUSES = new Set<PipelineRunResult["status"]>([
  "queued",
  "running",
  "reviewing",
]);

function hasInFlightRuns(runs: PipelineRunResult[]): boolean {
  return runs.some((run) => IN_FLIGHT_STATUSES.has(run.status));
}

interface State {
  runs: PipelineRunResult[];
  isLoading: boolean;
  error: string | null;
}

type Action =
  | { type: "fetch_start" }
  | { type: "fetch_success"; runs: PipelineRunResult[] }
  | { type: "refresh_success"; runs: PipelineRunResult[] }
  | { type: "fetch_error"; error: string };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "fetch_start":
      return { ...state, isLoading: true, error: null };
    case "fetch_success":
      return { runs: action.runs, isLoading: false, error: null };
    // Background refresh: update runs without touching the loading flag,
    // so in-flight status updates never flash the list skeleton.
    case "refresh_success":
      return { ...state, runs: action.runs, error: null };
    case "fetch_error":
      return { ...state, isLoading: false, error: action.error };
  }
}

export interface UseHistoryRunsResult {
  runs: PipelineRunResult[];
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useHistoryRuns(): UseHistoryRunsResult {
  const [state, dispatch] = useReducer(reducer, { runs: [], isLoading: true, error: null });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let backgroundTimer: ReturnType<typeof setTimeout> | null = null;
    dispatch({ type: "fetch_start" });

    const scheduleBackgroundRefresh = (runs: PipelineRunResult[]) => {
      if (cancelled || !hasInFlightRuns(runs)) return;
      backgroundTimer = setTimeout(() => {
        getPipelineRuns()
          .then((data) => {
            if (cancelled) return;
            dispatch({ type: "refresh_success", runs: data });
            scheduleBackgroundRefresh(data);
          })
          .catch(() => {
            // Silent refresh failures keep the last good list; the manual
            // refresh button still surfaces errors via the main fetch.
            if (!cancelled) scheduleBackgroundRefresh(runs);
          });
      }, IN_FLIGHT_REFRESH_MS);
    };

    getPipelineRuns()
      .then((data) => {
        if (cancelled) return;
        dispatch({ type: "fetch_success", runs: data });
        scheduleBackgroundRefresh(data);
      })
      .catch((err: unknown) => {
        if (!cancelled)
          dispatch({ type: "fetch_error", error: err instanceof Error ? err.message : "加载失败" });
      });

    return () => {
      cancelled = true;
      if (backgroundTimer) clearTimeout(backgroundTimer);
    };
  }, [tick]);

  const refresh = useCallback(() => setTick((n) => n + 1), []);

  return { ...state, refresh };
}
