import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
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
      <span data-testid="error-kind">{result.errorKind ?? ""}</span>
      <span data-testid="prompt">{result.prompt ?? ""}</span>
      <span data-testid="created-at">{result.createdAt ?? ""}</span>
      <button type="button" data-testid="retry" onClick={result.retry}>
        retry
      </button>
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

  it("recovers from a single transient poll failure without surfacing an error", async () => {
    vi.useFakeTimers();
    let calls = 0;
    server.use(
      http.get(`${API_BASE_URL}/api/v1/runs/run-1`, () => {
        calls += 1;
        if (calls === 1) return HttpResponse.error();
        return HttpResponse.json(fixtureRun("running"));
      }),
    );

    const { getByTestId } = render(<PollerProbe runId="run-1" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(calls).toBeGreaterThan(1);
    expect(getByTestId("status").textContent).toBe("running");
    expect(getByTestId("error").textContent).toBe("");
    expect(getByTestId("error-kind").textContent).toBe("");
  });

  it("declares a network failure only after consecutive poll failures", async () => {
    vi.useFakeTimers();
    server.use(
      http.get(`${API_BASE_URL}/api/v1/runs/run-1`, () => HttpResponse.error()),
    );

    const { getByTestId } = render(<PollerProbe runId="run-1" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(getByTestId("status").textContent).toBe("failed");
    expect(getByTestId("error-kind").textContent).toBe("network");
    expect(getByTestId("error").textContent).toBe(
      "连接服务器失败，请检查网络后重试",
    );
    expect(getByTestId("loading").textContent).toBe("false");
  });

  it("marks backend-reported failures as run_failed and exposes the prompt", async () => {
    server.use(
      http.get(`${API_BASE_URL}/api/v1/runs/run-1`, () =>
        HttpResponse.json(fixtureRun("failed")),
      ),
    );

    const { getByTestId } = render(<PollerProbe runId="run-1" />);

    await waitFor(() => expect(getByTestId("status").textContent).toBe("failed"));
    expect(getByTestId("error-kind").textContent).toBe("run_failed");
    expect(getByTestId("error").textContent).toBe("生成失败");
    expect(getByTestId("prompt").textContent).toBe("讲解二分查找");
    expect(getByTestId("created-at").textContent).toBe(
      "2026-06-02T00:00:00.000Z",
    );
  });

  it("restarts polling after retry() and recovers", async () => {
    vi.useFakeTimers();
    let healthy = false;
    server.use(
      http.get(`${API_BASE_URL}/api/v1/runs/run-1`, () => {
        if (!healthy) return HttpResponse.error();
        return HttpResponse.json(fixtureRun("running"));
      }),
    );

    const { getByTestId } = render(<PollerProbe runId="run-1" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(getByTestId("error-kind").textContent).toBe("network");

    healthy = true;
    fireEvent.click(getByTestId("retry"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });

    expect(getByTestId("status").textContent).toBe("running");
    expect(getByTestId("error").textContent).toBe("");
    expect(getByTestId("loading").textContent).toBe("true");
  });
});
