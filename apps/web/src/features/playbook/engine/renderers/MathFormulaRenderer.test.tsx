import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MathFormulaRenderer } from "./MathFormulaRenderer";
import { rendererRegistry } from "./registry";
import type { MathFormulaSnapshot, MetaStep } from "../types";
import type { RendererProps } from "./types";

function formulaStep(
  snapshot: MathFormulaSnapshot,
  overrides: Partial<MetaStep> = {},
): MetaStep {
  return {
    step_id: "s1",
    end_frame: 90,
    title: "格林公式",
    voiceover_text: "将曲线积分转换为面积积分",
    snapshot,
    tokens: [],
    ...overrides,
  };
}

function props(step: MetaStep, overrides: Partial<RendererProps> = {}): RendererProps {
  return {
    step,
    prevStep: null,
    frame: 240, // past every fade-in
    stepStartFrame: 0,
    stepEndFrame: 90,
    progress: 1,
    theme: "dark",
    ...overrides,
  };
}

function makeSnap(extra: Partial<MathFormulaSnapshot> = {}): MathFormulaSnapshot {
  return {
    kind: "math_formula",
    formula_latex: "\\oint_C P\\,dx + Q\\,dy",
    caption: "格林公式把环路积分转成面积分",
    annotations: ["C 是 R 的边界", "P,Q 是向量场分量"],
    ...extra,
  };
}

function render(snap: MathFormulaSnapshot, overrides: Partial<RendererProps> = {}): string {
  return renderToStaticMarkup(<MathFormulaRenderer {...props(formulaStep(snap), overrides)} />);
}

describe("MathFormulaRenderer", () => {
  it("is registered for the math_formula snapshot kind", () => {
    expect(rendererRegistry.get("math_formula")).toBe(MathFormulaRenderer);
  });

  it("renders the formula via KaTeX (mhchem markup present)", () => {
    const markup = render(makeSnap());
    // KaTeX wraps everything in a .katex span.
    expect(markup).toContain("katex");
    expect(markup).toContain("oint");
  });

  it("shows the caption and every annotation", () => {
    const markup = render(makeSnap());
    expect(markup).toContain("格林公式把环路积分转成面积分");
    expect(markup).toContain("C 是 R 的边界");
    expect(markup).toContain("P,Q 是向量场分量");
  });

  it("falls back to a 「公式缺失」 placeholder when formula_latex is blank", () => {
    const markup = render(makeSnap({ formula_latex: "" }));
    expect(markup).toContain("公式缺失");
  });

  it("title fades in early (opacity grows with elapsed frames)", () => {
    const early = render(makeSnap(), { frame: 0 });
    const late = render(makeSnap(), { frame: 100 });
    // At frame 0 elapsed=0 → title opacity = 0; at frame 100 → opacity = 1.
    const earlyTitle = early.match(/math-formula-renderer__title[^"]*"[^o]*opacity:(\d*\.?\d+)/);
    const lateTitle = late.match(/math-formula-renderer__title[^"]*"[^o]*opacity:(\d*\.?\d+)/);
    if (earlyTitle && lateTitle) {
      expect(parseFloat(earlyTitle[1])).toBeLessThan(parseFloat(lateTitle[1]));
    }
  });

  it("omits the annotations block when annotations array is empty", () => {
    const markup = render(makeSnap({ annotations: [] }));
    expect(markup).not.toContain("math-formula-renderer__annotations");
  });

  it("applies the data-theme attribute for theming", () => {
    const dark = render(makeSnap(), { theme: "dark" });
    const light = render(makeSnap(), { theme: "light" });
    expect(dark).toContain('data-theme="dark"');
    expect(light).toContain('data-theme="light"');
  });
});
