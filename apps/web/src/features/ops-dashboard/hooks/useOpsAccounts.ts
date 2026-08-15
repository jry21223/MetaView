import { useCallback, useEffect, useReducer, useState } from "react";
import {
  fetchOpsAccounts,
  OpsAccountsRequestError,
  type OpsAccountsResponse,
} from "../api/opsAccountsApi";

interface State {
  accounts: OpsAccountsResponse | null;
  isLoading: boolean;
  error: string | null;
  errorStatus: number | null;
}

type Action =
  | { type: "fetch_start" }
  | { type: "fetch_success"; accounts: OpsAccountsResponse }
  | { type: "fetch_error"; error: string; status: number | null };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "fetch_start":
      return { ...state, isLoading: true, error: null, errorStatus: null };
    case "fetch_success":
      return {
        accounts: action.accounts,
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

export interface OpsAccountsParams {
  search: string;
  page: number;
  pageSize: number;
}

export interface UseOpsAccountsResult extends State {
  refresh: () => void;
}

export function useOpsAccounts({
  search,
  page,
  pageSize,
}: OpsAccountsParams): UseOpsAccountsResult {
  const [state, dispatch] = useReducer(reducer, {
    accounts: null,
    isLoading: true,
    error: null,
    errorStatus: null,
  });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    dispatch({ type: "fetch_start" });

    fetchOpsAccounts({ search, page, pageSize })
      .then((accounts) => {
        if (!cancelled) dispatch({ type: "fetch_success", accounts });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const status = err instanceof OpsAccountsRequestError ? err.status : null;
        dispatch({
          type: "fetch_error",
          error: err instanceof Error ? err.message : "账户列表加载失败",
          status,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [search, page, pageSize, tick]);

  const refresh = useCallback(() => setTick((n) => n + 1), []);

  return { ...state, refresh };
}
