import { useCallback, useEffect, useState } from "react";
import { fetchAccountMe, type AccountMe } from "../api/accountApi";

export function useAccount() {
  const [account, setAccount] = useState<AccountMe | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const next = await fetchAccountMe();
      setAccount(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "账户信息加载失败");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(refresh);
  }, [refresh]);

  return { account, isLoading, error, refresh };
}
