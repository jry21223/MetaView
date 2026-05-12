/**
 * Preset scenarios for the interactive Math Widget.
 *
 * Each preset declares a set of parameters (mapped to draggable sliders), one or
 * more curve expressions in `x` plus those parameters (evaluated via
 * `shared/lib/mathExpr`), an optional point marker, and a function that renders
 * a live KaTeX formula reflecting the current parameter values.
 */

import { fmtNum } from "../../../shared/lib/plotMath";

export type CurveEmphasis = "primary" | "secondary" | "accent";

export interface MathWidgetParam {
  /** Variable name used inside curve / marker expressions — must be ASCII letters. */
  key: string;
  /** Human-facing label (may include unicode, e.g. "振幅 A"). */
  label: string;
  min: number;
  max: number;
  step: number;
  /** Initial value. */
  initial: number;
}

export interface MathWidgetCurve {
  /** Expression in `x` and the preset's parameter keys, e.g. `"a*sin(b*x + c)"`. */
  expression: string;
  label: string;
  emphasis?: CurveEmphasis;
}

export interface MathWidgetPreset {
  id: string;
  name: string;
  description: string;
  params: MathWidgetParam[];
  curves: MathWidgetCurve[];
  xRange: [number, number];
  /** Fixed y-range; omit to auto-fit. */
  yRange?: [number, number];
  /** x-coordinate of a point marker (expression in the parameter keys), placed on the first curve. */
  markerX?: string;
  /** Renders the live KaTeX source for the current parameter values. */
  formula: (params: Record<string, number>) => string;
  /** Optional extra readouts (e.g. "斜率 = 3") shown under the formula. */
  readouts?: (params: Record<string, number>) => string[];
}

// ── small KaTeX-string helpers ─────────────────────────────────────────────

/** Leading coefficient × variable: omits ±1, drops zero terms. */
function lead(coef: number, varStr: string): string {
  if (coef === 0) return "";
  if (coef === 1) return varStr;
  if (coef === -1) return `-${varStr}`;
  return `${fmtNum(coef)}${varStr}`;
}

/** Append ` + c` / ` - |c|` (nothing when c is 0). */
function addConst(c: number): string {
  if (c === 0) return "";
  return c > 0 ? ` + ${fmtNum(c)}` : ` - ${fmtNum(Math.abs(c))}`;
}

/** `(x - h)` with the sign folded in, e.g. h=2 → `(x - 2)`, h=-3 → `(x + 3)`. */
function shifted(varStr: string, h: number): string {
  if (h === 0) return varStr;
  return h > 0 ? `(${varStr} - ${fmtNum(h)})` : `(${varStr} + ${fmtNum(Math.abs(h))})`;
}

// ── presets ────────────────────────────────────────────────────────────────

