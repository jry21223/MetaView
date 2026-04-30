import { useState, useEffect, useCallback, useReducer } from "react";
import { API_BASE_URL, readErrorMessage } from "../../../shared/api/httpClient";
import type { PipelineRunResult } from "../../../entities/pipeline/types";

interface State {
  runs: PipelineRunResult[];
  isLoading: boolean;
  error: string | null;
}

type Action =
  | { type: "fetch_start" }
  | { type: "fetch_success"; runs: PipelineRunResult[] }
  | { type: "fetch_error"; error: string };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "fetch_start":
      return { ...state, isLoading: true, error: null };
    case "fetch_success":
      return { runs: action.runs, isLoading: false, error: null };
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
    dispatch({ type: "fetch_start" });

    fetch(`${API_BASE_URL}/api/v1/runs`)
      .then(async (resp) => {
        if (!resp.ok) throw new Error(await readErrorMessage(resp, "Failed to load history"));
        return resp.json() as Promise<PipelineRunResult[]>;
      })
      .then((data) => {
        if (!cancelled) dispatch({ type: "fetch_success", runs: data });
      })
      .catch((err: unknown) => {
        if (!cancelled)
          dispatch({ type: "fetch_error", error: err instanceof Error ? err.message : "加载失败" });
      });

    return () => { cancelled = true; };
  }, [tick]);

  const refresh = useCallback(() => setTick((n) => n + 1), []);

  return { ...state, refresh };
}
