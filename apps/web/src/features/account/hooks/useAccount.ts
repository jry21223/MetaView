import { useCallback, useEffect, useState } from "react";
import {
  AccountRequestError,
  fetchAccountMe,
  type AccountMe,
} from "../api/accountApi";

export type AccountAuthStatus =
  | "loading"
  | "authenticated"
  | "unauthenticated"
  | "error";

export function useAccount() {
  const [account, setAccount] = useState<AccountMe | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<AccountAuthStatus>("loading");

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setStatus("loading");
    try {
      const next = await fetchAccountMe();
      setAccount(next);
      setStatus("authenticated");
    } catch (err) {
      const message = err instanceof Error ? err.message : "账户信息加载失败";
      setAccount(null);
      setError(message);
      setStatus(
        err instanceof AccountRequestError && err.status === 401
          ? "unauthenticated"
          : "error",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(refresh);
  }, [refresh]);

  return { account, isLoading, error, status, refresh };
}
