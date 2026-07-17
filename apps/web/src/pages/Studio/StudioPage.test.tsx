import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";

import { TWEAK_DEFAULTS } from "../../features/studio-editor/hooks/useTweaks";
import type { PlaybookScript } from "../../features/playbook/engine/types";
import type {
  InteractionEvent,
  InteractionFollowUpContext,
} from "../../features/playbook/interaction/types";
import { server } from "../../mocks/server";
import { API_BASE_URL } from "../../shared/config/constants";
import { StudioPage } from "./StudioPage";

const mockUsePipelinePoller = vi.hoisted(() => vi.fn());
const mockCreateAssetAttributionReportForScript = vi.hoisted(() => vi.fn());

vi.mock("../../features/pipeline/hooks/usePipelinePoller", () => ({
  usePipelinePoller: mockUsePipelinePoller,
}));

vi.mock("../../features/playbook/engine/assets/assetAttributionSummary", async () => {
  const actual = await vi.importActual<typeof import("../../features/playbook/engine/assets/assetAttributionSummary")>(
    "../../features/playbook/engine/assets/assetAttributionSummary",
  );
  return {
    ...actual,
    createAssetAttributionReportForScript: mockCreateAssetAttributionReportForScript,
  };
});

vi.mock("../../features/playbook/engine/player/PlaybookPlayer", async () => {
  const ReactModule = await import("react");
  return {
    PlaybookPlayer: ({
      script,
      followupSlot,
      relatedSlot,
      topbarCollapsed = false,
      onToggleTopbar,
      onOpenExport,
      onExplainInteraction,
      onApplyInteractionVersion,
      interactionActionPending = false,
      interactionSessionKey,
      enableInteractionSandbox = false,
    }: {
      script: PlaybookScript;
      followupSlot?: React.ReactNode;
      relatedSlot?: React.ReactNode;
      topbarCollapsed?: boolean;
      onToggleTopbar?: () => void;
      onOpenExport?: () => void;
      onExplainInteraction?: (context: InteractionFollowUpContext) => Promise<void>;
      onApplyInteractionVersion?: (events: InteractionEvent[]) => Promise<void>;
      interactionActionPending?: boolean;
      interactionSessionKey?: string;
      enableInteractionSandbox?: boolean;
    }) =>
      ReactModule.createElement(
        "div",
        {
          "data-testid": "mock-player",
          "data-interaction-sandbox": String(enableInteractionSandbox),
          "data-interaction-pending": String(interactionActionPending),
          "data-interaction-session-key": interactionSessionKey,
        },
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
        onOpenExport
          ? ReactModule.createElement(
              "button",
              { type: "button", onClick: onOpenExport },
              "导出",
            )
          : null,
        onExplainInteraction
          ? ReactModule.createElement(
              "button",
              {
                type: "button",
                onClick: () => void onExplainInteraction({
                  manifest_version: "1",
                  events: [{
                    adapter_id: "math.derivative-tangent",
                    step_id: "step_01",
                    target_id: "step:step_01:marker-x",
                    action: "set-value",
                    value: 3,
                    sequence: 1,
                  }],
                }),
              },
              "模拟解释我的操作",
            )
          : null,
        onApplyInteractionVersion
          ? ReactModule.createElement(
              "button",
              {
                type: "button",
                disabled: interactionActionPending,
                onClick: () => void onApplyInteractionVersion([{
                  adapter_id: "math.derivative-tangent",
                  step_id: "step_01",
                  target_id: "step:step_01:marker-x",
                  action: "set-value",
                  value: 3,
                  sequence: 1,
                }]).catch(() => undefined),
              },
              "模拟应用到新版本",
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
    sessionStorage.clear();
    localStorage.clear();
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

    const { getByRole, getByTestId, rerender } = render(
      <StudioPage
        runId="run-1"
        t={TWEAK_DEFAULTS}
        onNavigate={vi.fn()}
        isProviderConfigured
        topbarCollapsed={false}
        onToggleTopbar={onToggleTopbar}
      />,
    );

    expect(getByTestId("mock-player").getAttribute("data-interaction-sandbox"))
      .toBe("true");

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

    const { findByPlaceholderText, getByRole, getByText } = render(
      <StudioPage
        runId="run-1"
        t={TWEAK_DEFAULTS}
        onNavigate={onNavigate}
        isProviderConfigured
      />,
    );

    const input = await findByPlaceholderText("还有什么想问的");
    fireEvent.change(input, { target: { value: "这里为什么这样讲？" } });
    fireEvent.click(getByRole("button", { name: /发送/ }));

    await waitFor(() => {
      expect(getByText("这里是因为当前步骤只需要解释概念。")).toBeTruthy();
    });
    expect(getByText("Original lesson")).toBeTruthy();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("keeps history-dependent actions visibly disabled until the initial history is ready", async () => {
    mockUsePipelinePoller.mockReturnValue({
      playbook: playbook("Loading lesson"),
      director: null,
      error: null,
      isLoading: false,
      status: "succeeded",
    });
    let releaseHistory: (() => void) | undefined;
    const historyGate = new Promise<void>((resolve) => {
      releaseHistory = resolve;
    });
    server.use(
      http.get(`${API_BASE_URL}/api/v1/runs/run-1/follow-ups`, async () => {
        await historyGate;
        return HttpResponse.json({ followups: [], versions: [] });
      }),
    );

    const view = render(
      <StudioPage
        runId="run-1"
        t={TWEAK_DEFAULTS}
        onNavigate={vi.fn()}
        isProviderConfigured
      />,
    );

    expect(view.getByText("正在加载对话与版本记录…")).toBeTruthy();
    expect(view.getByPlaceholderText<HTMLTextAreaElement>("正在加载记录").disabled).toBe(true);
    expect(view.queryByRole("button", { name: "模拟解释我的操作" })).toBeNull();
    expect(view.queryByRole("button", { name: "模拟应用到新版本" })).toBeNull();

    releaseHistory?.();
    await waitFor(() => {
      expect(view.getByPlaceholderText<HTMLTextAreaElement>("还有什么想问的").disabled)
        .toBe(false);
    });
    expect(view.getByRole("button", { name: "模拟解释我的操作" })).toBeTruthy();
    expect(view.getByRole("button", { name: "模拟应用到新版本" })).toBeTruthy();
  });

  it("sends semantic interaction context only after the explicit explain action", async () => {
    mockUsePipelinePoller.mockReturnValue({
      playbook: playbook("Explicit lesson"),
      director: null,
      error: null,
      isLoading: false,
      status: "succeeded",
    });
    let listCalls = 0;
    let postCalls = 0;
    let submittedBody: Record<string, unknown> | null = null;
    server.use(
      http.get(`${API_BASE_URL}/api/v1/runs/run-1/follow-ups`, () => {
        listCalls += 1;
        return HttpResponse.json({ followups: [], versions: [] });
      }),
      http.post(`${API_BASE_URL}/api/v1/runs/run-1/follow-up`, async ({ request }) => {
        postCalls += 1;
        submittedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          kind: "reply",
          reply: "你把切点移到了 x=3，因此切线斜率会随局部导数变化。",
          change_summary: "explain: interaction context",
          version_id: null,
          playbook: null,
          director: null,
        });
      }),
    );

    const view = render(
      <StudioPage
        runId="run-1"
        t={TWEAK_DEFAULTS}
        onNavigate={vi.fn()}
        isProviderConfigured
      />,
    );

    await waitFor(() => expect(listCalls).toBe(1));
    expect(postCalls).toBe(0);

    fireEvent.click(view.getByRole("button", { name: "模拟解释我的操作" }));

    await waitFor(() => {
      expect(view.getByText(/你把切点移到了 x=3/)).toBeTruthy();
    });
    expect(postCalls).toBe(1);
    expect(submittedBody).toMatchObject({
      message: "请解释我刚才的操作",
      intent: "explain_interaction",
      interaction_context: {
        manifest_version: "1",
        events: [{
          adapter_id: "math.derivative-tangent",
          step_id: "step_01",
          target_id: "step:step_01:marker-x",
          action: "set-value",
          value: 3,
          sequence: 1,
        }],
      },
    });
    expect(view.getByText("Explicit lesson")).toBeTruthy();
  });

  it("applies sandbox events as a new version only after the explicit action", async () => {
    mockUsePipelinePoller.mockReturnValue({
      playbook: playbook("Original lesson"),
      director: null,
      error: null,
      isLoading: false,
      status: "succeeded",
    });
    let listCalls = 0;
    let postCalls = 0;
    let submittedBody: Record<string, unknown> | null = null;
    server.use(
      http.get(`${API_BASE_URL}/api/v1/runs/run-1/follow-ups`, () => {
        listCalls += 1;
        return HttpResponse.json({
          followups: [],
          versions: listCalls === 1
            ? [
              version("older", "00000000", 0, false, "initial", "initial"),
              version("v1", "11111111", 1, true, "followup", "current"),
            ]
            : [
              version("v1", "11111111", 1, false, "followup", "current"),
              version("v2", "22222222", 2, true, "interaction", "move tangent"),
            ],
        });
      }),
      http.post(
        `${API_BASE_URL}/api/v1/runs/run-1/interaction-version`,
        async ({ request }) => {
          postCalls += 1;
          submittedBody = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({
            version_id: "v2",
            summary: "interaction: move tangent",
            playbook: playbook("Applied lesson"),
            director: null,
          });
        },
      ),
    );

    const view = render(
      <StudioPage
        runId="run-1"
        t={TWEAK_DEFAULTS}
        onNavigate={vi.fn()}
        isProviderConfigured
      />,
    );

    await waitFor(() => expect(listCalls).toBe(1));
    expect(postCalls).toBe(0);
    const initialSessionKey = view.getByTestId("mock-player")
      .getAttribute("data-interaction-session-key");
    fireEvent.click(view.getByRole("button", { name: "模拟应用到新版本" }));

    await waitFor(() => expect(view.getByText("Applied lesson")).toBeTruthy());
    expect(postCalls).toBe(1);
    expect(submittedBody).toEqual({
      manifest_version: "1",
      base_version_id: "v1",
      events: [{
        adapter_id: "math.derivative-tangent",
        step_id: "step_01",
        target_id: "step:step_01:marker-x",
        action: "set-value",
        value: 3,
        sequence: 1,
      }],
    });
    expect(view.getByText(/已将沙盒操作应用为新版本（v2）/)).toBeTruthy();
    expect(view.getByText("interaction: move tangent")).toBeTruthy();
    await waitFor(() => expect(listCalls).toBe(2));
  });

  it("uses a null base version for the first interaction version of a fresh run", async () => {
    mockUsePipelinePoller.mockReturnValue({
      playbook: playbook("Fresh lesson"),
      director: null,
      error: null,
      isLoading: false,
      status: "succeeded",
    });
    let listCalls = 0;
    let submittedBody: Record<string, unknown> | null = null;
    server.use(
      http.get(`${API_BASE_URL}/api/v1/runs/run-1/follow-ups`, () => {
        listCalls += 1;
        return HttpResponse.json({
          followups: [],
          versions: listCalls === 1
            ? []
            : [version("v1", "11111111", 1, true, "interaction", "first interaction")],
        });
      }),
      http.post(
        `${API_BASE_URL}/api/v1/runs/run-1/interaction-version`,
        async ({ request }) => {
          submittedBody = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({
            version_id: "v1",
            summary: "first interaction",
            playbook: playbook("Fresh applied lesson"),
            director: null,
          });
        },
      ),
    );

    const view = render(
      <StudioPage
        runId="run-1"
        t={TWEAK_DEFAULTS}
        onNavigate={vi.fn()}
        isProviderConfigured
      />,
    );

    await waitFor(() => expect(listCalls).toBe(1));
    fireEvent.click(view.getByRole("button", { name: "模拟应用到新版本" }));

    await waitFor(() => expect(view.getByText("Fresh applied lesson")).toBeTruthy());
    expect(submittedBody).toMatchObject({
      manifest_version: "1",
      base_version_id: null,
    });
    await waitFor(() => expect(listCalls).toBe(2));
  });

  it("refreshes the current head without resetting sandbox state after a stale-base conflict", async () => {
    mockUsePipelinePoller.mockReturnValue({
      playbook: playbook("Original lesson"),
      director: null,
      error: null,
      isLoading: false,
      status: "succeeded",
    });
    let listCalls = 0;
    let postCalls = 0;
    server.use(
      http.get(`${API_BASE_URL}/api/v1/runs/run-1/follow-ups`, () => {
        listCalls += 1;
        return HttpResponse.json({
          followups: [],
          versions: [
            version(
              listCalls === 1 ? "v1" : "v2",
              listCalls === 1 ? "11111111" : "22222222",
              listCalls,
              true,
              "followup",
              listCalls === 1 ? "current" : "concurrent update",
            ),
          ],
        });
      }),
      http.post(`${API_BASE_URL}/api/v1/runs/run-1/interaction-version`, () => {
        postCalls += 1;
        return HttpResponse.json(
          { detail: "Interaction sandbox base version is no longer current" },
          { status: 409 },
        );
      }),
    );

    const view = render(
      <StudioPage
        runId="run-1"
        t={TWEAK_DEFAULTS}
        onNavigate={vi.fn()}
        isProviderConfigured
      />,
    );

    await waitFor(() => expect(listCalls).toBe(1));
    expect(postCalls).toBe(0);
    fireEvent.click(view.getByRole("button", { name: "模拟应用到新版本" }));

    await waitFor(() => {
      expect(view.getByText(/Interaction sandbox base version is no longer current/))
        .toBeTruthy();
    });
    expect(postCalls).toBe(1);
    expect(view.getByText("Original lesson")).toBeTruthy();
    expect(view.getByTestId("mock-player").getAttribute("data-interaction-session-key"))
      .toBe(initialSessionKey);
    expect(view.queryByText(/已将沙盒操作应用为新版本/)).toBeNull();
    expect(listCalls).toBe(2);
    expect(view.getByRole("button", { name: "模拟应用到新版本" })).toBeTruthy();
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

  it("passes the active playbook's asset attribution report into export submission", async () => {
    mockUsePipelinePoller.mockReturnValue({
      playbook: playbook("Asset report lesson"),
      director: null,
      error: null,
      isLoading: false,
      status: "succeeded",
    });
    mockCreateAssetAttributionReportForScript.mockReturnValue({
      generated_by: "visual_quality_gate",
      entries: [
        {
          asset_id: "cc-by-diagram",
          pack_id: "physics-basic",
          license: "cc-by-4.0",
          commercial_use_status: "allowed-with-attribution",
          attribution: "Example Creator",
          source_url: "https://example.test/asset",
          license_url: "https://creativecommons.org/licenses/by/4.0/",
          requires_attribution: true,
          commercial_use_restricted: false,
          share_alike: false,
          unknown_license: false,
          warning_codes: ["asset_requires_attribution"],
          step_ids: ["step_01"],
        },
      ],
      attribution_required: ["physics-basic/cc-by-diagram"],
      license_risk: [],
      commercial_export: {
        allowed: true,
        blockers: [],
        review_required: [],
        attribution_required: ["physics-basic/cc-by-diagram"],
      },
    });
    let submittedBody: Record<string, unknown> | null = null;
    server.use(
      http.get(`${API_BASE_URL}/api/v1/runs/run-1/follow-ups`, () =>
        HttpResponse.json({ followups: [], versions: [] }),
      ),
      http.post(`${API_BASE_URL}/api/v1/exports`, async ({ request }) => {
        submittedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          job_id: "j1",
          run_id: "run-1",
          status: "queued",
          progress: 0,
          message: null,
          output_url: null,
          asset_report_url: null,
          error: null,
          with_audio: false,
          created_at: "now",
        });
      }),
      http.get(`${API_BASE_URL}/api/v1/exports/j1`, () =>
        HttpResponse.json({
          job_id: "j1",
          run_id: "run-1",
          status: "rendering",
          progress: 0.5,
          message: null,
          output_url: null,
          asset_report_url: null,
          error: null,
          with_audio: false,
          created_at: "now",
        }),
      ),
    );

    const { getByRole, getByText } = render(
      <StudioPage
        runId="run-1"
        t={TWEAK_DEFAULTS}
        onNavigate={vi.fn()}
        isProviderConfigured
      />,
    );

    fireEvent.click(getByRole("button", { name: "导出" }));
    await waitFor(() => {
      expect(getByText("开始导出")).toBeTruthy();
    });
    fireEvent.click(getByText("开始导出"));

    await waitFor(() => expect(submittedBody).not.toBeNull());
    expect(submittedBody).toMatchObject({
      run_id: "run-1",
      asset_report: {
        generated_by: "visual_quality_gate",
        attribution_required: ["physics-basic/cc-by-diagram"],
      },
    });
  });

  it("collapses the empty follow-up panel when self provider is not configured", async () => {
    mockUsePipelinePoller.mockReturnValue({
      playbook: playbook("Provider setup lesson"),
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
    const onOpenProviderSettings = vi.fn();

    const { getByRole, queryByPlaceholderText, queryByRole, queryByText } = render(
      <StudioPage
        runId="run-1"
        t={TWEAK_DEFAULTS}
        onNavigate={vi.fn()}
        isProviderConfigured={false}
        appEdition="self"
        onOpenProviderSettings={onOpenProviderSettings}
      />,
    );

    await waitFor(() => {
      expect(getByRole("button", { name: "配置本地 Provider" })).toBeTruthy();
    });
    expect(queryByPlaceholderText("还有什么想问的")).toBeNull();
    expect(queryByRole("button", { name: "你能指出关键量吗？" })).toBeNull();
    expect(queryByText("未配置本地 Provider 时将使用服务器模型。")).toBeNull();

    fireEvent.click(getByRole("button", { name: "配置本地 Provider" }));
    expect(onOpenProviderSettings).toHaveBeenCalledTimes(1);
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

  it("ignores an in-flight restore after switching to another run", async () => {
    mockUsePipelinePoller.mockReturnValue({
      playbook: playbook("Run one"),
      director: null,
      error: null,
      isLoading: false,
      status: "succeeded",
    });
    let restoreCalls = 0;
    let releaseRestore: (() => void) | undefined;
    const restoreGate = new Promise<void>((resolve) => {
      releaseRestore = resolve;
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
      http.get(`${API_BASE_URL}/api/v1/runs/run-2/follow-ups`, () =>
        HttpResponse.json({ followups: [], versions: [] }),
      ),
      http.post(`${API_BASE_URL}/api/v1/runs/run-1/versions/v0/restore`, async () => {
        restoreCalls += 1;
        await restoreGate;
        return HttpResponse.json({
          version_id: "v0",
          playbook: playbook("Stale restored lesson"),
          director: null,
        });
      }),
    );

    const props = {
      t: TWEAK_DEFAULTS,
      onNavigate: vi.fn(),
      isProviderConfigured: true,
    };
    const view = render(<StudioPage runId="run-1" {...props} />);

    await waitFor(() => {
      expect(view.getByRole("button", { name: "展开版本记录" })).toBeTruthy();
    });
    fireEvent.click(view.getByRole("button", { name: "展开版本记录" }));
    fireEvent.click(view.getByRole("button", { name: "恢复版本 a1b2c3d4" }));
    await waitFor(() => expect(restoreCalls).toBe(1));

    mockUsePipelinePoller.mockReturnValue({
      playbook: playbook("Run two"),
      director: null,
      error: null,
      isLoading: false,
      status: "succeeded",
    });
    view.rerender(<StudioPage runId="run-2" {...props} />);
    releaseRestore?.();

    await waitFor(() => expect(view.getByText("Run two")).toBeTruthy());
    expect(view.queryByText("Stale restored lesson")).toBeNull();
    expect(view.queryByText("已切换到选中的历史版本。")).toBeNull();
    await waitFor(() => {
      expect(view.getByRole("button", { name: "模拟应用到新版本" })).toBeTruthy();
    });
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

  it("renders a retryable error card on network failure instead of bouncing to intake", () => {
    const onNavigate = vi.fn();
    const retry = vi.fn();
    mockUsePipelinePoller.mockReturnValue({
      playbook: null,
      director: null,
      error: "连接服务器失败，请检查网络后重试",
      errorKind: "network",
      prompt: null,
      createdAt: null,
      isLoading: false,
      status: "failed",
      retry,
    });

    const { getByRole, getByText } = render(
      <StudioPage
        runId="run-1"
        t={TWEAK_DEFAULTS}
        onNavigate={onNavigate}
        isProviderConfigured
      />,
    );

    expect(onNavigate).not.toHaveBeenCalled();
    expect(getByText("连接服务器失败，请检查网络后重试")).toBeTruthy();
    fireEvent.click(getByRole("button", { name: "重试" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("offers resubmit and edit actions when the backend reports the run failed", () => {
    const onNavigate = vi.fn();
    const onResubmitPrompt = vi.fn();
    const onEditPrompt = vi.fn();
    mockUsePipelinePoller.mockReturnValue({
      playbook: null,
      director: null,
      error: "生成失败：脚本校验未通过",
      errorKind: "run_failed",
      prompt: "讲解二分查找",
      createdAt: "2026-06-02T00:00:00.000Z",
      isLoading: false,
      status: "failed",
      retry: vi.fn(),
    });

    const { getByRole, getByText } = render(
      <StudioPage
        runId="run-1"
        t={TWEAK_DEFAULTS}
        onNavigate={onNavigate}
        isProviderConfigured
        onResubmitPrompt={onResubmitPrompt}
        onEditPrompt={onEditPrompt}
      />,
    );

    expect(getByText("生成失败：脚本校验未通过")).toBeTruthy();
    fireEvent.click(getByRole("button", { name: "重新生成" }));
    expect(onResubmitPrompt).toHaveBeenCalledWith("讲解二分查找");
    fireEvent.click(getByRole("button", { name: "返回修改题目" }));
    expect(onEditPrompt).toHaveBeenCalledWith("讲解二分查找");
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("falls back to intake navigation when no edit handler is provided", () => {
    const onNavigate = vi.fn();
    mockUsePipelinePoller.mockReturnValue({
      playbook: null,
      director: null,
      error: "生成失败，请返回重试",
      errorKind: "run_failed",
      prompt: null,
      createdAt: null,
      isLoading: false,
      status: "failed",
      retry: vi.fn(),
    });

    const { getByRole, queryByRole } = render(
      <StudioPage
        runId="run-1"
        t={TWEAK_DEFAULTS}
        onNavigate={onNavigate}
        isProviderConfigured
      />,
    );

    expect(queryByRole("button", { name: "重新生成" })).toBeNull();
    fireEvent.click(getByRole("button", { name: "返回修改题目" }));
    expect(onNavigate).toHaveBeenCalledWith("intake");
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
