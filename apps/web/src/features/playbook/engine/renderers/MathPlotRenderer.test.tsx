import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MathPlotRenderer } from "./MathPlotRenderer";
import { rendererRegistry } from "./registry";
import type { MathPlotSnapshot, MetaStep } from "../types";
import type { RendererProps } from "./types";

function plotStep(snapshot: MathPlotSnapshot, overrides: Partial<MetaStep> = {}): MetaStep {
  return {
    step_id: "s1",
    end_frame: 90,
    title: "画出曲线",
    voiceover_text: "先画出 f(x) = x 的平方",
    snapshot,
    tokens: [],
    ...overrides,
  };
}

function props(step: MetaStep, overrides: Partial<RendererProps> = {}): RendererProps {
  return {
    step,
    prevStep: null,
    frame: 240, // past header fade-ins
    stepStartFrame: 0,
    stepEndFrame: 90,
    progress: 1,
    theme: "dark",
    ...overrides,
  };
}

function makeSnap(extra: Partial<MathPlotSnapshot> = {}): MathPlotSnapshot {
  return {
    kind: "math_plot",
    curves: [{ expression: "x^2", label: "f(x)", emphasis: "primary" }],
    x_min: -3,
    x_max: 3,
    x_label: "x",
    y_label: "y",
    ...extra,
  };
}

function render(snap: MathPlotSnapshot, overrides: Partial<RendererProps> = {}): string {
  return renderToStaticMarkup(<MathPlotRenderer {...props(plotStep(snap), overrides)} />);
}

function firstPolylinePointCount(markup: string): number {
  const m = markup.match(/<polyline[^>]*points="([^"]*)"/);
  if (!m) return 0;
  return m[1].trim().split(/\s+/).filter(Boolean).length;
}

describe("MathPlotRenderer", () => {
  it("is registered for the math_plot snapshot kind", () => {
    expect(rendererRegistry.get("math_plot")).toBe(MathPlotRenderer);
  });

  it("draws an SVG plot with the curve as a polyline", () => {
    const markup = render(makeSnap());
    expect(markup).toContain("<svg");
    expect(markup).toContain("<polyline");
    expect(firstPolylinePointCount(markup)).toBeGreaterThan(100);
  });

  it("labels the curve and shows the narration text", () => {
    const markup = render(makeSnap());
    expect(markup).toContain("f(x)");
    expect(markup).toContain("先画出 f(x) = x 的平方");
  });

  it("renders the KaTeX formula when formula_latex is provided", () => {
    const markup = render(makeSnap({ formula_latex: "f(x) = x^2" }));
    expect(markup).toContain("katex");
  });

  it("reveals the curve progressively with step progress", () => {
    const full = firstPolylinePointCount(render(makeSnap(), { progress: 1 }));
    const partial = firstPolylinePointCount(render(makeSnap(), { progress: 0.25 }));
    expect(partial).toBeGreaterThan(1);
    expect(partial).toBeLessThan(full);
  });

  it("shades the area under the curve when shade bounds are set", () => {
    const markup = render(makeSnap({ shade_from: 0, shade_to: 2 }));
    expect(markup).toContain("<polygon");
  });

  it("draws a point marker with its coordinates", () => {
    const markup = render(makeSnap({ marker_x: 2 }));
    expect(markup).toContain("<circle");
    expect(markup).toContain("(2, 4)");
  });

  it("uses runtime params when sampling parameterized curves", () => {
    const markup = render(
      makeSnap({
        curves: [{ expression: "a*x", label: "f(x)", emphasis: "primary" }],
        marker_x: 2,
        params: { a: 2 },
      }),
    );
    expect(markup).toContain("<polyline");
    expect(markup).toContain("(2, 4)");
  });

  it("breaks the path at discontinuities (1/x has two branches)", () => {
    const markup = render(makeSnap({ curves: [{ expression: "1/x" }], x_min: -2, x_max: 2 }));
    const polylines = markup.match(/<polyline/g) ?? [];
    expect(polylines.length).toBeGreaterThanOrEqual(2);
  });

  it("honours the light theme", () => {
    const markup = renderToStaticMarkup(
      <MathPlotRenderer {...props(plotStep(makeSnap()), { theme: "light" })} />,
    );
    expect(markup).toContain("#f5f7fa");
  });

  it("falls back to a message when no curve is drawable", () => {
    const markup = render(makeSnap({ curves: [{ expression: "1 +" }] }));
    expect(markup).not.toContain("<svg");
    expect(markup).toContain("先画出 f(x) = x 的平方");
  });

  it("keeps drawing the valid curves when one expression is malformed", () => {
    const markup = render(
      makeSnap({ curves: [{ expression: "x^2", label: "g" }, { expression: ")(" }] }),
    );
    expect(markup).toContain("<svg");
    expect(markup).toContain(">g<");
  });

  it("renders multiple primary curves with distinct colors", () => {
    const markup = render(
      makeSnap({
        curves: [
          { expression: "x^2", label: "a", emphasis: "primary" },
          { expression: "-x^2 + 4", label: "b", emphasis: "primary" },
        ],
      }),
    );
    expect(markup).toContain("#4de8b0");
    expect(markup).toContain("#7db8ff");
  });

  it("shade top edge shares every interior x with the curve polyline (issue #44)", () => {
    const markup = render(
      makeSnap({
        shade_from: -2,
        shade_to: 2,
      }),
    );
    const curveMatch = markup.match(/<polyline[^>]*points="([^"]*)"/);
    const polyMatch = markup.match(/<polygon[^>]*points="([^"]*)"/);
    expect(curveMatch, "expected a <polyline> for the curve").toBeTruthy();
    expect(polyMatch, "expected a <polygon> for the shade").toBeTruthy();

    const curvePts = new Set(curveMatch![1].trim().split(/\s+/).filter(Boolean));
    const shadePts = polyMatch![1].trim().split(/\s+/).filter(Boolean);
    // Trim baseline endpoints — first and last shade vertices sit on the
    // x-axis baseline and are not on the curve.
    const interior = shadePts.slice(1, -1);
    // Every interior shade vertex MUST coincide with a curve sample; this is
    // what eliminates the 2–3px seam. We allow a small remainder because the
    // shade adds exact endpoints at shade_from / shade_to that the curve
    // doesn't hit exactly (sampled on a different grid).
    const sharedCount = interior.filter((p) => curvePts.has(p)).length;
    expect(sharedCount).toBeGreaterThan(interior.length - 4);
  });
});
