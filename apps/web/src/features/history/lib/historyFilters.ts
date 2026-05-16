import type { PipelineRunResult } from "../../../entities/pipeline/types";

/**
 * Client-side filtering / stats / export utilities for HistoryPage (issue #16).
 * Kept as pure functions so they're trivially testable and reusable from any
 * future history surface (export tab, dashboards).
 */

export type StatusFilter = "all" | PipelineRunResult["status"];
export type TimeWindow = "all" | "today" | "week" | "month";

export interface HistoryFilter {
  search: string;
  domain: string; // "" = all domains
  status: StatusFilter;
  timeWindow: TimeWindow;
}

export const DEFAULT_FILTER: HistoryFilter = {
  search: "",
  domain: "",
  status: "all",
  timeWindow: "all",
};

const TIME_WINDOW_DAYS: Record<TimeWindow, number | null> = {
  all: null,
  today: 1,
  week: 7,
  month: 30,
};

function withinWindow(createdAt: string, window: TimeWindow, now = Date.now()): boolean {
  const days = TIME_WINDOW_DAYS[window];
  if (days === null) return true;
  const ts = Date.parse(createdAt);
  if (!Number.isFinite(ts)) return true; // never drop unparseable dates
  return ts >= now - days * 24 * 60 * 60 * 1000;
}

export function applyHistoryFilter(
  runs: PipelineRunResult[],
  filter: HistoryFilter,
  now: number = Date.now(),
): PipelineRunResult[] {
  const search = filter.search.trim().toLowerCase();
  return runs.filter((run) => {
    if (filter.status !== "all" && run.status !== filter.status) return false;
    const domain = run.playbook?.domain ?? "";
    if (filter.domain && domain !== filter.domain) return false;
    if (!withinWindow(run.created_at, filter.timeWindow, now)) return false;
    if (search) {
      const haystack = [
        run.playbook?.title ?? "",
        run.playbook?.summary ?? "",
        run.prompt ?? "",
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
}

export interface HistoryStats {
  total: number;
  succeeded: number;
  failed: number;
  inFlight: number;
  /** Average step count across succeeded runs (or null when none). */
  averageSteps: number | null;
}

export function computeHistoryStats(runs: PipelineRunResult[]): HistoryStats {
  let succeeded = 0;
  let failed = 0;
  let inFlight = 0;
  let stepsTotal = 0;
  let stepsCounted = 0;
  for (const run of runs) {
    if (run.status === "succeeded") succeeded += 1;
    else if (run.status === "failed") failed += 1;
    else inFlight += 1;
    const steps = run.playbook?.steps?.length;
    if (run.status === "succeeded" && typeof steps === "number") {
      stepsTotal += steps;
      stepsCounted += 1;
    }
  }
  return {
    total: runs.length,
    succeeded,
    failed,
    inFlight,
    averageSteps: stepsCounted > 0 ? stepsTotal / stepsCounted : null,
  };
}

export interface RunsToCsvOptions {
  /** When true the original prompt column is included — opt-in because the
   *  prompt may contain PII (user-pasted source code, names, emails). Issue
   *  #64. Defaults to false so a user has to explicitly enable export. */
  includePrompt?: boolean;
}

/**
 * Build a CSV string from the given runs. Quotes any field that contains
 * comma / quote / newline; values use Excel-compatible RFC 4180 escaping.
 *
 * ``includePrompt`` defaults to false to avoid exporting potentially
 * sensitive user prompts in a shareable file. Issue #64.
 */
export function runsToCsv(
  runs: PipelineRunResult[],
  options: RunsToCsvOptions = {},
): string {
  const includePrompt = options.includePrompt === true;
  const header = ["created_at", "title", "domain", "status", "steps"];
  if (includePrompt) header.push("prompt");
  const lines = [header.join(",")];
  for (const run of runs) {
    const row = [
      run.created_at,
      run.playbook?.title ?? "",
      run.playbook?.domain ?? "",
      run.status,
      String(run.playbook?.steps?.length ?? ""),
    ];
    if (includePrompt) row.push(run.prompt ?? "");
    lines.push(row.map(csvEscape).join(","));
  }
  return lines.join("\n");
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Distinct domains across the run set, sorted alphabetically. Used to feed
 * the domain filter <select> so the dropdown stays in sync with what's
 * actually in the database.
 */
export function uniqueDomains(runs: PipelineRunResult[]): string[] {
  const out = new Set<string>();
  for (const run of runs) {
    const d = run.playbook?.domain;
    if (d) out.add(d);
  }
  return [...out].sort();
}
