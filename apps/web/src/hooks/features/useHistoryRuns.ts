import { useState, useEffect, startTransition } from "react";
import { getPipelineRuns } from "../../api/client";
import type { PipelineRunSummary } from "../../types";

export function useHistoryRuns() {
  const [runs, setRuns] = useState<PipelineRunSummary[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);

  async function loadRuns(): Promise<PipelineRunSummary[]> {
    try {
      const historyRuns = await getPipelineRuns();
      setRuns(historyRuns);
      setHistoryError(null);
      return historyRuns;
    } catch (loadError) {
      setHistoryError(loadError instanceof Error ? loadError.message : "历史记录加载失败");
      return [];
    }
  }

  useEffect(() => {
    let active = true;

    void getPipelineRuns()
      .then((historyRuns) => {
        if (!active) {
          return;
        }

        startTransition(() => {
          setRuns(historyRuns);
          setHistoryError(null);
        });
      })
      .catch((loadError) => {
        if (!active) {
          return;
        }
        startTransition(() => {
          setHistoryError(loadError instanceof Error ? loadError.message : "历史记录加载失败");
        });
      });

    return () => {
      active = false;
    };
  }, []);

  return { runs, setRuns, historyError, setHistoryError, loadRuns };
}
