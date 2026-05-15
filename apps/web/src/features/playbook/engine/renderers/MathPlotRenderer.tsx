import React from "react";
import "katex/dist/katex.min.css";
import type { MathPlotSnapshot } from "../types";
import type { RendererProps } from "./types";
import {
  compileExpr,
  sampleExpr,
  type CompiledExpr,
  type SamplePoint,
} from "../../../../shared/lib/mathExpr";
import { autoYBounds, fmtNum, niceTicks, padRange } from "../../../../shared/lib/plotMath";
import { sanitizeKatex } from "../../../../shared/lib/sanitizeKatex";
import { clamp01 } from "../foundation";

// ── Theme ──────────────────────────────────────────────────────────────────

interface MathPalette {
  bg: string;
  plotBg: string;
  grid: string;
  axis: string;
  axisLabel: string;
  tick: string;
  text: string;
  narration: string;
  card: string;
  cardBorder: string;
  curvePrimary: readonly string[];
  curveSecondary: string;
  curveAccent: string;
  marker: string;
  markerGlow: string;
  shade: string;
  shadeStroke: string;
}

const PALETTE: Record<"dark" | "light", MathPalette> = {
  dark: {
    bg: "#0a0c10",
    plotBg: "rgba(255,255,255,0.02)",
    grid: "rgba(255,255,255,0.07)",
    axis: "rgba(255,255,255,0.32)",
    axisLabel: "rgba(232,236,244,0.7)",
    tick: "rgba(232,236,244,0.45)",
    text: "#e8ecf4",
    narration: "rgba(232,236,244,0.62)",
    card: "rgba(255,255,255,0.06)",
    cardBorder: "rgba(255,255,255,0.10)",
    curvePrimary: ["#4de8b0", "#7db8ff", "#ffd84d"],
    curveSecondary: "rgba(200,168,248,0.9)",
    curveAccent: "#ff9e8a",
    marker: "#ffd84d",
    markerGlow: "rgba(255,216,77,0.55)",
    shade: "rgba(77,232,176,0.20)",
    shadeStroke: "rgba(77,232,176,0.5)",
  },
  light: {
    bg: "#f5f7fa",
    plotBg: "rgba(0,0,0,0.015)",
    grid: "rgba(0,0,0,0.08)",
    axis: "rgba(0,0,0,0.4)",
    axisLabel: "rgba(20,24,32,0.65)",
    tick: "rgba(20,24,32,0.5)",
    text: "#141820",
    narration: "rgba(20,24,32,0.6)",
    card: "rgba(0,0,0,0.04)",
    cardBorder: "rgba(0,0,0,0.10)",
    curvePrimary: ["#0a8f6e", "#2563c0", "#b07d00"],
    curveSecondary: "rgba(96,48,192,0.85)",
    curveAccent: "#c05030",
    marker: "#b07d00",
    markerGlow: "rgba(176,125,0,0.4)",
    shade: "rgba(10,143,110,0.16)",
    shadeStroke: "rgba(10,143,110,0.45)",
  },
};

// ── Geometry (virtual SVG coordinate space) ───────────────────────────────

const SVG_W = 1000;
const SVG_H = 560;
const MARGIN = { top: 20, right: 28, bottom: 40, left: 56 };
const PLOT_W = SVG_W - MARGIN.left - MARGIN.right;
const PLOT_H = SVG_H - MARGIN.top - MARGIN.bottom;
const SAMPLES = 360;
const SHADE_SAMPLES = 96;

// ── Helpers ────────────────────────────────────────────────────────────────

/** Split a sample list into contiguous runs of finite-y points (breaks at NaN). */
function toSegments(pts: SamplePoint[]): SamplePoint[][] {
  const segments: SamplePoint[][] = [];
  let current: SamplePoint[] = [];
  for (const p of pts) {
    if (Number.isFinite(p.y)) {
      current.push(p);
    } else if (current.length) {
      segments.push(current);
      current = [];
    }
  }
  if (current.length) segments.push(current);
  return segments;
}

