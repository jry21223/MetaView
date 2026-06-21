import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";

import { TWEAK_DEFAULTS } from "../../features/studio-editor/hooks/useTweaks";
import type { PlaybookScript } from "../../features/playbook/engine/types";
import { server } from "../../mocks/server";
import { API_BASE_URL } from "../../shared/config/constants";
import { StudioPage } from "./StudioPage";

const mockUsePipelinePoller = vi.hoisted(() => vi.fn());

vi.mock("../../features/pipeline/hooks/usePipelinePoller", () => ({
  usePipelinePoller: mockUsePipelinePoller,
}));

vi.mock("../../features/playbook/engine/player/PlaybookPlayer", async () => {
  const ReactModule = await import("react");
  return {
    PlaybookPlayer: ({
      script,
      followupSlot,
      relatedSlot,
      topbarCollapsed = false,
      onToggleTopbar,
    }: {
      script: PlaybookScript;
      followupSlot?: React.ReactNode;
      relatedSlot?: React.ReactNode;
      topbarCollapsed?: boolean;
      onToggleTopbar?: () => void;
    }) =>
      ReactModule.createElement(
        "div",
        { "data-testid": "mock-player" },
        onToggleTopbar
          ? ReactModule.createElement(
              "button",
              {
                type: "button",
                onClick: onToggleTopbar,
                "aria-pressed": topbarCollapsed,
              },
              topbarCollapsed ? "显示顶部栏" : "隐藏顶部栏",
            )
          : null,
        ReactModule.createElement("strong", null, script.title),
        followupSlot,
        relatedSlot,
      ),
  };
});

