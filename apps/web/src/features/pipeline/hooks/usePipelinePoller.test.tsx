import { act, cleanup, render, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PipelineRunResult } from "../../../entities/pipeline/types";
import { server } from "../../../mocks/server";
import { API_BASE_URL } from "../../../shared/config/constants";
import { usePipelinePoller } from "./usePipelinePoller";

function PollerProbe({ runId }: { runId: string | null }) {
  const result = usePipelinePoller(runId);

  return (
    <div>
      <span data-testid="status">{result.status ?? "none"}</span>
      <span data-testid="loading">{String(result.isLoading)}</span>
      <span data-testid="error">{result.error ?? ""}</span>
    </div>
  );
}

function fixtureRun(status: PipelineRunResult["status"]): PipelineRunResult {
  return {
    run_id: "run-1",
    status,
    prompt: "讲解二分查找",
    playbook: null,
    error: status === "failed" ? "生成失败" : null,
    created_at: "2026-06-02T00:00:00.000Z",
    review: null,
  };
}

describe("usePipelinePoller", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("keeps the loading animation active while the API reports reviewing", async () => {
    server.use(
      http.get(`${API_BASE_URL}/api/v1/runs/run-1`, () => HttpResponse.json(fixtureRun("reviewing"))),
    );

    const { getByTestId } = render(<PollerProbe runId="run-1" />);

    await waitFor(() => expect(getByTestId("status").textContent).toBe("reviewing"));
    expect(getByTestId("loading").textContent).toBe("true");
  });

  it("stops loading when the API reports a terminal run status", async () => {
    server.use(
      http.get(`${API_BASE_URL}/api/v1/runs/run-1`, () => HttpResponse.json(fixtureRun("succeeded"))),
    );

    const { getByTestId } = render(<PollerProbe runId="run-1" />);

    await waitFor(() => expect(getByTestId("status").textContent).toBe("succeeded"));
    expect(getByTestId("loading").textContent).toBe("false");
  });

  it("keeps polling beyond the old four-minute budget without marking the run failed", async () => {
    vi.useFakeTimers();
    server.use(
      http.get(`${API_BASE_URL}/api/v1/runs/run-1`, () => HttpResponse.json(fixtureRun("running"))),
    );

    const { getByTestId } = render(<PollerProbe runId="run-1" />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(getByTestId("status").textContent).toBe("running");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(902_000);
    });

    expect(getByTestId("status").textContent).toBe("running");
    expect(getByTestId("loading").textContent).toBe("true");
    expect(getByTestId("error").textContent).toBe("仍在生成，可稍后到历史记录查看");
  });
});
