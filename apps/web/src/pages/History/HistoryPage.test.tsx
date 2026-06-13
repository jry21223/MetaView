import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import React from "react";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";

import { server } from "../../mocks/server";
import { API_BASE_URL } from "../../shared/config/constants";
import { TWEAK_DEFAULTS } from "../../features/studio-editor/hooks/useTweaks";
import type { PipelineRunResult } from "../../entities/pipeline/types";
import { HistoryPage } from "./HistoryPage";

const runsFixture: PipelineRunResult[] = [
  {
    run_id: "run-1",
    status: "running",
    prompt: "讲解格林公式",
    playbook: null,
    error: null,
    created_at: "2026-06-01T10:00:00.000Z",
    review: null,
  },
  {
    run_id: "run-2",
    status: "failed",
    prompt: "讲解二分查找",
    playbook: null,
    error: "生成失败",
    created_at: "2026-06-01T09:00:00.000Z",
    review: null,
  },
];

function renderHistoryPage(overrides: Partial<React.ComponentProps<typeof HistoryPage>> = {}) {
  const props: React.ComponentProps<typeof HistoryPage> = {
    t: TWEAK_DEFAULTS,
    setTweak: vi.fn(),
    onNavigate: vi.fn(),
    isProviderConfigured: true,
    onOpenInWorkbench: vi.fn(),
    ...overrides,
  };

  return {
    ...render(<HistoryPage {...props} />),
    props,
  };
}

function fixtureRuns(
  runs: PipelineRunResult[] = runsFixture,
  onDelete?: (runId: string) => Response | Promise<Response>,
) {
  let currentRuns = [...runs];
  let deleteHits = 0;
  server.use(
    http.get(`${API_BASE_URL}/api/v1/runs`, () => HttpResponse.json(currentRuns)),
    http.delete(`${API_BASE_URL}/api/v1/runs/:runId`, async ({ params }) => {
      deleteHits += 1;
      const runId = String(params.runId);
      if (onDelete) return onDelete(runId);
      currentRuns = currentRuns.filter((run) => run.run_id !== runId);
      return new Response(null, { status: 204 });
    }),
  );

  return {
    get deleteHits() {
      return deleteHits;
    },
  };
}

describe("HistoryPage actions", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("replaces compare/rerun actions with open-in-workbench and delete", async () => {
    fixtureRuns();

    const { queryByText, getAllByRole, getByText } = renderHistoryPage();

    await waitFor(() => expect(getByText("讲解格林公式")).toBeTruthy());
    expect(queryByText("对比")).toBeNull();
    expect(queryByText("⚡ 重跑")).toBeNull();
    expect(getAllByRole("button", { name: "在工作台打开" })).toHaveLength(2);
    expect(getAllByRole("button", { name: "删除历史记录" })).toHaveLength(2);
  });

  it("opens an existing history run in the workbench without rerunning", async () => {
    fixtureRuns();
    let submitHits = 0;
    server.use(
      http.post(`${API_BASE_URL}/api/v1/pipeline`, () => {
        submitHits += 1;
        return HttpResponse.json({ detail: "should not submit" }, { status: 500 });
      }),
    );
    const onOpenInWorkbench = vi.fn();
    const { getByText, getAllByRole } = renderHistoryPage({
      onOpenInWorkbench,
    });

    await waitFor(() => expect(getByText("讲解格林公式")).toBeTruthy());
    fireEvent.click(getAllByRole("button", { name: "在工作台打开" })[0]);

    expect(onOpenInWorkbench).toHaveBeenCalledWith("run-1");
    expect(submitHits).toBe(0);
  });

  it("does not delete when confirmation is cancelled", async () => {
    const api = fixtureRuns();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const { getByText, getAllByRole } = renderHistoryPage();

    await waitFor(() => expect(getByText("讲解格林公式")).toBeTruthy());
    fireEvent.click(getAllByRole("button", { name: "删除历史记录" })[0]);

    expect(api.deleteHits).toBe(0);
    expect(getByText("讲解格林公式")).toBeTruthy();
  });

  it("deletes confirmed history runs and refreshes the list", async () => {
    const api = fixtureRuns();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { getByText, getAllByRole, queryByText } = renderHistoryPage();

    await waitFor(() => expect(getByText("讲解格林公式")).toBeTruthy());
    fireEvent.click(getAllByRole("button", { name: "删除历史记录" })[0]);

    await waitFor(() => expect(api.deleteHits).toBe(1));
    await waitFor(() => expect(queryByText("讲解格林公式")).toBeNull());
    expect(getByText("讲解二分查找")).toBeTruthy();
  });

  it("keeps the run visible and shows an error when delete fails", async () => {
    fixtureRuns(runsFixture, () =>
      HttpResponse.json({ detail: "删除失败" }, { status: 500 }),
    );
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { getByText, getAllByRole } = renderHistoryPage();

    await waitFor(() => expect(getByText("讲解格林公式")).toBeTruthy());
    fireEvent.click(getAllByRole("button", { name: "删除历史记录" })[0]);

    await waitFor(() => expect(getByText("删除失败")).toBeTruthy());
    expect(getByText("讲解格林公式")).toBeTruthy();
  });

  it("shows a helpful load-error state instead of raw fetch text", async () => {
    let hits = 0;
    server.use(
      http.get(`${API_BASE_URL}/api/v1/runs`, () => {
        hits += 1;
        return HttpResponse.json({ detail: "Load failed" }, { status: 500 });
      }),
    );

    const { getByText, queryByText, getByRole } = renderHistoryPage();

    await waitFor(() => expect(getByText("无法加载历史记录")).toBeTruthy());
    expect(queryByText("Load failed")).toBeNull();

    fireEvent.click(getByRole("button", { name: "重试加载历史记录" }));
    await waitFor(() => expect(hits).toBeGreaterThan(1));
  });
});
