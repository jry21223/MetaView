import { describe, expect, it } from "vitest";
import type { PipelineRunResult } from "../../../entities/pipeline/types";
import {
  applyHistoryFilter,
  computeHistoryStats,
  DEFAULT_FILTER,
  runsToCsv,
  uniqueDomains,
} from "./historyFilters";

const NOW = Date.parse("2026-05-16T12:00:00Z");

function run(
  partial: Partial<PipelineRunResult> & { run_id: string; created_at: string },
): PipelineRunResult {
  return {
    status: "succeeded",
    prompt: "",
    error: null,
    review: null,
    playbook: null,
    ...partial,
  };
}

describe("applyHistoryFilter (issue #16)", () => {
  const runs: PipelineRunResult[] = [
    run({
      run_id: "a",
      created_at: "2026-05-16T11:00:00Z", // today
      status: "succeeded",
      prompt: "可视化冒泡排序",
      playbook: { title: "冒泡排序", domain: "algorithm", steps: [] } as never,
    }),
    run({
      run_id: "b",
      created_at: "2026-05-11T08:00:00Z", // this week, NOT today
      status: "failed",
      prompt: "可视化斐波那契",
      playbook: { title: "斐波那契", domain: "math", steps: [] } as never,
    }),
    run({
      run_id: "c",
      created_at: "2026-04-20T08:00:00Z", // this month, NOT this week
      status: "succeeded",
      prompt: "H2O 分子结构",
      playbook: { title: "水分子", domain: "chemistry", steps: [] } as never,
    }),
  ];

  it("returns everything with the default filter", () => {
    expect(applyHistoryFilter(runs, DEFAULT_FILTER, NOW)).toHaveLength(3);
  });

  it("filters by free-text search across title / prompt / summary", () => {
    expect(
      applyHistoryFilter(runs, { ...DEFAULT_FILTER, search: "冒泡" }, NOW),
    ).toEqual([runs[0]]);
    expect(
      applyHistoryFilter(runs, { ...DEFAULT_FILTER, search: "H2O" }, NOW),
    ).toEqual([runs[2]]);
  });

  it("filters by domain", () => {
    expect(
      applyHistoryFilter(runs, { ...DEFAULT_FILTER, domain: "math" }, NOW),
    ).toEqual([runs[1]]);
  });

  it("filters by status", () => {
    expect(
      applyHistoryFilter(runs, { ...DEFAULT_FILTER, status: "failed" }, NOW),
    ).toEqual([runs[1]]);
  });

  it("filters by today window", () => {
    expect(
      applyHistoryFilter(runs, { ...DEFAULT_FILTER, timeWindow: "today" }, NOW),
    ).toEqual([runs[0]]);
  });

  it("filters by week window (≤7 days)", () => {
    expect(
      applyHistoryFilter(runs, { ...DEFAULT_FILTER, timeWindow: "week" }, NOW),
    ).toEqual([runs[0], runs[1]]);
  });

  it("filters by month window (≤30 days)", () => {
    expect(
      applyHistoryFilter(runs, { ...DEFAULT_FILTER, timeWindow: "month" }, NOW),
    ).toEqual(runs);
  });
});

describe("computeHistoryStats", () => {
  it("counts succeeded / failed / in-flight and averages step counts", () => {
    const runs: PipelineRunResult[] = [
      run({
        run_id: "a",
        created_at: "2026-05-16T11:00:00Z",
        status: "succeeded",
        playbook: { steps: new Array(5).fill({}) } as never,
      }),
      run({
        run_id: "b",
        created_at: "2026-05-16T11:00:00Z",
        status: "succeeded",
        playbook: { steps: new Array(7).fill({}) } as never,
      }),
      run({
        run_id: "c",
        created_at: "2026-05-16T11:00:00Z",
        status: "failed",
      }),
      run({
        run_id: "d",
        created_at: "2026-05-16T11:00:00Z",
        status: "running",
      }),
    ];
    expect(computeHistoryStats(runs)).toEqual({
      total: 4,
      succeeded: 2,
      failed: 1,
      inFlight: 1,
      averageSteps: 6,
    });
  });

  it("returns null average when there are no succeeded runs with steps", () => {
    expect(
      computeHistoryStats([
        run({ run_id: "x", created_at: "2026-05-16T11:00:00Z", status: "failed" }),
      ]).averageSteps,
    ).toBeNull();
  });
});

describe("uniqueDomains", () => {
  it("returns sorted distinct domains", () => {
    const runs: PipelineRunResult[] = [
      run({
        run_id: "a",
        created_at: "2026-05-16T11:00:00Z",
        playbook: { domain: "math" } as never,
      }),
      run({
        run_id: "b",
        created_at: "2026-05-16T11:00:00Z",
        playbook: { domain: "algorithm" } as never,
      }),
      run({
        run_id: "c",
        created_at: "2026-05-16T11:00:00Z",
        playbook: { domain: "math" } as never,
      }),
    ];
    expect(uniqueDomains(runs)).toEqual(["algorithm", "math"]);
  });
});

describe("runsToCsv", () => {
  it("omits the prompt column by default (issue #64 PII guard)", () => {
    const csv = runsToCsv([
      run({
        run_id: "a",
        created_at: "2026-05-16T11:00:00Z",
        status: "succeeded",
        prompt: "user@example.com leaked here",
        playbook: { title: "Hi", domain: "math", steps: [] } as never,
      }),
    ]);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("created_at,title,domain,status,steps");
    expect(csv).not.toContain("user@example.com");
  });

  it("includes the prompt column when explicitly opted in", () => {
    const csv = runsToCsv(
      [
        run({
          run_id: "a",
          created_at: "2026-05-16T11:00:00Z",
          status: "succeeded",
          prompt: "hello",
          playbook: {
            title: "Hi",
            domain: "math",
            steps: [{} as never, {} as never],
          } as never,
        }),
      ],
      { includePrompt: true },
    );
    const lines = csv.split("\n");
    expect(lines[0]).toBe("created_at,title,domain,status,steps,prompt");
    expect(lines[1]).toBe("2026-05-16T11:00:00Z,Hi,math,succeeded,2,hello");
  });

  it("escapes fields that contain commas / quotes / newlines", () => {
    const csv = runsToCsv(
      [
        run({
          run_id: "a",
          created_at: "2026-05-16T11:00:00Z",
          status: "succeeded",
          prompt: 'hello, "world"\nnext line',
          playbook: { title: "T", domain: "math", steps: [] } as never,
        }),
      ],
      { includePrompt: true },
    );
    const data = csv.split("\n").slice(1).join("\n");
    expect(data).toContain('"hello, ""world""');
  });
});
