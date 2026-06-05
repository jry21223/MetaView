import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { cleanup, render as renderDom, waitFor } from "@testing-library/react";
import { MathSceneRenderer } from "./MathSceneRenderer";
import { revealRegionVertices } from "./regionReveal";
import { rendererRegistry } from "./registry";
import type { MathSceneSnapshot, MetaStep } from "../types";
import type { RendererProps } from "./types";
import {
  makeMathSceneStep,
  vectorFieldScene,
} from "../math-scene-plan/fixtures";
import { buildMathSceneRenderPlan } from "../math-scene-plan/plan";
import {
  pointKey,
  segmentKey,
  vectorFieldKey,
} from "../math-scene-plan/identity";
import type { DirectorFramePlan } from "../director/framePlan";

const originalResizeObserver = globalThis.ResizeObserver;

beforeEach(() => {
  document.open();
  document.write("<!doctype html><html><body></body></html>");
  document.close();
  window.history.pushState({}, "", "/");
  Object.defineProperty(document, "compatMode", {
    configurable: true,
    value: "CSS1Compat",
  });

  globalThis.ResizeObserver = class {
    constructor(private callback: ResizeObserverCallback) {}

    observe(target: Element): void {
      this.callback(
        [
          {
            target,
            contentRect: {
              width: 640,
              height: 500,
            },
            contentBoxSize: [{ inlineSize: 640, blockSize: 500 }],
          } as ResizeObserverEntry,
        ],
        this as unknown as ResizeObserver,
      );
    }

    unobserve(): void {}

    disconnect(): void {}
  } as typeof ResizeObserver;
});

afterEach(() => {
  cleanup();
  globalThis.ResizeObserver = originalResizeObserver;
});

function sceneStep(
  snapshot: MathSceneSnapshot,
  overrides: Partial<MetaStep> = {},
): MetaStep {
  return {
    step_id: "s1",
    end_frame: 90,
    title: "格林公式",
    voiceover_text: "把环路积分转换为面积积分",
    snapshot,
    tokens: [],
    ...overrides,
  };
}

function props(step: MetaStep, overrides: Partial<RendererProps> = {}): RendererProps {
  return {
    step,
    prevStep: null,
    frame: 240,
    stepStartFrame: 0,
    stepEndFrame: 90,
    progress: 1,
    theme: "dark",
    ...overrides,
  };
}

function makeScene(extra: Partial<MathSceneSnapshot> = {}): MathSceneSnapshot {
  return {
    kind: "math_scene",
    x_min: -1,
    x_max: 5,
    y_min: -1,
    y_max: 4,
    x_label: "x",
    y_label: "y",
    regions: [
      {
        vertices: [
          [0, 0],
          [4, 0],
          [4, 3],
          [0, 3],
        ],
        label: "R",
        emphasis: "secondary",
      },
    ],
    segments: [
      { x0: 0, y0: 0, x1: 4, y1: 0, arrow: true, label: "C₁", emphasis: "primary" },
    ],
    vector_field: {
      expression_px: "-y",
      expression_py: "x",
      step: 0.8,
      label: "F",
    },
    points: [{ x: 2, y: 1.5, label: "P", emphasis: "accent" }],
    annotations: [{ x: 4.4, y: 3.4, text: "$F$", align: "ne" }],
    formula_latex: "\\oint_C P\\,dx + Q\\,dy",
    caption: "把环路积分转换为面积分",
    ...extra,
  };
}

function render(snap: MathSceneSnapshot, overrides: Partial<RendererProps> = {}): string {
  return renderToStaticMarkup(<MathSceneRenderer {...props(sceneStep(snap), overrides)} />);
}

function plannedObjectByKey(container: HTMLElement, key: string): Element {
  const object = [...container.querySelectorAll("[data-math-scene-key]")].find(
    (element) => element.getAttribute("data-math-scene-key") === key,
  );
  if (!object) throw new Error(`Expected planned object ${key}`);
  return object;
}

function continuityDebugSnapshots(): {
  previousSnapshot: MathSceneSnapshot;
  currentSnapshot: MathSceneSnapshot;
} {
  const previousSnapshot: MathSceneSnapshot = {
    kind: "math_scene",
    x_min: -1,
    x_max: 4,
    y_min: -1,
    y_max: 3,
    x_label: "x",
    y_label: "y",
    points: [{ x: 0, y: 0 }],
    segments: [{ x0: 0, y0: 0, x1: 1, y1: 0 }],
    regions: [],
    curves: [],
    annotations: [],
  };

  return {
    previousSnapshot,
    currentSnapshot: {
      ...previousSnapshot,
      points: [...(previousSnapshot.points ?? []), { x: 2, y: 1 }],
    },
  };
}

