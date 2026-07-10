import React from "react";
import { cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PlaybookScript } from "../types";
import { PlaybookPlayer } from "./PlaybookPlayer";

vi.mock("@remotion/player", async () => {
  const React = await import("react");
  return {
    Player: React.forwardRef(function MockPlayer(
      props: { inputProps?: { showSubtitles?: boolean; showInlineCode?: boolean } },
      ref: React.ForwardedRef<unknown>,
    ) {
      React.useImperativeHandle(ref, () => ({
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        pause: vi.fn(),
        play: vi.fn(),
        seekTo: vi.fn(),
      }));
      return (
        <div
          data-testid="mock-remotion-player"
          data-show-subtitles={String(props.inputProps?.showSubtitles)}
          data-show-inline-code={String(props.inputProps?.showInlineCode)}
        />
      );
    }),
  };
});

vi.mock("./useTTS", async () => {
  const actual = await vi.importActual<typeof import("./useTTS")>("./useTTS");
  return {
    ...actual,
    useTTS: () => ({
      enabled: false,
      supported: true,
      speaking: false,
      config: { backend: "system", voice: actual.AUTO_VOICE, rate: 1 },
      setDomain: vi.fn(),
      toggle: vi.fn(),
      speak: vi.fn(),
      updateConfig: vi.fn(),
    }),
  };
});

function baseScript(overrides: Partial<PlaybookScript> = {}): PlaybookScript {
  return {
    fps: 30,
    total_frames: 90,
    domain: "math",
    title: "参数直线",
    summary: "观察参数如何改变图像。",
    parameter_controls: [],
    steps: [
      {
        step_id: "s1",
        end_frame: 45,
        title: "建立函数",
        voiceover_text: "先观察函数的基础形态。",
        snapshot: {
          kind: "math_formula",
          formula_latex: "y=ax+b",
        },
        tokens: [],
      },
      {
        step_id: "s2",
        end_frame: 90,
        title: "调整参数",
        voiceover_text: "改变参数后曲线随之移动。",
        snapshot: {
          kind: "math_formula",
          formula_latex: "y=2x+1",
        },
        tokens: [],
      },
    ],
    ...overrides,
  };
}

