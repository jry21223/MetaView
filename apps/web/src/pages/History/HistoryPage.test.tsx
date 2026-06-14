import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import React from "react";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";

import { server } from "../../mocks/server";
import { API_BASE_URL } from "../../shared/config/constants";
import { TWEAK_DEFAULTS } from "../../features/studio-editor/hooks/useTweaks";
import type { PipelineRunResult } from "../../entities/pipeline/types";
import type { PlaybookScript } from "../../entities/playbook/types";
import { HistoryPage } from "./HistoryPage";

vi.mock("@remotion/player", async () => {
  const ReactModule = await import("react");
  return {
    Player: ReactModule.forwardRef(function MockPlayer(
      _props: unknown,
      ref: React.ForwardedRef<unknown>,
    ) {
      ReactModule.useImperativeHandle(ref, () => ({
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        pause: vi.fn(),
        play: vi.fn(),
        seekTo: vi.fn(),
      }));
      return ReactModule.createElement("div", { "data-testid": "mock-remotion-player" });
    }),
  };
});

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

const succeededRun: PipelineRunResult = {
  run_id: "run-ok",
  status: "succeeded",
  prompt: "归并排序",
  playbook: historyPlaybook(),
  director: null,
  error: null,
  created_at: "2026-06-01T08:00:00.000Z",
  review: null,
};

function renderHistoryPage(overrides: Partial<React.ComponentProps<typeof HistoryPage>> = {}) {
  const props: React.ComponentProps<typeof HistoryPage> = {
    t: TWEAK_DEFAULTS,
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

  it("renders history playback without params, code sync, follow-up, or related panels", async () => {
    fixtureRuns([succeededRun]);

    const { findByTestId, queryByLabelText, queryByText } = renderHistoryPage();

    await findByTestId("mock-remotion-player");
    expect(queryByLabelText("Learning console")).toBeNull();
    expect(queryByText("Params")).toBeNull();
    expect(queryByText("Code Sync")).toBeNull();
    expect(queryByText("Follow-up")).toBeNull();
    expect(queryByText("Related")).toBeNull();
  });
});

function historyPlaybook(): PlaybookScript {
  return {
    schema_version: "1.0.0",
    fps: 30,
    total_frames: 60,
    domain: "algorithm",
    algorithm_id: "bubble_sort",
    title: "归并排序历史回放",
    summary: "历史页只回放动画。",
    initial_data: {},
    parameter_controls: [],
    steps: [
      {
        step_id: "step_01",
        end_frame: 60,
        title: "初始数组",
        voiceover_text: "观察数组变化。",
        snapshot: {
          kind: "algorithm_array",
          array_values: ["3", "1", "2"],
          active_indices: [0],
          swap_indices: [],
          sorted_indices: [],
          pointers: {},
        },
        code_highlight: {
          language: "python",
          lines: ["for i in range(n):", "    pass"],
          active_line: 1,
          active_lines: [1],
          variables: {},
        },
        tokens: [],
      },
    ],
  };
}