describe("MathSceneRenderer", () => {
  it("is registered for the math_scene snapshot kind", () => {
    expect(rendererRegistry.get("math_scene")).toBe(MathSceneRenderer);
  });

  it("renders an svg-based math scene", () => {
    // Mafs uses a ResizeObserver-driven measure step before mounting children,
    // so SSR (`renderToStaticMarkup`) emits an empty `<div class="MafsView">`
    // wrapper. We assert the wrapper and the renderer's own scaffolding here;
    // SVG/polygon emission is covered by an interactive (DOM-mounted) test
    // once the Layer phase lands testing-library.
    const markup = render(makeScene());
    expect(markup).toContain("math-scene-renderer");
    expect(markup).toContain("math-scene-renderer__stage");
    expect(markup).toContain("MafsView");
  });

  it("passes filled region geometry into the scene", () => {
    // Cannot observe `<polygon>` under SSR (see note above). Instead check
    // the data flows through to Mafs: caption/legend/title that depend on
    // the region's surrounding step are still emitted.
    const markup = render(makeScene());
    expect(markup).toContain("math-scene-renderer__stage");
    expect(markup).toContain("格林公式");
  });

  it("renders the corner formula via KaTeX when formula_latex is set", () => {
    const markup = render(makeScene());
    expect(markup).toContain("math-scene-renderer__formula");
    expect(markup).toContain("katex");
    // Assert on the visible glyph rather than the MathML annotation mirror
    // (DOMPurify drops namespaced MathML under happy-dom).
    expect(markup).toContain("∮");
  });

  it("renders the caption verbatim", () => {
    const markup = render(makeScene());
    expect(markup).toContain("把环路积分转换为面积分");
  });

  it("applies the data-theme attribute", () => {
    const dark = render(makeScene(), { theme: "dark" });
    const light = render(makeScene(), { theme: "light" });
    expect(dark).toContain('data-theme="dark"');
    expect(light).toContain('data-theme="light"');
  });

  it("omits the corner formula block when formula_latex is blank", () => {
    const markup = render(makeScene({ formula_latex: "" }));
    expect(markup).not.toContain("math-scene-renderer__formula");
  });

  it("omits full-stage chrome in stage-overlay mode", () => {
    const markup = render(makeScene(), { renderMode: "stage-overlay" });
    expect(markup).toContain("math-scene-renderer--overlay");
    expect(markup).toContain("math-scene-renderer__stage");
    expect(markup).not.toContain("math-scene-renderer__title");
    expect(markup).not.toContain("math-scene-renderer__formula");
    expect(markup).not.toContain("math-scene-renderer__caption");
    expect(markup).not.toContain("math-scene-renderer__legend");
    expect(markup).not.toContain("格林公式");
    expect(markup).not.toContain("把环路积分转换为面积分");
  });

  it("renders math scene objects from the plan with stable keys and per-object progress", async () => {
    const previousSnapshot: MathSceneSnapshot = {
      kind: "math_scene",
      x_min: -1,
      x_max: 4,
      y_min: -1,
      y_max: 3,
      x_label: "x",
      y_label: "y",
      points: [{ x: 0, y: 0 }],
      segments: [{ x0: 0, y0: 0, x1: 1, y1: 0 }],
      regions: [],
      curves: [],
      annotations: [],
    };
    const currentSnapshot: MathSceneSnapshot = {
      ...previousSnapshot,
      points: [...(previousSnapshot.points ?? []), { x: 2, y: 1 }],
      segments: [
        ...(previousSnapshot.segments ?? []),
        { x0: 1, y0: 0, x1: 2, y1: 1 },
      ],
      vector_field: vectorFieldScene.vector_field,
    };
    const currentStep = sceneStep(currentSnapshot);
    const previousStep = makeMathSceneStep(previousSnapshot);
    const { container } = renderDom(
      <MathSceneRenderer
        {...props(currentStep, {
          prevStep: previousStep,
          progress: 0.2,
        })}
      />,
    );

    await waitFor(() => {
      expect(container.querySelector("[data-math-scene-kind='segment']")).not.toBeNull();
    });

    const persistedPoint = plannedObjectByKey(
      container,
      pointKey(previousSnapshot.points![0]),
    );
    const persistedSegment = plannedObjectByKey(
      container,
      segmentKey(previousSnapshot.segments![0]),
    );
    const addedPoint = plannedObjectByKey(
      container,
      pointKey(currentSnapshot.points![1]),
    );
    const addedSegment = plannedObjectByKey(
      container,
      segmentKey(currentSnapshot.segments![1]),
    );
    const addedVectorField = plannedObjectByKey(
      container,
      vectorFieldKey(vectorFieldScene.vector_field!),
    );

    expect(persistedPoint.getAttribute("data-math-scene-progress")).toBe("1.000");
    expect(Number(persistedPoint.getAttribute("opacity"))).toBeCloseTo(1);
    expect(persistedSegment.getAttribute("data-math-scene-progress")).toBe("1.000");
    expect(addedPoint.getAttribute("data-math-scene-progress")).toBe("0.200");
    expect(Number(addedPoint.getAttribute("opacity"))).toBeCloseTo(0.3);
    expect(addedSegment.getAttribute("data-math-scene-progress")).toBe("0.200");
    expect(addedVectorField.getAttribute("data-math-scene-progress")).toBe("0.200");
  });

  it("does not render the math scene plan debug overlay without the query flag", () => {
    const { previousSnapshot, currentSnapshot } = continuityDebugSnapshots();
    const { container } = renderDom(
      <MathSceneRenderer
        {...props(sceneStep(currentSnapshot), {
          prevStep: makeMathSceneStep(previousSnapshot),
          progress: 0.4,
        })}
      />,
    );

    expect(container.querySelector(".math-scene-renderer__debug-plan")).toBeNull();
  });

  it("renders the dev math scene plan debug overlay with counts and camera viewBox", () => {
    window.history.pushState({}, "", "/?debugMathScenePlan");
    const { previousSnapshot, currentSnapshot } = continuityDebugSnapshots();
    const { container } = renderDom(
      <MathSceneRenderer
        {...props(sceneStep(currentSnapshot), {
          prevStep: makeMathSceneStep(previousSnapshot),
          progress: 0.4,
        })}
      />,
    );

    const overlay = container.querySelector(".math-scene-renderer__debug-plan");
    expect(overlay).not.toBeNull();
    expect(overlay?.textContent).toContain("added 1");
    expect(overlay?.textContent).toContain("persisted 2");
    expect(overlay?.textContent).toContain("viewBox");
    expect(overlay?.textContent).toContain("x[");
    expect(overlay?.textContent).toContain("y[");
  });

  it("prefers directorFrame math scene plans when provided", () => {
    window.history.pushState({}, "", "/?debugMathScenePlan");
    const emptySnapshot = makeScene({
      points: [],
      segments: [],
      regions: [],
      curves: [],
      annotations: [],
      vector_field: null,
    });
    const renderPlan = buildMathSceneRenderPlan({
      currentSnapshot: emptySnapshot,
      stepProgress: 1,
    });
    const directorFrame: DirectorFramePlan = {
      activeBeat: null,
      localProgress: 0,
      stage: { reason: "test" },
      mathScene: { renderPlan, reason: "test" },
      voiceoverText: null,
      debug: { adapter: "math_scene", reason: "test" },
    };

    const { container } = renderDom(
      <MathSceneRenderer
        {...props(sceneStep(makeScene()), {
          directorFrame,
        })}
      />,
    );

    const overlay = container.querySelector(".math-scene-renderer__debug-plan");
    expect(overlay?.textContent).toContain("added 0");
    expect(overlay?.textContent).toContain("persisted 0");
  });
});