export const MATH_WIDGET_PRESETS: MathWidgetPreset[] = [
  {
    id: "line",
    name: "一次函数",
    description: "y = a·x + b —— 斜率与截距如何决定一条直线。",
    params: [
      { key: "a", label: "斜率 a", min: -5, max: 5, step: 0.1, initial: 1 },
      { key: "b", label: "截距 b", min: -6, max: 6, step: 0.1, initial: 0 },
    ],
    curves: [{ expression: "a*x + b", label: "y", emphasis: "primary" }],
    xRange: [-8, 8],
    yRange: [-8, 8],
    markerX: "0",
    formula: (p) => {
      const body = `${lead(p.a, "x") || "0"}${addConst(p.b)}`;
      return `y = ${body}`;
    },
    readouts: (p) => [`斜率 = ${fmtNum(p.a)}`, `y 轴截距 = (0, ${fmtNum(p.b)})`],
  },
  {
    id: "parabola",
    name: "抛物线（顶点式）",
    description: "y = a(x − h)² + k —— 开口、平移与顶点。",
    params: [
      { key: "a", label: "开口 a", min: -3, max: 3, step: 0.1, initial: 1 },
      { key: "h", label: "横移 h", min: -5, max: 5, step: 0.1, initial: 0 },
      { key: "k", label: "纵移 k", min: -5, max: 5, step: 0.1, initial: 0 },
    ],
    curves: [{ expression: "a*(x - h)^2 + k", label: "f(x)", emphasis: "primary" }],
    xRange: [-8, 8],
    markerX: "h",
    formula: (p) => `y = ${lead(p.a, `${shifted("x", p.h)}^2`) || "0"}${addConst(p.k)}`,
    readouts: (p) => [`顶点 = (${fmtNum(p.h)}, ${fmtNum(p.k)})`, p.a >= 0 ? "开口向上" : "开口向下"],
  },
  {
    id: "sine",
    name: "正弦波",
    description: "y = A·sin(ω·x + φ) —— 振幅、频率与相位。",
    params: [
      { key: "a", label: "振幅 A", min: 0, max: 4, step: 0.1, initial: 1 },
      { key: "b", label: "角频率 ω", min: 0.2, max: 4, step: 0.1, initial: 1 },
      { key: "c", label: "相位 φ", min: -3.14, max: 3.14, step: 0.05, initial: 0 },
    ],
    curves: [{ expression: "a*sin(b*x + c)", label: "y", emphasis: "primary" }],
    xRange: [-6.5, 6.5],
    yRange: [-4.5, 4.5],
    formula: (p) =>
      `y = ${fmtNum(p.a)}\\sin(${fmtNum(p.b)}x${p.c >= 0 ? ` + ${fmtNum(p.c)}` : ` - ${fmtNum(Math.abs(p.c))}`})`,
    readouts: (p) => [
      `周期 = 2π / ω ≈ ${fmtNum((2 * Math.PI) / p.b)}`,
      `值域 = [−${fmtNum(p.a)}, ${fmtNum(p.a)}]`,
    ],
  },
  {
    id: "circle",
    name: "圆 x² + y² = r²",
    description: "用上、下两个半圆呈现 —— 半径如何缩放整条曲线。",
    params: [{ key: "r", label: "半径 r", min: 0.5, max: 6, step: 0.1, initial: 3 }],
    curves: [
      { expression: "sqrt(r^2 - x^2)", label: "上半圆", emphasis: "primary" },
      { expression: "-sqrt(r^2 - x^2)", label: "下半圆", emphasis: "secondary" },
    ],
    xRange: [-7, 7],
    yRange: [-7, 7],
    markerX: "r",
    formula: (p) => `x^2 + y^2 = ${fmtNum(p.r)}^2 = ${fmtNum(p.r * p.r)}`,
    readouts: (p) => [`周长 = 2πr ≈ ${fmtNum(2 * Math.PI * p.r)}`, `面积 = πr² ≈ ${fmtNum(Math.PI * p.r * p.r)}`],
  },
  {
    id: "derivative",
    name: "导数与切线",
    description: "拖动 x₀，观察 f(x) = x²/2 在该点的切线，斜率 = f′(x₀) = x₀。",
    params: [{ key: "a", label: "切点 x₀", min: -5, max: 5, step: 0.1, initial: 1.5 }],
    curves: [
      { expression: "0.5*x^2", label: "f(x) = x²/2", emphasis: "primary" },
      { expression: "a*x - 0.5*a^2", label: "切线", emphasis: "accent" },
    ],
    xRange: [-6, 6],
    yRange: [-2, 12],
    markerX: "a",
    formula: (p) => `f'(${fmtNum(p.a)}) = ${fmtNum(p.a)}`,
    readouts: (p) => [
      `切点 = (${fmtNum(p.a)}, ${fmtNum(0.5 * p.a * p.a)})`,
      `切线: y = ${lead(p.a, "x") || "0"}${addConst(-0.5 * p.a * p.a)}`,
    ],
  },
];

export function getPreset(id: string): MathWidgetPreset | undefined {
  return MATH_WIDGET_PRESETS.find((p) => p.id === id);
}

/** Build the initial parameter scope for a preset. */
export function initialParams(preset: MathWidgetPreset): Record<string, number> {
  return Object.fromEntries(preset.params.map((p) => [p.key, p.initial]));
}