function curveColor(
  colors: MathPalette,
  emphasis: string | undefined,
  primaryIndex: number,
): string {
  if (emphasis === "secondary") return colors.curveSecondary;
  if (emphasis === "accent") return colors.curveAccent;
  return colors.curvePrimary[primaryIndex % colors.curvePrimary.length];
}

interface CompiledCurve {
  expression: string;
  label: string | null | undefined;
  emphasis: string | undefined;
  fn: CompiledExpr | null;
  points: SamplePoint[];
  primaryIndex: number;
}

// ── Component ──────────────────────────────────────────────────────────────

export const MathPlotRenderer: React.FC<RendererProps> = ({ step, frame, stepStartFrame, progress, theme }) => {
  const snap = step.snapshot as MathPlotSnapshot;
  const colors = PALETTE[theme];

  // Spring-driven `progress` can briefly overshoot; for time-fades use raw elapsed.
  const elapsed = Math.max(0, frame - stepStartFrame);
  const titleOpacity = clamp01(elapsed / 8);
  const narrationOpacity = clamp01((elapsed - 6) / 10);
  const reveal = clamp01(progress);

  const xMin = snap.x_min;
  const xMax = snap.x_max;

  const compiled = React.useMemo<CompiledCurve[]>(() => {
    let primaryCount = 0;
    return (snap.curves ?? []).map((c) => {
      let fn: CompiledExpr | null = null;
      try {
        fn = compileExpr(c.expression);
      } catch {
        fn = null;
      }
      const isPrimary = c.emphasis !== "secondary" && c.emphasis !== "accent";
      const primaryIndex = isPrimary ? primaryCount++ : 0;
      return {
        expression: c.expression,
        label: c.label,
        emphasis: c.emphasis,
        fn,
        points: fn ? sampleExpr(fn, xMin, xMax, SAMPLES, snap.params) : [],
        primaryIndex,
      };
    });
  }, [snap.curves, snap.params, xMin, xMax]);

  const drawable = compiled.filter((c) => c.points.length > 0);

  // Resolve the visible y-range.
  let yMin = snap.y_min ?? null;
  let yMax = snap.y_max ?? null;
  if (yMin == null || yMax == null) {
    const ys: number[] = [];
    for (const c of drawable) for (const p of c.points) if (Number.isFinite(p.y)) ys.push(p.y);
    const [lo, hi] = padRange(...autoYBounds(ys));
    if (yMin == null) yMin = lo;
    if (yMax == null) yMax = hi;
  }
  if (!(yMin < yMax) || !Number.isFinite(yMin) || !Number.isFinite(yMax)) {
    yMin = -10;
    yMax = 10;
  }
  const yLo = yMin;
  const yHi = yMax;

  const sx = (x: number) => MARGIN.left + ((x - xMin) / (xMax - xMin)) * PLOT_W;
  const sy = (y: number) => MARGIN.top + ((yHi - y) / (yHi - yLo)) * PLOT_H;

  const pointsToPath = (pts: SamplePoint[]): string =>
    pts.map((p) => `${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(" ");

  const xTicks = niceTicks(xMin, xMax, 8);
  const yTicks = niceTicks(yLo, yHi, 7);
  const hasXAxis = yLo < 0 && yHi > 0;
  const hasYAxis = xMin < 0 && xMax > 0;
  const axisYPx = hasXAxis ? sy(0) : MARGIN.top + PLOT_H;
  const axisXPx = hasYAxis ? sx(0) : MARGIN.left;
  const baselineY = yLo < 0 && yHi > 0 ? 0 : Math.max(yLo, Math.min(yHi, 0));

  // First drawable curve drives the marker and the shaded region.
  const lead = drawable.find((c) => c.fn) ?? null;

  // Shaded area under the lead curve.
  let shadePath: string | null = null;
  if (
    lead?.fn &&
    snap.shade_from != null &&
    snap.shade_to != null &&
    snap.shade_to > snap.shade_from
  ) {
    const shadeReveal = clamp01((reveal - 0.15) / 0.85);
    const right = snap.shade_from + (snap.shade_to - snap.shade_from) * shadeReveal;
    if (right > snap.shade_from + 1e-9) {
      const top = sampleExpr(lead.fn, snap.shade_from, right, SHADE_SAMPLES, snap.params).filter((p) =>
        Number.isFinite(p.y),
      );
      if (top.length >= 2) {
        const coords = [
          `${sx(snap.shade_from).toFixed(1)},${sy(baselineY).toFixed(1)}`,
          ...top.map((p) => `${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`),
          `${sx(right).toFixed(1)},${sy(baselineY).toFixed(1)}`,
        ];
        shadePath = coords.join(" ");
      }
    }
  }

  // Point marker on the lead curve.
  let marker: { px: number; py: number; mx: number; my: number; opacity: number } | null = null;
  if (lead?.fn && snap.marker_x != null) {
    const my = lead.fn({ ...(snap.params ?? {}), x: snap.marker_x });
    if (Number.isFinite(my)) {
      const xFrac = (snap.marker_x - xMin) / (xMax - xMin);
      const opacity = clamp01((reveal - Math.min(0.85, xFrac)) * 6);
      if (opacity > 0) {
        marker = { px: sx(snap.marker_x), py: sy(my), mx: snap.marker_x, my, opacity };
      }
    }
  }

  const formulaHtml = React.useMemo(() => {
    if (!snap.formula_latex || !snap.formula_latex.trim()) return null;
    const html = sanitizeKatex(snap.formula_latex);
    return html || null;
  }, [snap.formula_latex]);

  const empty = drawable.length === 0;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: colors.bg,
        display: "flex",
        flexDirection: "column",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      {/* Header: step title + KaTeX formula card */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          padding: "12px 22px 4px",
        }}
      >
        <h2
          style={{
            color: colors.text,
            fontSize: 19,
            fontWeight: 700,
            margin: 0,
            opacity: titleOpacity,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {step.title}
        </h2>
        {formulaHtml && (
          <div
            style={{
              flexShrink: 0,
              padding: "6px 12px",
              background: colors.card,
              border: `1px solid ${colors.cardBorder}`,
              borderRadius: 8,
              color: colors.text,
              fontSize: 16,
              lineHeight: 1.2,
              opacity: titleOpacity,
            }}
            dangerouslySetInnerHTML={{ __html: formulaHtml }}
          />
        )}
      </div>

      {/* Plot */}
      <div style={{ flex: 1, minHeight: 0, padding: "0 12px" }}>
        {empty ? (
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: colors.narration,
              fontSize: 16,
              textAlign: "center",
              padding: "0 40px",
            }}
          >
            {step.voiceover_text || "无法绘制该函数"}
          </div>
        ) : (
          <svg
            viewBox={`0 0 ${SVG_W} ${SVG_H}`}
            preserveAspectRatio="xMidYMid meet"
            width="100%"
            height="100%"
            style={{ display: "block" }}
          >
            <defs>
              <clipPath id="mv-plot-clip">
                <rect x={MARGIN.left} y={MARGIN.top} width={PLOT_W} height={PLOT_H} />
              </clipPath>
            </defs>

            {/* Plot background */}
            <rect
              x={MARGIN.left}
              y={MARGIN.top}
              width={PLOT_W}
              height={PLOT_H}
              fill={colors.plotBg}
            />

            {/* Grid lines */}
            {xTicks.map((t) => (
              <line
                key={`gx-${t}`}
                x1={sx(t)}
                y1={MARGIN.top}
                x2={sx(t)}
                y2={MARGIN.top + PLOT_H}
                stroke={colors.grid}
                strokeWidth={1}
              />
            ))}
            {yTicks.map((t) => (
              <line
                key={`gy-${t}`}
                x1={MARGIN.left}
                y1={sy(t)}
                x2={MARGIN.left + PLOT_W}
                y2={sy(t)}
                stroke={colors.grid}
                strokeWidth={1}
              />
            ))}

            {/* Axes */}
            <line
              x1={MARGIN.left}
              y1={axisYPx}
              x2={MARGIN.left + PLOT_W}
              y2={axisYPx}
              stroke={colors.axis}
              strokeWidth={1.6}
            />
            <line
              x1={axisXPx}
              y1={MARGIN.top}
              x2={axisXPx}
              y2={MARGIN.top + PLOT_H}
              stroke={colors.axis}
              strokeWidth={1.6}
            />
            <text
              x={MARGIN.left + PLOT_W - 4}
              y={axisYPx - 8}
              textAnchor="end"
              fontSize={14}
              fill={colors.axisLabel}
              fontStyle="italic"
            >
              {snap.x_label || "x"}
            </text>
            <text
              x={axisXPx + 10}
              y={MARGIN.top + 14}
              fontSize={14}
              fill={colors.axisLabel}
              fontStyle="italic"
            >
              {snap.y_label || "y"}
            </text>

            {/* Tick labels */}
            {xTicks.map((t) =>
              t === 0 && hasYAxis ? null : (
                <text
                  key={`tx-${t}`}
                  x={sx(t)}
                  y={axisYPx + 16}
                  textAnchor="middle"
                  fontSize={12}
                  fill={colors.tick}
                >
                  {fmtNum(t)}
                </text>
              ),
            )}
            {yTicks.map((t) =>
              t === 0 ? null : (
                <text
                  key={`ty-${t}`}
                  x={axisXPx - 8}
                  y={sy(t) + 4}
                  textAnchor="end"
                  fontSize={12}
                  fill={colors.tick}
                >
                  {fmtNum(t)}
                </text>
              ),
            )}

            {/* Clipped layer: shaded region + curves + marker */}
            <g clipPath="url(#mv-plot-clip)">
              {shadePath && (
                <polygon
                  points={shadePath}
                  fill={colors.shade}
                  stroke={colors.shadeStroke}
                  strokeWidth={1.4}
                />
              )}

              {drawable.map((c, ci) => {
                const stroke = curveColor(colors, c.emphasis, c.primaryIndex);
                const isSecondary = c.emphasis === "secondary";
                const shown = c.points.slice(0, Math.max(2, Math.ceil(c.points.length * reveal)));
                const segments = toSegments(shown);
                const lastFinite = [...shown].reverse().find((p) => Number.isFinite(p.y));
                return (
                  <g key={`curve-${ci}`}>
                    {segments.map((seg, si) => (
                      <polyline
                        key={si}
                        points={pointsToPath(seg)}
                        fill="none"
                        stroke={stroke}
                        strokeWidth={c.emphasis === "accent" ? 3.4 : 3}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeDasharray={isSecondary ? "7 5" : undefined}
                        opacity={isSecondary ? 0.85 : 1}
                      />
                    ))}
                    {c.label && lastFinite && (
                      <text
                        x={sx(lastFinite.x) + 8}
                        y={sy(lastFinite.y) - 6}
                        fontSize={13}
                        fontWeight={600}
                        fill={stroke}
                      >
                        {c.label}
                      </text>
                    )}
                  </g>
                );
              })}

              {marker && (
                <g opacity={marker.opacity}>
                  <line
                    x1={marker.px}
                    y1={marker.py}
                    x2={marker.px}
                    y2={axisYPx}
                    stroke={colors.marker}
                    strokeWidth={1.4}
                    strokeDasharray="4 4"
                  />
                  <circle r={9} cx={marker.px} cy={marker.py} fill={colors.markerGlow} />
                  <circle r={5} cx={marker.px} cy={marker.py} fill={colors.marker} />
                </g>
              )}
            </g>

            {/* Marker coordinate label (outside the clip so it can sit near the edge) */}
            {marker && (
              <text
                x={Math.min(marker.px + 12, MARGIN.left + PLOT_W - 4)}
                y={Math.max(marker.py - 12, MARGIN.top + 12)}
                fontSize={13}
                fontWeight={600}
                fill={colors.marker}
                opacity={marker.opacity}
                textAnchor={marker.px > MARGIN.left + PLOT_W - 80 ? "end" : "start"}
              >
                ({fmtNum(marker.mx)}, {fmtNum(marker.my)})
              </text>
            )}
          </svg>
        )}
      </div>

      {/* Narration line */}
      <div
        style={{
          padding: "2px 24px 10px",
          textAlign: "center",
          color: colors.narration,
          fontSize: 14,
          lineHeight: 1.5,
          opacity: narrationOpacity,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {step.voiceover_text}
      </div>
    </div>
  );
};