describe("PlaybookPlayer", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("places code sync and follow-up in the learning console for code-backed lessons", () => {
    const script = baseScript({
      domain: "algorithm",
      title: "Two Pointers",
      steps: [
        {
          ...baseScript().steps[0],
          snapshot: {
            kind: "algorithm_array",
            array_values: ["3", "1", "4"],
            active_indices: [1],
            swap_indices: [],
            sorted_indices: [],
            pointers: { left: 0, right: 2 },
          },
          code_highlight: {
            language: "python",
            lines: ["while left < right:", "    right -= 1"],
            active_line: 1,
            active_lines: [1],
            variables: { right: "2" },
            operation_label: "move right",
          },
        },
      ],
    });

    const { getByText, getByTestId } = render(
      <PlaybookPlayer
        script={script}
        theme="light"
        followupSlot={<div data-testid="followup-slot">Ask this step</div>}
      />,
    );

    expect(getByText("Code Sync")).toBeTruthy();
    expect(getByTestId("followup-slot")).toBeTruthy();
    expect(getByText("Ask this step")).toBeTruthy();
  });

  it("shows legacy call-stack code sync in the desktop learning console", () => {
    const script = baseScript({
      domain: "code",
      title: "Recursive factorial",
      steps: [
        {
          ...baseScript().steps[0],
          snapshot: {
            kind: "call_stack_scene",
            frames: [
              {
                id: "factorial-3",
                function_name: "factorial",
                arguments: { n: "3" },
                variables: { n: "3" },
                state: "active",
              },
            ],
            current_frame_id: "factorial-3",
            code_trace: {
              language: "python",
              lines: ["def factorial(n):", "    return n * factorial(n - 1)"],
              active_line: 1,
              active_lines: [1],
            },
          },
          code_highlight: undefined,
        },
      ],
    });

    const { getByRole, getByText } = render(<PlaybookPlayer script={script} theme="light" />);
    const learningConsole = getByRole("complementary", { name: "Learning console" });

    expect(getByText("Code Sync")).toBeTruthy();
    expect(learningConsole.textContent).toContain("def factorial(n):");
    expect(learningConsole.textContent).toContain("n = 3");
  });

  it("hides code sync for non-code lessons while keeping params above follow-up", () => {
    const { queryByText, getByText, getByTestId } = render(
      <PlaybookPlayer
        script={baseScript()}
        theme="light"
        followupSlot={<div data-testid="followup-slot">Ask a follow-up</div>}
      />,
    );

    expect(queryByText("Code Sync")).toBeNull();
    expect(getByText("Params")).toBeTruthy();
    expect(getByTestId("followup-slot")).toBeTruthy();
    expect(getByText("Ask a follow-up")).toBeTruthy();
  });

  it("keeps subtitles inside the composition and moves playback options into settings", () => {
    const { container, getByRole, getByText, queryByText } = render(
      <PlaybookPlayer script={baseScript()} theme="light" />,
    );

    expect(container.querySelector('[data-testid="mock-remotion-player"]')?.getAttribute("data-show-subtitles")).toBe(
      "true",
    );
    expect(container.querySelector('[data-testid="mock-remotion-player"]')?.getAttribute("data-show-inline-code")).toBe(
      "false",
    );
    expect(container.querySelector(".playbook-player__caption")).toBeNull();
    expect(queryByText("先观察函数的基础形态。")).toBeNull();

    const controls = container.querySelector(".playbook-player__controls");
    expect(controls).toBeTruthy();
    const directChildren = Array.from(controls!.children);
    expect(directChildren).toHaveLength(3);
    expect((directChildren[0] as HTMLElement).getAttribute("aria-label")).toBe(
      "播放",
    );
    expect(directChildren[1].classList.contains("playbook-player__progress")).toBe(
      true,
    );
    expect(
      directChildren[2].classList.contains("playbook-player__control-actions"),
    ).toBe(true);

    const actionLabels = Array.from(
      directChildren[2].querySelectorAll("button"),
    ).map((button) => button.getAttribute("aria-label"));
    expect(actionLabels).toEqual(["播放器设置", "上一步", "下一步"]);

    expect(queryByText("Speed")).toBeNull();
    expect(queryByText("Captions on")).toBeNull();

    fireEvent.click(getByRole("button", { name: "播放器设置" }));
    expect(getByText("播放速度")).toBeTruthy();
    expect(queryByText("字幕")).toBeNull();
    expect(getByText("播放模式")).toBeTruthy();
    expect(getByText("语音朗读")).toBeTruthy();
  });

  it("renders the player export action as an icon-only button", () => {
    const onOpenExport = vi.fn();
    const { getByRole, queryByText } = render(
      <PlaybookPlayer
        script={baseScript()}
        theme="light"
        onOpenExport={onOpenExport}
      />,
    );

    expect(queryByText("Export")).toBeNull();
    const exportButton = getByRole("button", { name: "导出 MP4" });
    expect(exportButton.querySelector("svg")).toBeTruthy();

    fireEvent.click(exportButton);
    expect(onOpenExport).toHaveBeenCalledTimes(1);
  });

  it("uses a portrait shell with mobile tabs while keeping export and more actions visible", () => {
    const onOpenExport = vi.fn();
    const { container } = render(
      <PlaybookPlayer
        script={baseScript()}
        theme="light"
        layoutMode="portrait"
        onOpenExport={onOpenExport}
        followupSlot={<div>Ask a follow-up</div>}
      />,
    );

    expect(container.querySelector(".playbook-player--portrait")).toBeTruthy();
    expect(container.querySelector(".playbook-player__rail")).toBeNull();
    expect(container.querySelector(".playbook-player__console")).toBeNull();
    expect(container.querySelector(".playbook-player__stage")).toBeTruthy();
    expect(container.querySelector(".playbook-player__controls")).toBeTruthy();
    expect(container.querySelector(".playbook-player__caption--mobile")).toBeNull();
    expect(container.querySelector(".playbook-player__mobile-narration")?.textContent).toContain(
      "先观察函数的基础形态。",
    );
    const player = container.querySelector('[data-testid="mock-remotion-player"]');
    expect(player?.getAttribute("data-show-subtitles")).toBe("false");

    const tabs = container.querySelectorAll(".playbook-player__mobile-tabs button");
    expect(tabs).toHaveLength(5);

    fireEvent.click(tabs[1]);
    expect(player?.getAttribute("data-show-subtitles")).toBe("true");

    fireEvent.click(tabs[0]);
    expect(player?.getAttribute("data-show-subtitles")).toBe("false");

    const exportButton = container.querySelector<HTMLButtonElement>(
      ".playbook-player__header-actions .playbook-player__export-btn",
    );
    const moreButton = container.querySelector<HTMLButtonElement>(
      ".playbook-player__header-actions .playbook-player__mobile-more-btn",
    );
    expect(exportButton).toBeTruthy();
    expect(moreButton).toBeTruthy();

    fireEvent.click(exportButton!);
    expect(onOpenExport).toHaveBeenCalledTimes(1);

    fireEvent.click(moreButton!);
    expect(container.querySelector(".playbook-player__mobile-sheet")).toBeTruthy();
  });

  it("shows only the active code context in the portrait code tab", () => {
    const script = baseScript({
      domain: "algorithm",
      title: "Code slice",
      steps: [
        {
          ...baseScript().steps[0],
          snapshot: {
            kind: "algorithm_array",
            array_values: ["1", "2", "3"],
            active_indices: [0],
            swap_indices: [],
            sorted_indices: [],
            pointers: {},
          },
          code_highlight: {
            language: "python",
            lines: [
              "line1",
              "line2",
              "line3",
              "line4",
              "line5",
              "line6",
              "line7",
              "line8",
            ],
            active_line: 4,
            active_lines: [4],
            variables: {},
          },
        },
      ],
    });

    const { container, queryByText, getByText } = render(
      <PlaybookPlayer script={script} theme="light" layoutMode="portrait" />,
    );

    const codeTab = container.querySelectorAll<HTMLButtonElement>(
      ".playbook-player__mobile-tabs button",
    )[1];
    fireEvent.click(codeTab);

    expect(getByText("Lines 3-7 / 8")).toBeTruthy();
    expect(getByText("line3")).toBeTruthy();
    expect(getByText("line7")).toBeTruthy();
    expect(queryByText("line1")).toBeNull();
    expect(queryByText("line8")).toBeNull();
  });

  it("keeps stage subtitles when the portrait learning console is hidden", () => {
    const { container } = render(
      <PlaybookPlayer
        script={baseScript()}
        theme="light"
        layoutMode="portrait"
        showLearningConsole={false}
      />,
    );

    expect(container.querySelector(".playbook-player__mobile-narration")).toBeNull();
    expect(
      container
        .querySelector('[data-testid="mock-remotion-player"]')
        ?.getAttribute("data-show-subtitles"),
    ).toBe("true");
  });

  it("opens follow-up content in a portrait bottom sheet", () => {
    const { container, getByLabelText } = render(
      <PlaybookPlayer
        script={baseScript()}
        theme="light"
        layoutMode="portrait"
        followupSlot={<textarea aria-label="Ask follow-up" />}
      />,
    );

    const followupTab = container.querySelectorAll<HTMLButtonElement>(
      ".playbook-player__mobile-tabs button",
    )[3];
    fireEvent.click(followupTab);

    expect(container.querySelector(".playbook-player__mobile-sheet")).toBeTruthy();
    expect(getByLabelText("Ask follow-up")).toBeTruthy();
  });

  it("uses the left rail control to toggle the workbench topbar instead of opening a submenu", () => {
    const onToggle = vi.fn();
    const { getByRole, queryByRole, rerender } = render(
      <PlaybookPlayer
        script={baseScript()}
        theme="light"
        topbarCollapsed={false}
        onToggleTopbar={onToggle}
      />,
    );

    const trigger = getByRole("button", { name: "隐藏顶部栏" });
    fireEvent.click(trigger);

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(trigger.getAttribute("aria-pressed")).toBe("false");
    expect(trigger.querySelector('[data-testid="topbar-toggle-icon-collapse"]')).toBeTruthy();
    expect(queryByRole("menu", { name: "任务导航" })).toBeNull();
    expect(queryByRole("menuitem", { name: "首页" })).toBeNull();
    expect(queryByRole("menuitem", { name: "任务历史" })).toBeNull();
    expect(queryByRole("menuitem", { name: "模板" })).toBeNull();
    expect(queryByRole("menuitem", { name: "设置" })).toBeNull();

    rerender(
      <PlaybookPlayer
        script={baseScript()}
        theme="light"
        topbarCollapsed
        onToggleTopbar={onToggle}
      />,
    );
    expect(getByRole("button", { name: "显示顶部栏" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(
      getByRole("button", { name: "显示顶部栏" }).querySelector(
        '[data-testid="topbar-toggle-icon-expand"]',
      ),
    ).toBeTruthy();
    expect(queryByRole("menu", { name: "任务导航" })).toBeNull();
  });

  it("renders version history in the lower related panel, not inside follow-up", () => {
    const { container, getByLabelText, getByTestId, queryByText } = render(
      <PlaybookPlayer
        script={baseScript()}
        theme="light"
        followupSlot={<div data-testid="followup-slot">Ask this step</div>}
        relatedSlot={<div data-testid="version-history">版本记录</div>}
      />,
    );

    const followBody = container.querySelector(".playbook-player__follow-body");
    expect(followBody?.textContent).toContain("Ask this step");
    expect(followBody?.textContent).not.toContain("版本记录");

    const relatedPanel = getByLabelText("Related study context");
    expect(within(relatedPanel).getByTestId("version-history")).toBeTruthy();
    expect(getByTestId("followup-slot")).toBeTruthy();
    expect(queryByText("Study variants")).toBeNull();
  });

  it("can hide the learning console for read-only history playback", () => {
    const script = baseScript({
      domain: "algorithm",
      algorithm_id: "bubble_sort",
      initial_data: {},
      steps: [
        {
          ...baseScript().steps[0],
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
        },
      ],
    });

    const { container, queryByLabelText, queryByText } = render(
      <PlaybookPlayer
        script={script}
        theme="light"
        showLearningConsole={false}
        followupSlot={<div>Ask a follow-up</div>}
        relatedSlot={<div>版本记录</div>}
      />,
    );

    expect(container.querySelector(".playbook-player--no-console")).toBeTruthy();
    expect(queryByLabelText("Learning console")).toBeNull();
    expect(queryByText("Code Sync")).toBeNull();
    expect(queryByText("Params")).toBeNull();
    expect(queryByText("Follow-up")).toBeNull();
    expect(queryByText("Related")).toBeNull();
    expect(queryByText("Ask a follow-up")).toBeNull();
    expect(queryByText("版本记录")).toBeNull();
  });

  it("shows algorithm params when replay can use array values from snapshots", () => {
    const script = baseScript({
      domain: "algorithm",
      algorithm_id: "bubble_sort",
      initial_data: {},
      steps: [
        {
          ...baseScript().steps[0],
          snapshot: {
            kind: "algorithm_array",
            array_values: ["3", "1", "2"],
            active_indices: [],
            swap_indices: [],
            sorted_indices: [],
            pointers: {},
          },
        },
      ],
    });

    const { getByText, getByDisplayValue } = render(
      <PlaybookPlayer script={script} theme="light" />,
    );

    expect(getByText("Params")).toBeTruthy();
    expect(getByDisplayValue("3")).toBeTruthy();
    expect(getByDisplayValue("1")).toBeTruthy();
  });

  it("hides algorithm params when no replayable controls are available", () => {
    const script = baseScript({
      domain: "algorithm",
      algorithm_id: "bfs",
      initial_data: {},
      steps: [
        {
          ...baseScript().steps[0],
          snapshot: {
            kind: "algorithm_array",
            array_values: ["3", "1", "2"],
            active_indices: [],
            swap_indices: [],
            sorted_indices: [],
            pointers: {},
          },
        },
      ],
    });

    const { queryByText } = render(<PlaybookPlayer script={script} theme="light" />);

    expect(queryByText("Params")).toBeNull();
    expect(queryByText(/不可用|不支持/)).toBeNull();
  });

  it("clamps the current step when a patched script becomes shorter", async () => {
    const { container, getByRole, rerender } = render(
      <PlaybookPlayer script={baseScript()} theme="light" />,
    );

    fireEvent.click(getByRole("button", { name: "下一步" }));
    await waitFor(() => {
      expect(container.querySelector(".playbook-player__rail-current")?.textContent).toBe(
        "0202",
      );
    });

    rerender(
      <PlaybookPlayer
        script={baseScript({
          total_frames: 45,
          steps: [baseScript().steps[0]],
        })}
        theme="light"
      />,
    );

    expect(container.querySelector(".playbook-player__rail-current")?.textContent).toBe(
      "0101",
    );
  });
});
