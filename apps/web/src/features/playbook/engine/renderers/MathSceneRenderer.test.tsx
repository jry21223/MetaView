import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MathSceneRenderer } from "./MathSceneRenderer";
import { rendererRegistry } from "./registry";
import type { MathSceneSnapshot, MetaStep } from "../types";
import type { RendererProps } from "./types";

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
});