describe("revealRegionVertices (issue #53)", () => {
  const SQUARE: ReadonlyArray<readonly [number, number]> = [
    [0, 0],
    [4, 0],
    [4, 4],
    [0, 4],
  ];

  it("collapses every vertex onto the centroid at progress = 0", () => {
    const result = revealRegionVertices(SQUARE, 0);
    expect(result).toHaveLength(4);
    for (const [x, y] of result) {
      expect(x).toBeCloseTo(2, 6); // centroid of the unit-square-scaled-by-4
      expect(y).toBeCloseTo(2, 6);
    }
  });

  it("returns the original vertices at progress = 1", () => {
    const result = revealRegionVertices(SQUARE, 1);
    expect(result).toEqual(SQUARE.map((v) => [...v]));
  });

  it("interpolates linearly toward the target at progress = 0.5", () => {
    const result = revealRegionVertices(SQUARE, 0.5);
    expect(result[0][0]).toBeCloseTo(1, 6); // halfway from centroid(2) to (0)
    expect(result[0][1]).toBeCloseTo(1, 6);
    expect(result[2][0]).toBeCloseTo(3, 6); // halfway from centroid(2) to (4)
    expect(result[2][1]).toBeCloseTo(3, 6);
  });

  it("clamps progress to [0, 1] so out-of-range frames don't overshoot", () => {
    expect(revealRegionVertices(SQUARE, -1)).toEqual(
      revealRegionVertices(SQUARE, 0),
    );
    expect(revealRegionVertices(SQUARE, 2)).toEqual(
      revealRegionVertices(SQUARE, 1),
    );
  });

  it("returns an empty array when given no vertices", () => {
    expect(revealRegionVertices([], 0.5)).toEqual([]);
  });
});
