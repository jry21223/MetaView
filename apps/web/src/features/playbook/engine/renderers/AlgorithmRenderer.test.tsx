import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AlgorithmRenderer } from "./AlgorithmRenderer";
import { DomainArrayRenderer } from "./DomainArrayRenderer";
import { rendererRegistry } from "./registry";
import type { AlgorithmArraySnapshot, MetaStep } from "../types";
import type { RendererProps } from "./types";

function arrayStep(
  snap: AlgorithmArraySnapshot,
  overrides: Partial<MetaStep> = {},
): MetaStep {
  return {
    step_id: "s1",
    end_frame: 60,
    title: "比较 arr[0] 和 arr[1]",
    voiceover_text: "现在比较前两个元素",
    snapshot: snap,
    tokens: [],
    ...overrides,
  };
}

function props(step: MetaStep, overrides: Partial<RendererProps> = {}): RendererProps {
  return {
    step,
    prevStep: null,
    frame: 90,
    stepStartFrame: 0,
    stepEndFrame: 60,
    progress: 1,
    theme: "dark",
    ...overrides,
  };
}

function render(snap: AlgorithmArraySnapshot, overrides: Partial<RendererProps> = {}): string {
  return renderToStaticMarkup(<AlgorithmRenderer {...props(arrayStep(snap), overrides)} />);
}

function defaultSnap(extra: Partial<AlgorithmArraySnapshot> = {}): AlgorithmArraySnapshot {
  return {
    kind: "algorithm_array",
    array_values: ["5", "3", "8", "1"],
    active_indices: [0, 1],
    swap_indices: [],
    sorted_indices: [],
    pointers: { i: 0, j: 1 },
    ...extra,
  };
}

describe("AlgorithmRenderer", () => {
  it("is registered for the algorithm_array snapshot kind", () => {
    expect(rendererRegistry.get("algorithm_array")).toBe(DomainArrayRenderer);
  });

  it("renders every array value as a labeled cell", () => {
    const markup = render(defaultSnap());
    for (const value of ["5", "3", "8", "1"]) {
      expect(markup, `expected value ${value} on screen`).toContain(`>${value}<`);
    }
  });

  it("keeps unchanged cells visible at the exact start of a later step", () => {
    const snap = defaultSnap();
    const previous = arrayStep(snap, { step_id: "previous", end_frame: 60 });
    const markup = render(snap, {
      prevStep: previous,
      frame: 60,
      stepStartFrame: 60,
    });

    expect(markup).toMatch(/data-array-index="2"[^>]*opacity:1/);
  });

  it("renders the step title without duplicating shared subtitles", () => {
    const markup = render(defaultSnap());
    expect(markup).toContain("比较 arr[0] 和 arr[1]");
    expect(markup).not.toContain("现在比较前两个元素");
  });

  it("renders all configured pointers", () => {
    const markup = render(defaultSnap({ pointers: { i: 0, j: 2, pivot: 3 } }));
    expect(markup).toContain(">i<");
    expect(markup).toContain(">j<");
    expect(markup).toContain(">pivot<");
  });

  it("renders continuous ranges, element transitions, and auxiliary lanes", () => {
    const markup = render(defaultSnap({
      active_indices: [2],
      ranges: [{
        id: "active-window",
        start: 1,
        end: 3,
        role: "window",
        label: "window k=3",
        emphasis: "primary",
      }],
      element_states: {
        0: ["leaving"],
        2: ["pivot"],
        3: ["entering", "maximum"],
      },
      auxiliary_lanes: [
        {
          id: "deque",
          role: "deque",
          label: "MONOTONIC DEQUE · indices",
          items: [{ id: "d3", label: "i=3", value: "nums[i]=1", index: 3 }],
        },
        {
          id: "result",
          role: "result",
          label: "RESULT",
          items: [{ id: "r0", label: "8" }],
        },
      ],
    }));

    expect(markup).toContain('data-range-role="window"');
    expect(markup).toContain('data-range-start="1"');
    expect(markup).toContain('data-range-end="3"');
    expect(markup).toContain("window k=3");
    expect(markup).toContain('data-element-states="leaving"');
    expect(markup).toContain('data-element-states="pivot"');
    expect(markup).toContain(">PIVOT<");
    expect(markup).toContain('data-element-states="entering maximum"');
    expect(markup).toContain("MONOTONIC DEQUE · indices");
    expect(markup).toContain("nums[i]=1");
    expect(markup).toContain("RESULT");
  });

  it("draws a stack lane as a vertical slot column beside the sequence", () => {
    const markup = render(defaultSnap({
      auxiliary_lanes: [
        {
          id: "stack",
          role: "stack",
          label: "STACK",
          items: [
            { id: "s0", label: "{", value: "i=0", index: 0 },
            { id: "s1", label: "[", value: "i=1", index: 1 },
          ],
        },
        { id: "result", role: "result", label: "MATCHED", items: [] },
      ],
    }));

    expect(markup).toContain('data-stack-lane="stack"');
    // Four cells → four slots even though only two are filled.
    expect(markup).toContain('data-stack-capacity="4"');
    expect(markup).toContain('data-stack-top="1"');
    expect(markup.match(/data-stack-slot-state="filled"/g)).toHaveLength(2);
    expect(markup.match(/data-stack-slot-state="empty"/g)).toHaveLength(2);
    expect(markup).toContain('data-stack-marker="top"');
    // Slot 3 renders first (top of the column), slot 0 last (bottom).
    expect(markup.indexOf('data-stack-slot="3"')).toBeLessThan(markup.indexOf('data-stack-slot="0"'));
    // The stack must not also appear as a horizontal lane row.
    expect(markup).not.toContain('data-auxiliary-role="stack"');
    expect(markup).toContain('data-auxiliary-role="result"');
    expect(markup).toContain("top = 1 · size = 2");
  });

  it("shows an empty stack column with every slot open", () => {
    const markup = render(defaultSnap({
      auxiliary_lanes: [{ id: "stack", role: "stack", label: "STACK", items: [] }],
    }));

    expect(markup).toContain('data-stack-top="-1"');
    expect(markup.match(/data-stack-slot-state="empty"/g)).toHaveLength(4);
    expect(markup).not.toContain('data-stack-marker="top"');
    expect(markup).toContain("空栈 · top = -1");
  });

  it("falls back to the narration string when the array is empty", () => {
    const markup = render(
      defaultSnap({
        array_values: [],
        active_indices: [],
        swap_indices: [],
        sorted_indices: [],
        pointers: {},
      }),
    );
    expect(markup).toContain("现在比较前两个元素"); // voiceover fallback
  });

  it("honours the light theme", () => {
    const dark = render(defaultSnap());
    const light = render(defaultSnap(), { theme: "light" });
    expect(dark).not.toBe(light); // visual diff between themes
    expect(light).toContain("var(--surface-2, #faf8f3)");
    expect(light).toContain("var(--canvas-focus, #b87824)");
    expect(light).not.toContain("#00896e");
    expect(light).not.toContain("#6030c0");
  });
});
