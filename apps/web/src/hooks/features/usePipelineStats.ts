import { useMemo } from "react";
import type { PipelineRunSummary } from "../../types";

export interface PipelineStats {
  totalRuns: number;
  errorRate: string;
  recentRuns: number;
  successRate: string;
}

function computeStats(runs: readonly PipelineRunSummary[]): PipelineStats {
  const total = runs.length;

  if (total === 0) {
    return { totalRuns: 0, errorRate: "0%", recentRuns: 0, successRate: "100%" };
  }

  const failed = runs.filter((r) => r.status === "failed").length;
  const succeeded = runs.filter((r) => r.status === "succeeded").length;

  // Count runs from the last 24 hours based on the most recent run's timestamp
  // to avoid calling Date.now() inside useMemo (purity rule).
  const cutoff = runs.length > 0
    ? new Date(runs[0].created_at).getTime() - 24 * 60 * 60 * 1000
    : 0;
  const recentRuns = runs.filter((r) => new Date(r.created_at).getTime() > cutoff).length;

  const errorPct = (failed / total) * 100;
  const successPct = (succeeded / total) * 100;

  return {
    totalRuns: total,
    errorRate: `${errorPct.toFixed(1)}%`,
    recentRuns,
    successRate: `${successPct.toFixed(1)}%`,
  };
}

export function usePipelineStats(runs: readonly PipelineRunSummary[]): PipelineStats {
  return useMemo(() => computeStats(runs), [runs]);
}
