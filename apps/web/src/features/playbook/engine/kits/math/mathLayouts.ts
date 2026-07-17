import { resolveAssetByRole, resolveAssetForRenderer } from "../../assets/assetResolver";
import type { MathPlotCurve, MathPlotSnapshot } from "../../types";

const DEFAULT_MATH_PACK_ID = "math-basic";

export type MathPlotCurveInput = {
  expression: string;
  label?: string | null;
  emphasis?: string;
  semanticRole?: string;
  semantic_role?: string;
};

export type MathPlotLayoutInput = {
  packId?: string;
  assetId?: string | null;
  asset_id?: string | null;
  curves?: MathPlotCurveInput[];
  params?: Record<string, number>;
  xMin?: number;
  x_min?: number;
  xMax?: number;
  x_max?: number;
  yMin?: number | null;
  y_min?: number | null;
  yMax?: number | null;
  y_max?: number | null;
  markerX?: number | null;
  marker_x?: number | null;
  shadeFrom?: number | null;
  shade_from?: number | null;
  shadeTo?: number | null;
  shade_to?: number | null;
  xLabel?: string;
  x_label?: string;
  yLabel?: string;
  y_label?: string;
  formulaLatex?: string | null;
  formula_latex?: string | null;
  caption?: string;
};

function resolveMathAssetId(packId: string): string | undefined {
  return (
    resolveAssetForRenderer("math_plot", "tangent", packId)?.id ??
    resolveAssetByRole("math", "tangent", packId)?.id ??
    resolveAssetForRenderer("math_plot", "derivative", packId)?.id ??
    resolveAssetByRole("math", "derivative", packId)?.id ??
    resolveAssetForRenderer("math_plot", "plot", packId)?.id ??
    resolveAssetByRole("math", "plot", packId)?.id
  );
}

function numberOr(value: number | null | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function nullableNumber(value: number | null | undefined): number | null | undefined {
  if (value === null) return null;
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function compileCurve(input: MathPlotCurveInput): MathPlotCurve {
  return {
    expression: input.expression,
    label: input.label,
    emphasis: input.emphasis,
    semantic_role: input.semanticRole ?? input.semantic_role,
  };
}

export function compileMathPlotLayout(input: MathPlotLayoutInput): MathPlotSnapshot {
  const packId = input.packId ?? DEFAULT_MATH_PACK_ID;
  const curves = input.curves?.length
    ? input.curves.map(compileCurve)
    : [
        { expression: "x^2", label: "f(x)=x^2", emphasis: "primary", semantic_role: "curve" },
        { expression: "2*x - 1", label: "tangent slope = 2", emphasis: "accent", semantic_role: "tangent" },
      ];

  return {
    kind: "math_plot",
    pack_id: packId,
    asset_id: input.assetId ?? input.asset_id ?? resolveMathAssetId(packId),
    curves,
    params: input.params,
    x_min: numberOr(input.xMin ?? input.x_min, -1),
    x_max: numberOr(input.xMax ?? input.x_max, 3),
    y_min: nullableNumber(input.yMin ?? input.y_min) ?? -1,
    y_max: nullableNumber(input.yMax ?? input.y_max) ?? 5,
    marker_x: nullableNumber(input.markerX ?? input.marker_x) ?? 1,
    shade_from: nullableNumber(input.shadeFrom ?? input.shade_from) ?? 0.85,
    shade_to: nullableNumber(input.shadeTo ?? input.shade_to) ?? 1.15,
    x_label: input.xLabel ?? input.x_label ?? "x",
    y_label: input.yLabel ?? input.y_label ?? "f(x)",
    formula_latex: input.formulaLatex ?? input.formula_latex ?? "f'(1)=2",
    caption: input.caption ?? "The derivative at x=1 is the slope of the tangent line.",
  };
}
