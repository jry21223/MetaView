import { act, cleanup, render } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PipelineRunResult } from "../../../entities/pipeline/types";
import { server } from "../../../mocks/server";
import { API_BASE_URL } from "../../../shared/config/constants";
import { useHistoryRuns } from "./useHistoryRuns";

function run(
  runId: string,
  status: PipelineRunResult["status"],
): PipelineRunResult {
  return {
    run_id: runId,
    status,
    prompt: `prompt-${runId}`,
    playbook: null,
    error: null,
    created_at: "2026-06-01T10:00:00.000Z",
    review: null,
  };
}

function HistoryProbe() {
  const { runs, isLoading } = useHistoryRuns();
  return (
    <div>
      <span data-testid="loading">{String(isLoading)}</span>
      <span data-testid="statuses">
        {runs.map((r) => `${r.run_id}:${r.status}`).join(",")}
      </span>
    </div>
  );
}

describe("useHistoryRuns auto refresh", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("polls again while runs are in flight and updates statuses silently", async () => {
    vi.useFakeTimers();
    let hits = 0;
    server.use(
      http.get(`${API_BASE_URL}/api/v1/runs`, () => {
        hits += 1;
        return HttpResponse.json([
          run("run-1", hits === 1 ? "running" : "succeeded"),
        ]);
      }),
    );

    const { getByTestId } = render(<HistoryProbe />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(getByTestId("statuses").textContent).toBe("run-1:running");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_500);
    });

    expect(hits).toBe(2);
    expect(getByTestId("statuses").textContent).toBe("run-1:succeeded");
    // Background refresh must never flip the list back into loading.
    expect(getByTestId("loading").textContent).toBe("false");
  });

  it("does not poll when every run is terminal", async () => {
    vi.useFakeTimers();
    let hits = 0;
    server.use(
      http.get(`${API_BASE_URL}/api/v1/runs`, () => {
        hits += 1;
        return HttpResponse.json([run("run-1", "succeeded"), run("run-2", "failed")]);
      }),
    );

    render(<HistoryProbe />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(hits).toBe(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(hits).toBe(1);
  });

  it("stops polling once in-flight runs settle", async () => {
    vi.useFakeTimers();
    let hits = 0;
    server.use(
      http.get(`${API_BASE_URL}/api/v1/runs`, () => {
        hits += 1;
        return HttpResponse.json([
          run("run-1", hits === 1 ? "reviewing" : "succeeded"),
        ]);
      }),
    );

    const { getByTestId } = render(<HistoryProbe />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(getByTestId("statuses").textContent).toContain("run-1");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(hits).toBe(2);
  });
});
