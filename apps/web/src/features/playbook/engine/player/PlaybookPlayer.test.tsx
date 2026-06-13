import React from "react";
import { cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PlaybookScript } from "../types";
import { PlaybookPlayer } from "./PlaybookPlayer";

vi.mock("@remotion/player", async () => {
  const React = await import("react");
  return {
    Player: React.forwardRef(function MockPlayer(
      _props: unknown,
      ref: React.ForwardedRef<unknown>,
    ) {
      React.useImperativeHandle(ref, () => ({
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        pause: vi.fn(),
        play: vi.fn(),
        seekTo: vi.fn(),
      }));
      return <div data-testid="mock-remotion-player" />;
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

  it("keeps the primary controls in the design order and moves playback options into settings", () => {
    const { container, getByRole, getByText, queryByText } = render(
      <PlaybookPlayer script={baseScript()} theme="light" />,
    );

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
    expect(getByText("字幕")).toBeTruthy();
    expect(getByText("语音朗读")).toBeTruthy();
  });

  it("opens workbench navigation from the left rail and closes it with Escape", () => {
    const onHistory = vi.fn();
    const { getByRole, queryByRole } = render(
      <PlaybookPlayer
        script={baseScript()}
        theme="light"
        workbenchNavItems={[
          { id: "home", label: "首页", active: true, onSelect: vi.fn() },
          { id: "history", label: "任务历史", onSelect: onHistory },
          { id: "templates", label: "模板", onSelect: vi.fn() },
          { id: "settings", label: "设置", onSelect: vi.fn() },
        ]}
      />,
    );

    const trigger = getByRole("button", { name: "打开任务导航" });
    fireEvent.click(trigger);

    expect(getByRole("menu", { name: "任务导航" })).toBeTruthy();
    fireEvent.click(getByRole("menuitem", { name: "任务历史" }));

    expect(onHistory).toHaveBeenCalledTimes(1);
    expect(queryByRole("menu", { name: "任务导航" })).toBeNull();

    fireEvent.click(trigger);
    expect(getByRole("menu", { name: "任务导航" })).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
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
