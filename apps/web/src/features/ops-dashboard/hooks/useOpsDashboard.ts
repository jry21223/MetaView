import { useCallback, useEffect, useReducer, useState } from "react";
import {
  fetchOpsDashboard,
  OpsDashboardRequestError,
  type OpsDashboardResponse,
  type OpsDashboardWindowDays,
} from "../api/opsDashboardApi";

interface State {
  dashboard: OpsDashboardResponse | null;
  isLoading: boolean;
  error: string | null;
  errorStatus: number | null;
}

type Action =
  | { type: "fetch_start" }
  | { type: "fetch_success"; dashboard: OpsDashboardResponse }
  | { type: "fetch_error"; error: string; status: number | null };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "fetch_start":
      return { ...state, isLoading: true, error: null, errorStatus: null };
    case "fetch_success":
      return {
        dashboard: action.dashboard,
        isLoading: false,
        error: null,
        errorStatus: null,
      };
    case "fetch_error":
      return {
        ...state,
        isLoading: false,
        error: action.error,
        errorStatus: action.status,
      };
  }
}

export interface UseOpsDashboardResult extends State {
  refresh: () => void;
}

export function useOpsDashboard(windowDays: OpsDashboardWindowDays): UseOpsDashboardResult {
  const [state, dispatch] = useReducer(reducer, {
    dashboard: null,
    isLoading: true,
    error: null,
    errorStatus: null,
  });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    dispatch({ type: "fetch_start" });

    fetchOpsDashboard({ windowDays, limit: 50 })
      .then((dashboard) => {
        if (!cancelled) dispatch({ type: "fetch_success", dashboard });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const status = err instanceof OpsDashboardRequestError ? err.status : null;
        dispatch({
          type: "fetch_error",
          error: err instanceof Error ? err.message : "运营数据加载失败",
          status,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [windowDays, tick]);

  const refresh = useCallback(() => setTick((n) => n + 1), []);

  return { ...state, refresh };
}