describe("StudioPage", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("navigates to intake when starting from an empty workbench", () => {
    const onNavigate = vi.fn();
    mockUsePipelinePoller.mockReturnValue({
      playbook: null,
      director: null,
      error: null,
      isLoading: false,
      status: null,
    });

    const { getByRole, getByText } = render(
      <StudioPage
        runId={null}
        t={TWEAK_DEFAULTS}
        onNavigate={onNavigate}
        isProviderConfigured
      />,
    );

    expect(getByText("暂无任务")).toBeTruthy();
    fireEvent.click(getByRole("button", { name: "先提交一个题目" }));
    expect(onNavigate).toHaveBeenCalledWith("intake");
  });

  it("passes shell topbar state to the player rail control", () => {
    mockUsePipelinePoller.mockReturnValue({
      playbook: playbook("Topbar lesson"),
      director: null,
      error: null,
      isLoading: false,
      status: "succeeded",
    });
    const onToggleTopbar = vi.fn();

    const { getByRole, rerender } = render(
      <StudioPage
        runId="run-1"
        t={TWEAK_DEFAULTS}
        onNavigate={vi.fn()}
        isProviderConfigured
        topbarCollapsed={false}
        onToggleTopbar={onToggleTopbar}
      />,
    );

    fireEvent.click(getByRole("button", { name: "隐藏顶部栏" }));
    expect(onToggleTopbar).toHaveBeenCalledTimes(1);

    rerender(
      <StudioPage
        runId="run-1"
        t={TWEAK_DEFAULTS}
        onNavigate={vi.fn()}
        isProviderConfigured
        topbarCollapsed
        onToggleTopbar={onToggleTopbar}
      />,
    );
    expect(getByRole("button", { name: "显示顶部栏" })).toBeTruthy();
  });

  it("renders text-only follow-up replies without replacing the active playbook", async () => {
    const onNavigate = vi.fn();
    mockUsePipelinePoller.mockReturnValue({
      playbook: playbook("Original lesson"),
      director: null,
      error: null,
      isLoading: false,
      status: "succeeded",
    });
    server.use(
      http.get(`${API_BASE_URL}/api/v1/runs/run-1/follow-ups`, () =>
        HttpResponse.json({ followups: [], versions: [] }),
      ),
      http.post(`${API_BASE_URL}/api/v1/runs/run-1/follow-up`, () =>
        HttpResponse.json({
          kind: "reply",
          reply: "这里是因为当前步骤只需要解释概念。",
          change_summary: "answer: explain current step",
          version_id: null,
          playbook: null,
          director: null,
        }),
      ),
    );

    const { getByPlaceholderText, getByRole, getByText } = render(
      <StudioPage
        runId="run-1"
        t={TWEAK_DEFAULTS}
        onNavigate={onNavigate}
        isProviderConfigured
      />,
    );

    const input = getByPlaceholderText("还有什么想问的");
    fireEvent.change(input, { target: { value: "这里为什么这样讲？" } });
    fireEvent.click(getByRole("button", { name: /发送/ }));

    await waitFor(() => {
      expect(getByText("这里是因为当前步骤只需要解释概念。")).toBeTruthy();
    });
    expect(getByText("Original lesson")).toBeTruthy();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("uses guided follow-up suggestions for study sessions", async () => {
    mockUsePipelinePoller.mockReturnValue({
      playbook: playbook("Guided lesson"),
      director: null,
      error: null,
      isLoading: false,
      status: "succeeded",
    });
    server.use(
      http.get(`${API_BASE_URL}/api/v1/runs/run-1/follow-ups`, () =>
        HttpResponse.json({ followups: [], versions: [] }),
      ),
    );

    const { getByRole, queryByRole } = render(
      <StudioPage
        runId="run-1"
        t={TWEAK_DEFAULTS}
        onNavigate={vi.fn()}
        isProviderConfigured
      />,
    );

    expect(getByRole("button", { name: "你能指出关键量吗？" })).toBeTruthy();
    expect(queryByRole("button", { name: "改变初始条件" })).toBeNull();
  });

  it("checks out a historical version without rendering a revert change record", async () => {
    mockUsePipelinePoller.mockReturnValue({
      playbook: playbook("Updated lesson"),
      director: null,
      error: null,
      isLoading: false,
      status: "succeeded",
    });
    server.use(
      http.get(`${API_BASE_URL}/api/v1/runs/run-1/follow-ups`, () =>
        HttpResponse.json({
          followups: [],
          versions: [
            version("v0", "a1b2c3d4", 0, false, "initial", "initial playbook"),
            version("v1", "c0ffee12", 1, true, "followup", "updated lesson"),
          ],
        }),
      ),
      http.post(`${API_BASE_URL}/api/v1/runs/run-1/versions/v0/restore`, () =>
        HttpResponse.json({
          version_id: "v0",
          playbook: playbook("Original lesson"),
          director: null,
        }),
      ),
    );

    const { getByRole, getByText, queryByText } = render(
      <StudioPage
        runId="run-1"
        t={TWEAK_DEFAULTS}
        onNavigate={vi.fn()}
        isProviderConfigured
      />,
    );

    await waitFor(() => {
      expect(getByRole("button", { name: "展开版本记录" })).toBeTruthy();
    });
    fireEvent.click(getByRole("button", { name: "展开版本记录" }));
    fireEvent.click(getByRole("button", { name: "恢复版本 a1b2c3d4" }));

    await waitFor(() => {
      expect(getByText("Original lesson")).toBeTruthy();
    });
    expect(getByText("已切换到选中的历史版本。")).toBeTruthy();
    expect(queryByText(/^revert: restore/)).toBeNull();
  });

  it("shows a visible commit-log error when restoring a historical version fails", async () => {
    mockUsePipelinePoller.mockReturnValue({
      playbook: playbook("Updated lesson"),
      director: null,
      error: null,
      isLoading: false,
      status: "succeeded",
    });
    server.use(
      http.get(`${API_BASE_URL}/api/v1/runs/run-1/follow-ups`, () =>
        HttpResponse.json({
          followups: [],
          versions: [
            version("v0", "a1b2c3d4", 0, false, "initial", "initial playbook"),
            version("v1", "c0ffee12", 1, true, "followup", "updated lesson"),
          ],
        }),
      ),
      http.post(`${API_BASE_URL}/api/v1/runs/run-1/versions/v0/restore`, () =>
        HttpResponse.json({ detail: "版本不存在" }, { status: 404 }),
      ),
    );

    const { getByRole, findByRole } = render(
      <StudioPage
        runId="run-1"
        t={TWEAK_DEFAULTS}
        onNavigate={vi.fn()}
        isProviderConfigured
      />,
    );

    await waitFor(() => {
      expect(getByRole("button", { name: "展开版本记录" })).toBeTruthy();
    });
    fireEvent.click(getByRole("button", { name: "展开版本记录" }));
    fireEvent.click(getByRole("button", { name: "恢复版本 a1b2c3d4" }));

    const alert = await findByRole("alert");
    expect(alert.textContent ?? "").toMatch(/版本不存在|恢复版本失败/);
  });
});

function playbook(title: string): PlaybookScript {
  return {
    schema_version: "1.0.0",
    fps: 30,
    total_frames: 60,
    domain: "math",
    title,
    summary: `${title} summary`,
    parameter_controls: [],
    steps: [
      {
        step_id: "step_01",
        end_frame: 60,
        title: "Step 1",
        voiceover_text: "Narration",
        snapshot: {
          kind: "math_formula",
          formula_latex: "x^2",
        },
        tokens: [],
      },
    ],
  };
}

function version(
  version_id: string,
  short_id: string,
  version_number: number,
  is_head: boolean,
  source: string,
  summary: string,
) {
  return {
    version_id,
    short_id,
    run_id: "run-1",
    version_number,
    parent_version_id: version_number > 0 ? "v0" : null,
    source,
    summary,
    followup_id: source === "followup" ? "f1" : null,
    created_at: `2026-06-01T00:0${version_number}:00Z`,
    is_head,
  };
}
