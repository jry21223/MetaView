import React from "react";
import { act, cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { GraphSceneSnapshot, PlaybookScript } from "../types";
import { PlaybookPlayer } from "./PlaybookPlayer";

const playerMockState = vi.hoisted(() => ({
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  pause: vi.fn(),
  play: vi.fn(),
  seekTo: vi.fn(),
}));

vi.mock("@remotion/player", async () => {
  const React = await import("react");
  return {
    Player: React.forwardRef(function MockPlayer(
      props: {
        inputProps?: {
          script?: PlaybookScript;
          showSubtitles?: boolean;
          showInlineCode?: boolean;
          onInteraction?: (event: {
            type: "select-node";
            phase: "commit";
            step_id: string;
            target_role: "start-node";
            value: string;
          }) => void;
        };
      },
      ref: React.ForwardedRef<unknown>,
    ) {
      React.useImperativeHandle(ref, () => ({
        addEventListener: playerMockState.addEventListener,
        removeEventListener: playerMockState.removeEventListener,
        pause: playerMockState.pause,
        play: playerMockState.play,
        seekTo: playerMockState.seekTo,
      }));
      const snapshot = props.inputProps?.script?.steps[0]?.snapshot;
      const markerX = snapshot?.kind === "math_plot" ? snapshot.marker_x : undefined;
      const arrayValues =
        snapshot?.kind === "algorithm_array" || snapshot?.kind === "algorithm_bars"
          ? snapshot.array_values.join(",")
          : undefined;
      const graphStep = props.inputProps?.script?.steps.find(
        (step) => step.snapshot.kind === "graph_scene",
      );
      const graph = graphStep?.snapshot.kind === "graph_scene" ? graphStep.snapshot : null;
      return (
        <div
          data-testid="mock-remotion-player"
          data-marker-x={markerX}
          data-array-values={arrayValues}
          data-show-subtitles={String(props.inputProps?.showSubtitles)}
          data-show-inline-code={String(props.inputProps?.showInlineCode)}
          data-interaction-enabled={String(Boolean(props.inputProps?.onInteraction))}
          data-has-interaction={String(typeof props.inputProps?.onInteraction === "function")}
          data-current-node={graph?.current_node_id ?? ""}
          data-code-current={graphStep?.code_highlight?.variables?.current ?? ""}
          data-code-queue={graphStep?.code_highlight?.variables?.queue ?? ""}
          data-code-visited={graphStep?.code_highlight?.variables?.visited ?? ""}
        >
          {props.inputProps?.onInteraction && graphStep && (
            <button
              type="button"
              aria-label="模拟选择节点 B"
              onClick={() => props.inputProps?.onInteraction?.({
                type: "select-node",
                phase: "commit",
                step_id: graphStep.step_id,
                target_role: "start-node",
                value: "B",
              })}
            />
          )}
        </div>
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

function derivativeScript(): PlaybookScript {
  const base = baseScript();
  return baseScript({
    total_frames: 60,
    steps: [
      {
        ...base.steps[0],
        step_id: "plot",
        end_frame: 30,
        title: "Tangent",
        snapshot: {
          kind: "math_plot",
          curves: [
            { expression: "x^2", semantic_role: "curve" },
            {
              expression: "2*x - 1",
              semantic_role: "tangent",
              emphasis: "accent",
            },
          ],
          x_min: -5,
          x_max: 5,
          y_min: -1,
          y_max: 25,
          marker_x: 1,
        },
      },
      {
        ...base.steps[1],
        step_id: "summary",
        end_frame: 60,
      },
    ],
  });
}

function bfsScript(withTrailingStep = false): PlaybookScript {
  const graph: GraphSceneSnapshot = {
    kind: "graph_scene",
    nodes: [{ id: "A" }, { id: "B" }, { id: "C" }],
    edges: [
      { source: "A", target: "B" },
      { source: "B", target: "C" },
    ],
    directed: false,
    current_node_id: "A",
    active_node_ids: ["A"],
    visited_node_ids: ["A"],
    queue_node_ids: ["B"],
    frontier_node_ids: ["B"],
  };
  return baseScript({
    domain: "algorithm",
    algorithm_id: "bfs",
    total_frames: withTrailingStep ? 90 : 45,
    steps: [{
      ...baseScript().steps[0],
      step_id: "graph",
      end_frame: 45,
      title: "Choose a BFS start",
      snapshot: graph,
      code_highlight: {
        language: "pseudocode",
        lines: ["current = queue.dequeue()", "visit(current)"],
        active_line: 0,
        active_lines: [0],
        variables: { current: "A", queue: "[B]", visited: "{A}" },
      },
    }, ...(withTrailingStep ? [{
      ...baseScript().steps[1],
      step_id: "summary",
      end_frame: 90,
      title: "Summary",
    }] : [])],
  });
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

    const { getByText, getByTestId, getByRole, queryByText } = render(
      <PlaybookPlayer
        script={script}
        theme="light"
        parameterSlot={<div>Target parameter</div>}
        followupSlot={<div data-testid="followup-slot">Ask this step</div>}
        relatedSlot={<div>Related lesson</div>}
      />,
    );

    expect(getByText("Code Sync")).toBeTruthy();
    expect(getByText("Params")).toBeTruthy();
    expect(getByText("Follow-up")).toBeTruthy();
    expect(getByText("Related lesson")).toBeTruthy();
    expect(queryByText("Director")).toBeNull();
    expect(getByTestId("followup-slot")).toBeTruthy();
    expect(getByText("Ask this step")).toBeTruthy();
    const consoleText = getByRole("complementary", { name: "Learning console" }).textContent ?? "";
    expect(consoleText.indexOf("Code Sync")).toBeLessThan(consoleText.indexOf("Params"));
    expect(consoleText.indexOf("Params")).toBeLessThan(consoleText.indexOf("Follow-up"));
    expect(consoleText.indexOf("Follow-up")).toBeLessThan(consoleText.indexOf("Related lesson"));
    expect(consoleText.match(/python/g)).toHaveLength(1);
    expect(consoleText).not.toContain("algorithm");
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

  it("hides empty math params and lets follow-up occupy the remaining console", () => {
    const { container, queryByText, getByTestId } = render(
      <PlaybookPlayer
        script={baseScript()}
        theme="light"
        followupSlot={<div data-testid="followup-slot">Ask a follow-up</div>}
      />,
    );

    expect(queryByText("Code Sync")).toBeNull();
    expect(queryByText("Params")).toBeNull();
    expect(container.querySelector(".playbook-player__params-card")).toBeNull();
    expect(container.querySelector(".playbook-player__follow-card")).toBeTruthy();
    expect(getByTestId("followup-slot")).toBeTruthy();
  });

  it("shows math params when at least one editable control is available", () => {
    const script = baseScript({
      parameter_controls: [{ id: "a", label: "斜率 a", value: "1" }],
    });

    const { getByText, getByLabelText } = render(
      <PlaybookPlayer script={script} theme="light" />,
    );

    expect(getByText("Params")).toBeTruthy();
    expect(getByLabelText("斜率 a")).toBeTruthy();
  });

  it("renders deterministic custom params and resolves follow-up content for the current step", () => {
    const script = baseScript();
    const { getByText, getByTestId } = render(
      <PlaybookPlayer
        script={script}
        theme="light"
        parameterSlot={<div data-testid="static-params">Local parameter</div>}
        followupSlot={({ currentStepId }) => (
          <div data-testid="static-followup">Questions for {currentStepId}</div>
        )}
      />,
    );

    expect(getByText("Params")).toBeTruthy();
    expect(getByTestId("static-params")).toBeTruthy();
    expect(getByTestId("static-followup").textContent).toContain(script.steps[0].step_id);
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
    expect(getByRole("button", { name: "连播" })).toBeTruthy();
    fireEvent.click(getByRole("button", { name: "连播" }));
    expect(getByRole("button", { name: "步进" })).toBeTruthy();
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
    const { container, queryByRole } = render(
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
    expect(tabs).toHaveLength(4);
    expect(queryByRole("tab", { name: "参数" })).toBeNull();

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

  it("leaves the params tab when a portrait lesson loses editable controls", () => {
    const withParams = baseScript({
      parameter_controls: [{ id: "a", label: "斜率 a", value: "1" }],
    });
    const view = render(
      <PlaybookPlayer script={withParams} theme="light" layoutMode="portrait" />,
    );

    fireEvent.click(view.getByRole("tab", { name: "参数" }));
    expect(view.getByRole("tab", { name: "参数" }).getAttribute("aria-selected")).toBe(
      "true",
    );

    view.rerender(
      <PlaybookPlayer script={baseScript()} theme="light" layoutMode="portrait" />,
    );

    expect(view.queryByRole("tab", { name: "参数" })).toBeNull();
    expect(view.getByRole("tab", { name: "讲解" }).getAttribute("aria-selected")).toBe(
      "true",
    );
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
    const { container, getByLabelText, getByRole } = render(
      <PlaybookPlayer
        script={baseScript()}
        theme="light"
        layoutMode="portrait"
        followupSlot={<textarea aria-label="Ask follow-up" />}
      />,
    );

    fireEvent.click(getByRole("tab", { name: "追问" }));

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

  it("keeps the interaction sandbox disabled by default", () => {
    const { getByTestId, queryByRole, queryByText } = render(
      <PlaybookPlayer script={derivativeScript()} theme="light" />,
    );

    expect(queryByText("Explore")).toBeNull();
    expect(queryByRole("slider", { name: "切点 x" })).toBeNull();
    expect(getByTestId("mock-remotion-player").getAttribute("data-marker-x")).toBe("1");
  });

  it("lets an explicit Studio opt-in drive the ephemeral stage preview", async () => {
    const { getByRole, getByTestId, getByText } = render(
      <PlaybookPlayer
        script={derivativeScript()}
        theme="light"
        enableInteractionSandbox
      />,
    );

    expect(getByText("Explore")).toBeTruthy();
    const slider = getByRole("slider", { name: "切点 x" });
    fireEvent.change(slider, { target: { value: "3" } });
    fireEvent.pointerUp(slider);

    await waitFor(() => {
      expect(getByTestId("mock-remotion-player").getAttribute("data-marker-x")).toBe("3");
    });
  });

  it("disables interactions when the learning console is hidden", () => {
    const { getByTestId, queryByRole, queryByText } = render(
      <PlaybookPlayer
        script={derivativeScript()}
        theme="light"
        enableInteractionSandbox
        showLearningConsole={false}
      />,
    );

    expect(queryByText("Explore")).toBeNull();
    expect(queryByRole("slider", { name: "切点 x" })).toBeNull();
    expect(getByTestId("mock-remotion-player").getAttribute("data-marker-x")).toBe("1");
  });

  it("keeps recovery controls available on an unbound step", async () => {
    const { getByRole, queryByText, getByText } = render(
      <PlaybookPlayer
        script={derivativeScript()}
        theme="light"
        enableInteractionSandbox
      />,
    );

    const slider = getByRole("slider", { name: "切点 x" });
    fireEvent.change(slider, { target: { value: "3" } });
    fireEvent.pointerUp(slider);
    fireEvent.click(getByRole("button", { name: "下一步" }));

    await waitFor(() => {
      expect(getByText(/当前步骤没有交互目标/)).toBeTruthy();
    });
    fireEvent.click(getByRole("button", { name: "重置" }));
    await waitFor(() => {
      expect(queryByText("Explore")).toBeNull();
    });
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

  it("feeds replayed algorithm params back into the Remotion script props", async () => {
    const script = baseScript({
      domain: "algorithm",
      algorithm_id: "bubble_sort",
      initial_data: { array: ["3", "1", "2"] },
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
    const { getByDisplayValue, getByTestId } = render(
      <PlaybookPlayer script={script} theme="light" />,
    );

    expect(getByTestId("mock-remotion-player").getAttribute("data-array-values")).toBe(
      "3,1,2",
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    fireEvent.change(getByDisplayValue("3"), { target: { value: "5" } });

    await waitFor(() => {
      expect(getByTestId("mock-remotion-player").getAttribute("data-array-values")).toBe(
        "1,2,5",
      );
    });
  });

  it("wires mount play pause and unmount lifecycle to the Remotion player", async () => {
    const { getByRole, unmount } = render(
      <PlaybookPlayer script={baseScript()} theme="light" />,
    );

    await waitFor(() => {
      expect(playerMockState.addEventListener).toHaveBeenCalledWith("play", expect.any(Function));
      expect(playerMockState.addEventListener).toHaveBeenCalledWith("pause", expect.any(Function));
    });

    fireEvent.click(getByRole("button", { name: "播放" }));
    expect(playerMockState.play).toHaveBeenCalledTimes(1);

    const onPlay = playerMockState.addEventListener.mock.calls.find(
      ([event]) => event === "play",
    )?.[1] as (() => void) | undefined;
    expect(onPlay).toBeTruthy();
    act(() => onPlay?.());

    fireEvent.click(getByRole("button", { name: "暂停" }));
    expect(playerMockState.pause).toHaveBeenCalledTimes(1);

    unmount();

    expect(playerMockState.removeEventListener).toHaveBeenCalledWith("play", expect.any(Function));
    expect(playerMockState.removeEventListener).toHaveBeenCalledWith("pause", expect.any(Function));
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
  it("keeps the interaction sandbox disabled unless a player surface opts in", () => {
    const view = render(<PlaybookPlayer script={derivativeScript()} theme="light" />);

    expect(view.queryByText("Explore")).toBeNull();
    expect(view.queryByText("沙盒预览")).toBeNull();
    expect(view.getByTestId("mock-remotion-player").getAttribute("data-has-interaction"))
      .toBe("false");
  });

  it("does not expose interaction on a read-only player with no learning console", () => {
    const view = render(
      <PlaybookPlayer
        script={derivativeScript()}
        theme="light"
        showLearningConsole={false}
        enableInteractionSandbox
      />,
    );

    expect(view.queryByText("沙盒预览")).toBeNull();
    expect(view.getByTestId("mock-remotion-player").getAttribute("data-has-interaction"))
      .toBe("false");
  });

  it("opts the desktop Studio-style player into direct sandbox manipulation", () => {
    const view = render(
      <PlaybookPlayer
        script={derivativeScript()}
        theme="light"
        enableInteractionSandbox
      />,
    );

    expect(view.getByText("Explore")).toBeTruthy();
    expect(view.queryByText("此步骤无可调参数。")).toBeNull();
    expect(view.getByTestId("mock-remotion-player").getAttribute("data-has-interaction"))
      .toBe("true");

    const slider = view.getByRole("slider", { name: "切点 x" });
    fireEvent.change(slider, { target: { value: "2" } });
    fireEvent.pointerUp(slider);
    expect(view.getByTestId("mock-remotion-player").getAttribute("data-marker-x"))
      .toBe("2");
  });

  it("hands semantic sandbox events to AI only through the explicit explain button", async () => {
    const onExplainInteraction = vi.fn().mockResolvedValue(undefined);
    const view = render(
      <PlaybookPlayer
        script={derivativeScript()}
        theme="light"
        enableInteractionSandbox
        onExplainInteraction={onExplainInteraction}
      />,
    );

    expect(onExplainInteraction).not.toHaveBeenCalled();
    const slider = view.getByRole("slider", { name: "切点 x" });
    fireEvent.change(slider, { target: { value: "2" } });
    fireEvent.pointerUp(slider);
    expect(onExplainInteraction).not.toHaveBeenCalled();

    fireEvent.click(view.getByRole("button", { name: "解释我的操作" }));

    await waitFor(() => expect(onExplainInteraction).toHaveBeenCalledTimes(1));
    expect(onExplainInteraction).toHaveBeenCalledWith({
      manifest_version: "1",
      events: [expect.objectContaining({
        adapter_id: "math.derivative-tangent",
        step_id: "plot",
        target_id: "step:plot:marker-x",
        action: "set-value",
        value: 2,
        sequence: 1,
      })],
    });
  });

  it("persists semantic sandbox events only through the explicit apply button", async () => {
    const onApplyInteractionVersion = vi.fn().mockResolvedValue(undefined);
    const view = render(
      <PlaybookPlayer
        script={derivativeScript()}
        theme="light"
        enableInteractionSandbox
        onApplyInteractionVersion={onApplyInteractionVersion}
      />,
    );

    expect(onApplyInteractionVersion).not.toHaveBeenCalled();
    const slider = view.getByRole("slider", { name: "切点 x" });
    fireEvent.change(slider, { target: { value: "2" } });
    fireEvent.pointerUp(slider);
    expect(onApplyInteractionVersion).not.toHaveBeenCalled();

    fireEvent.click(view.getByRole("button", { name: "应用到新版本" }));

    await waitFor(() => expect(onApplyInteractionVersion).toHaveBeenCalledTimes(1));
    expect(onApplyInteractionVersion).toHaveBeenCalledWith([
      expect.objectContaining({
        adapter_id: "math.derivative-tangent",
        step_id: "plot",
        target_id: "step:plot:marker-x",
        action: "set-value",
        value: 2,
        sequence: 1,
      }),
    ]);
  });

  it("acknowledges a saved round-trip and clears identical-content sandbox history", async () => {
    const onApplyInteractionVersion = vi.fn().mockResolvedValue(undefined);
    const view = render(
      <PlaybookPlayer
        script={derivativeScript()}
        theme="light"
        enableInteractionSandbox
        onApplyInteractionVersion={onApplyInteractionVersion}
      />,
    );

    const slider = view.getByRole("slider", { name: "切点 x" });
    fireEvent.change(slider, { target: { value: "2" } });
    fireEvent.pointerUp(slider);
    fireEvent.change(slider, { target: { value: "1" } });
    fireEvent.pointerUp(slider);
    expect(view.getByText("2 个未保存操作")).toBeTruthy();

    fireEvent.click(view.getByRole("button", { name: "应用到新版本" }));

    await waitFor(() => expect(onApplyInteractionVersion).toHaveBeenCalledTimes(1));
    expect(onApplyInteractionVersion.mock.calls[0]?.[0]).toHaveLength(2);
    await waitFor(() => {
      expect(view.getByText("不会修改原课程")).toBeTruthy();
      expect(
        view.getByRole<HTMLButtonElement>("button", { name: "应用到新版本" }).disabled,
      ).toBe(true);
    });
  });

  it("opens the portrait follow-up sheet after an apply outcome", async () => {
    const onApplyInteractionVersion = vi.fn().mockResolvedValue(undefined);
    const view = render(
      <PlaybookPlayer
        script={derivativeScript()}
        theme="light"
        layoutMode="portrait"
        enableInteractionSandbox
        onApplyInteractionVersion={onApplyInteractionVersion}
        followupSlot={<div>版本保存结果</div>}
      />,
    );

    fireEvent.click(view.getByRole("tab", { name: "参数" }));
    const slider = view.getByRole("slider", { name: "切点 x" });
    fireEvent.change(slider, { target: { value: "2" } });
    fireEvent.pointerUp(slider);
    fireEvent.click(view.getByRole("button", { name: "应用到新版本" }));

    await waitFor(() => expect(onApplyInteractionVersion).toHaveBeenCalledTimes(1));
    expect(view.container.querySelector(".playbook-player__mobile-sheet")).toBeTruthy();
    expect(view.getByText("版本保存结果")).toBeTruthy();
  });

  it("keeps recovery controls after navigating away from the bound plot", async () => {
    const view = render(
      <PlaybookPlayer
        script={derivativeScript()}
        theme="light"
        enableInteractionSandbox
      />,
    );

    const slider = view.getByRole("slider", { name: "切点 x" });
    fireEvent.change(slider, { target: { value: "2" } });
    fireEvent.pointerUp(slider);
    fireEvent.click(view.getByRole("button", { name: "下一步" }));

    await waitFor(() => {
      expect(view.getByText(/当前步骤没有交互目标/)).toBeTruthy();
    });
    expect(view.queryByRole("slider", { name: "切点 x" })).toBeNull();
    const reset = view.getByRole("button", { name: "重置" }) as HTMLButtonElement;
    expect(reset.disabled).toBe(false);
    fireEvent.click(reset);
    await waitFor(() => {
      expect(view.queryByText("Explore")).toBeNull();
    });
  });


  it("reuses the five-tab portrait params surface without enabling canvas drag", () => {
    const view = render(
      <PlaybookPlayer
        script={derivativeScript()}
        theme="light"
        layoutMode="portrait"
        enableInteractionSandbox
      />,
    );
    expect(view.getAllByRole("tab")).toHaveLength(5);

    fireEvent.click(view.getByRole("tab", { name: "参数" }));
    expect(view.getByRole("slider", { name: "切点 x" })).toBeTruthy();
    expect(view.getByText("沙盒预览")).toBeTruthy();
    expect(view.getByTestId("mock-remotion-player").getAttribute("data-has-interaction"))
      .toBe("false");
  });

  it("keeps the experimental sandbox off by default on read-only players", () => {
    const view = render(<PlaybookPlayer script={bfsScript()} theme="light" />);
    const player = view.getByTestId("mock-remotion-player");

    expect(player.getAttribute("data-interaction-enabled")).toBe("false");
    expect(view.queryByText("沙盒预览")).toBeNull();
    expect(view.queryByRole("button", { name: "B" })).toBeNull();
  });

  it("selects a BFS start and previews replay frames end to end", async () => {
    const view = render(
      <PlaybookPlayer script={bfsScript()} theme="light" enableInteractionSandbox />,
    );
    const player = view.getByTestId("mock-remotion-player");

    expect(player.getAttribute("data-interaction-enabled")).toBe("true");
    expect(view.getByRole<HTMLButtonElement>("button", { name: "A" }).disabled).toBe(true);
    fireEvent.click(view.getByRole("button", { name: "模拟选择节点 B" }));

    await waitFor(() => {
      expect(view.getByRole("group", { name: "BFS 重放" })).toBeTruthy();
      expect(player.getAttribute("data-current-node")).toBe("B");
      expect(player.getAttribute("data-code-current")).toBe("B");
      expect(player.getAttribute("data-code-queue")).toBe("[A, C]");
      expect(player.getAttribute("data-code-visited")).toBe("{B}");
    });
    expect(view.getByText("B → A → C")).toBeTruthy();

    fireEvent.click(view.getByRole("button", { name: "下一帧" }));
    await waitFor(() => {
      expect(player.getAttribute("data-current-node")).toBe("A");
      expect(player.getAttribute("data-code-current")).toBe("A");
      expect(player.getAttribute("data-code-queue")).toBe("[C]");
      expect(player.getAttribute("data-code-visited")).toBe("{B, A}");
    });
    expect(view.getByText("重放 2 / 3")).toBeTruthy();
  });

  it("keeps undo and reset available after navigating away from the BFS step", async () => {
    const view = render(
      <PlaybookPlayer script={bfsScript(true)} theme="light" enableInteractionSandbox />,
    );
    fireEvent.click(view.getByRole("button", { name: "模拟选择节点 B" }));
    await waitFor(() => expect(view.getByText("1 个未保存操作")).toBeTruthy());

    fireEvent.click(view.getByRole("button", { name: "下一步" }));
    await waitFor(() => {
      expect(view.getByRole("status").textContent).toContain("没有交互目标");
    });
    expect(view.getByRole<HTMLButtonElement>("button", { name: "撤销" }).disabled).toBe(false);
    expect(view.getByRole<HTMLButtonElement>("button", { name: "重置" }).disabled).toBe(false);
  });

  it("uses the mobile params panel while keeping graph nodes passive", () => {
    const view = render(
      <PlaybookPlayer
        script={bfsScript()}
        theme="light"
        layoutMode="portrait"
        enableInteractionSandbox
      />,
    );
    expect(view.getByTestId("mock-remotion-player").getAttribute("data-interaction-enabled"))
      .toBe("false");
    expect(view.queryByRole("button", { name: "模拟选择节点 B" })).toBeNull();

    fireEvent.click(view.getByRole("tab", { name: "参数" }));
    expect(view.getByRole("group", { name: "BFS 起点" })).toBeTruthy();
    expect(view.getByRole<HTMLButtonElement>("button", { name: "A" }).disabled).toBe(true);
    expect(view.getByRole<HTMLButtonElement>("button", { name: "B" }).disabled).toBe(false);
  });

  it("never enables sandbox interaction when the learning console is hidden", () => {
    const view = render(
      <PlaybookPlayer
        script={bfsScript()}
        theme="light"
        showLearningConsole={false}
        enableInteractionSandbox
      />,
    );

    expect(view.getByTestId("mock-remotion-player").getAttribute("data-interaction-enabled"))
      .toBe("false");
    expect(view.queryByText("沙盒预览")).toBeNull();
  });

});
