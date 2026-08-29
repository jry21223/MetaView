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
import { THEME_PALETTE } from "../../../../shared/config/themePalette";
import { MATH_PLOT } from "../../../../shared/config/constants";
import { clamp01 } from "../foundation";
import { ENTRANCE_FRAMES } from "../math-scene-plan/progress";
import {
  MATH_PLOT_MARGIN as MARGIN,
  MATH_PLOT_SVG_HEIGHT as SVG_H,
  MATH_PLOT_SVG_WIDTH as SVG_W,
  MATH_PLOT_WIDTH as PLOT_W,
  pointerDomainX,
} from "./mathPlotInteraction";

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

/**
 * Math-renderer palette. The shared studio palette (bg / text / narration)
 * comes from THEME_PALETTE so every named theme (dark / light / monokai /
 * nord / solarized) recolors the math plot in lockstep. Canvas structure,
 * curves, and focus markers use the shared canvas semantic roles, with
 * explicit palette fallbacks for SSR and Remotion exports.
 */
function buildMathPalette(theme: "dark" | "light"): MathPalette {
  const studio = THEME_PALETTE[theme];
  return theme === "dark"
    ? {
        bg: studio.surface2,
        plotBg: "rgba(255,255,255,0.02)",
        grid: `var(--canvas-grid, ${studio.canvasGrid})`,
        axis: `var(--canvas-axis, ${studio.canvasAxis})`,
        axisLabel: studio.ink2,
        tick: studio.ink3,
        text: studio.ink,
        narration: studio.ink3,
        card: "rgba(255,255,255,0.06)",
        cardBorder: studio.line2,
        curvePrimary: [
          `var(--canvas-primary, ${studio.canvasPrimary})`,
          `var(--canvas-secondary, ${studio.canvasSecondary})`,
          `var(--canvas-focus, ${studio.canvasFocus})`,
        ],
        curveSecondary: `var(--canvas-secondary, ${studio.canvasSecondary})`,
        curveAccent: `var(--canvas-focus, ${studio.canvasFocus})`,
        marker: `var(--canvas-focus, ${studio.canvasFocus})`,
        markerGlow: `color-mix(in srgb, var(--canvas-focus, ${studio.canvasFocus}) 52%, transparent)`,
        shade: `color-mix(in srgb, var(--canvas-primary, ${studio.canvasPrimary}) 18%, transparent)`,
        shadeStroke: `color-mix(in srgb, var(--canvas-primary, ${studio.canvasPrimary}) 48%, transparent)`,
      }
    : {
        bg: studio.surface2,
        plotBg: "rgba(0,0,0,0.015)",
        grid: `var(--canvas-grid, ${studio.canvasGrid})`,
        axis: `var(--canvas-axis, ${studio.canvasAxis})`,
        axisLabel: studio.ink2,
        tick: studio.ink3,
        text: studio.ink,
        narration: studio.ink3,
        card: "rgba(0,0,0,0.04)",
        cardBorder: studio.line2,
        curvePrimary: [
          `var(--canvas-primary, ${studio.canvasPrimary})`,
          `var(--canvas-secondary, ${studio.canvasSecondary})`,
          `var(--canvas-focus, ${studio.canvasFocus})`,
        ],
        curveSecondary: `var(--canvas-secondary, ${studio.canvasSecondary})`,
        curveAccent: `var(--canvas-focus, ${studio.canvasFocus})`,
        marker: `var(--canvas-focus, ${studio.canvasFocus})`,
        markerGlow: `color-mix(in srgb, var(--canvas-focus, ${studio.canvasFocus}) 44%, transparent)`,
        shade: `color-mix(in srgb, var(--canvas-primary, ${studio.canvasPrimary}) 16%, transparent)`,
        shadeStroke: `color-mix(in srgb, var(--canvas-primary, ${studio.canvasPrimary}) 44%, transparent)`,
      };
}

const PALETTE: Record<"dark" | "light", MathPalette> = {
  dark: buildMathPalette("dark"),
  light: buildMathPalette("light"),
};

// ── Geometry (virtual SVG coordinate space) ───────────────────────────────

const PLOT_H = SVG_H - MARGIN.top - MARGIN.bottom;
const SAMPLES = MATH_PLOT.CURVE_SAMPLES;

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
  semanticRole: string | undefined;
  fn: CompiledExpr | null;
  points: SamplePoint[];
  primaryIndex: number;
}

/** Dots beyond this count batch into a single path with a sweep-clip reveal. */
const DENSE_POINTS_THRESHOLD = 220;

function buildDensePointsPath(
  points: MathPlotSnapshot["points"],
  xMin: number,
  xMax: number,
  yLo: number,
  yHi: number,
): string | null {
  if (!points || points.length <= DENSE_POINTS_THRESHOLD) return null;
  const r = 1.6;
  let d = "";
  for (const p of points) {
    const cx = MARGIN.left + ((p.x - xMin) / (xMax - xMin || 1)) * PLOT_W;
    const cy = MARGIN.top + ((yHi - p.y) / (yHi - yLo || 1)) * PLOT_H;
    d += `M${(cx - r).toFixed(1)},${cy.toFixed(1)}a${r},${r} 0 1,0 ${r * 2},0a${r},${r} 0 1,0 ${-r * 2},0`;
  }
  return d;
}

// ── Component ──────────────────────────────────────────────────────────────

export const MathPlotRenderer: React.FC<RendererProps> = ({
  step,
  frame,
  stepStartFrame,
  visualStartFrame,
  theme,
  onInteraction,
}) => {
  const snap = step.snapshot as MathPlotSnapshot;
  const colors = PALETTE[theme];
  const draggingPointerId = React.useRef<number | null>(null);
  const onInteractionRef = React.useRef(onInteraction);

  React.useEffect(() => {
    const previousInteraction = onInteractionRef.current;
    onInteractionRef.current = onInteraction;
    if (onInteraction || draggingPointerId.current == null) return;
    draggingPointerId.current = null;
    previousInteraction?.({
      type: "set-number",
      phase: "cancel",
      step_id: step.step_id,
      target_role: "marker-x",
    });
  }, [onInteraction, step.step_id]);

  React.useEffect(() => () => {
    if (draggingPointerId.current == null) return;
    draggingPointerId.current = null;
    onInteractionRef.current?.({
      type: "set-number",
      phase: "cancel",
      step_id: step.step_id,
      target_role: "marker-x",
    });
  }, [step.step_id]);

  // Spring-driven `progress` can briefly overshoot; for time-fades use raw elapsed.
  const elapsed = Math.max(0, frame - stepStartFrame);
  const titleOpacity = clamp01(elapsed / 8);
  // Curves, shading and observed-data marks sweep in on the fixed entrance
  // clock, not the narration: a 36-second step must not leave the Galileo
  // data points half-drawn 30 seconds in. The clock is anchored to the visual
  // slot, so geometry carried across a narration boundary stays drawn instead
  // of re-sweeping at every step.
  const revealAnchor = Math.min(visualStartFrame ?? stepStartFrame, stepStartFrame);
  const reveal = clamp01(Math.max(0, frame - revealAnchor) / ENTRANCE_FRAMES);

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
        semanticRole: c.semantic_role,
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
    for (const p of snap.points ?? []) if (Number.isFinite(p.y)) ys.push(p.y);
    for (const line of snap.polylines ?? []) {
      for (const [, y] of line.points) if (Number.isFinite(y)) ys.push(y);
    }
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

  // A dense scatter (e.g. a bifurcation diagram) renders as one batched path
  // node instead of thousands of circle groups; a sweep clip reveals it left
  // to right. Below the threshold, points keep per-dot labels and fades.
  // Plain computation — the React Compiler memoizes it from its inputs.
  const densePointsPath = buildDensePointsPath(snap.points, xMin, xMax, yLo, yHi);

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
    const shadeFrom = snap.shade_from;
    const right = shadeFrom + (snap.shade_to - shadeFrom) * shadeReveal;
    if (right > shadeFrom + 1e-9) {
      // Issue #44: reuse the lead curve's own samples (sampled at SAMPLES
      // density across [xMin, xMax]) so the shade's top edge exactly tracks
      // the curve path. Resampling at a lower density introduced a 2–3px
      // seam at high zoom. We bracket the reused interior samples with
      // exact endpoints at shade_from / right so the polygon closes flush
      // against the baseline.
      const params = snap.params ?? {};
      const startY = lead.fn({ ...params, x: shadeFrom });
      const endY = lead.fn({ ...params, x: right });
      const interior = lead.points.filter(
        (p) => p.x > shadeFrom && p.x < right && Number.isFinite(p.y),
      );
      const top: SamplePoint[] = [
        ...(Number.isFinite(startY) ? [{ x: shadeFrom, y: startY }] : []),
        ...interior,
        ...(Number.isFinite(endY) ? [{ x: right, y: endY }] : []),
      ];
      if (top.length >= 2) {
        const coords = [
          `${sx(shadeFrom).toFixed(1)},${sy(baselineY).toFixed(1)}`,
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
      marker = { px: sx(snap.marker_x), py: sy(my), mx: snap.marker_x, my, opacity };
    }
  }

  const formulaHtml = React.useMemo(() => {
    if (!snap.formula_latex || !snap.formula_latex.trim()) return null;
    const html = sanitizeKatex(snap.formula_latex);
    return html || null;
  }, [snap.formula_latex]);

  const empty =
    drawable.length === 0 &&
    (snap.points ?? []).length === 0 &&
    (snap.polylines ?? []).length === 0;

  return (
    <div
      className="math-plot-renderer"
      data-theme={theme}
      data-pack-id={snap.pack_id ?? undefined}
      data-plot-asset-id={snap.asset_id ?? undefined}
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
            data-semantic-role="formula"
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
                // Anchor the label on the visible run (a curve can exit the
                // window), backed off from the right edge and staggered per
                // curve so stacked labels do not collide.
                const visible = shown.filter(
                  (p) => Number.isFinite(p.y) && p.y >= yLo && p.y <= yHi,
                );
                const anchor = visible.length
                  ? visible[Math.min(
                      visible.length - 1,
                      Math.floor(visible.length * (0.88 - 0.14 * (ci % 3))),
                    )]
                  : null;
                const labelX = anchor
                  ? Math.min(sx(anchor.x) + 8, MARGIN.left + PLOT_W - 6)
                  : 0;
                const labelY = anchor
                  ? Math.min(Math.max(sy(anchor.y) - 8, MARGIN.top + 14), MARGIN.top + PLOT_H - 8)
                  : 0;
                return (
                  <g key={`curve-${ci}`} data-semantic-role={c.semanticRole ?? "curve"}>
                    {segments.map((seg, si) => (
                      <polyline
                        key={si}
                        data-semantic-role={c.semanticRole ?? "curve"}
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
                    {c.label && anchor && (
                      <text
                        x={labelX}
                        y={labelY}
                        textAnchor={labelX > MARGIN.left + PLOT_W - 90 ? "end" : "start"}
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

              {(snap.polylines ?? []).map((line, li) => {
                if (line.points.length < 2) return null;
                const stroke = curveColor(colors, line.emphasis, li);
                const tip = line.points[line.points.length - 1];
                const tipX = sx(tip[0]);
                return (
                  <g key={`traj-${li}`} data-semantic-role={line.semantic_role ?? "trajectory"}>
                    <polyline
                      points={line.points
                        .map(([px, py]) => `${sx(px).toFixed(1)},${sy(py).toFixed(1)}`)
                        .join(" ")}
                      fill="none"
                      stroke={stroke}
                      strokeWidth={line.emphasis === "accent" ? 2.6 : 2.2}
                      strokeLinejoin="round"
                      opacity={line.emphasis === "secondary" ? 0.55 : 0.92}
                      pathLength={1}
                      strokeDasharray={1}
                      strokeDashoffset={1 - clamp01(reveal * 1.05)}
                    />
                    {line.label && (
                      <text
                        x={Math.min(tipX + 8, MARGIN.left + PLOT_W - 6)}
                        y={Math.max(MARGIN.top + 12, sy(tip[1]) - 6)}
                        textAnchor={tipX > MARGIN.left + PLOT_W - 90 ? "end" : "start"}
                        fontSize={12.5}
                        fontWeight={600}
                        fill={stroke}
                        opacity={clamp01((reveal - 0.8) * 6)}
                      >
                        {line.label}
                      </text>
                    )}
                  </g>
                );
              })}

              {densePointsPath ? (
                <g data-semantic-role={snap.points?.[0]?.semantic_role ?? "data_point"}>
                  <clipPath id="mv-plot-dense-sweep">
                    <rect
                      x={MARGIN.left}
                      y={MARGIN.top}
                      width={Math.max(0, PLOT_W * clamp01(reveal * 1.05))}
                      height={PLOT_H}
                    />
                  </clipPath>
                  <path
                    d={densePointsPath}
                    fill={curveColor(colors, snap.points?.[0]?.emphasis, 0)}
                    clipPath="url(#mv-plot-dense-sweep)"
                  />
                </g>
              ) : (
                (snap.points ?? []).map((p, pi) => {
                  // Observed data appears in x-order as the step's reveal sweeps
                  // left to right, matching the curve draw-on direction.
                  const xFrac = (p.x - xMin) / (xMax - xMin || 1);
                  const opacity = clamp01((reveal * 1.15 - xFrac) * 8);
                  const fill = curveColor(colors, p.emphasis, 0);
                  return (
                    <g
                      key={`pt-${pi}`}
                      opacity={opacity}
                      data-semantic-role={p.semantic_role ?? "data_point"}
                    >
                      <circle
                        cx={sx(p.x)}
                        cy={sy(p.y)}
                        r={4.5}
                        fill={fill}
                        stroke={colors.bg}
                        strokeWidth={1.4}
                      />
                      {p.label && p.label.trim() && (
                        <text
                          x={sx(p.x) + 9}
                          y={sy(p.y) - 9}
                          fontSize={12.5}
                          fontWeight={600}
                          fill={fill}
                        >
                          {p.label}
                        </text>
                      )}
                    </g>
                  );
                })
              )}

              {marker && (
                <g
                  opacity={marker.opacity}
                  data-semantic-role="marker"
                  data-interaction-target={onInteraction ? "marker-x" : undefined}
                  role={onInteraction ? "slider" : undefined}
                  aria-label={onInteraction ? "切点 x" : undefined}
                  aria-valuemin={onInteraction ? xMin : undefined}
                  aria-valuemax={onInteraction ? xMax : undefined}
                  aria-valuenow={onInteraction ? marker.mx : undefined}
                  tabIndex={onInteraction ? 0 : undefined}
                  style={onInteraction ? {
                    cursor: "ew-resize",
                    pointerEvents: "all",
                    touchAction: "none",
                  } : undefined}
                  onPointerDown={onInteraction ? (event) => {
                    if (
                      (typeof event.button === "number" && event.button !== 0) ||
                      event.isPrimary === false ||
                      draggingPointerId.current != null
                    ) return;
                    const svg = event.currentTarget.ownerSVGElement;
                    if (!svg) return;
                    event.preventDefault();
                    event.stopPropagation();
                    draggingPointerId.current = event.pointerId;
                    try {
                      event.currentTarget.setPointerCapture?.(event.pointerId);
                    } catch {
                      // Pointer capture can fail if the node detaches during a Remotion update.
                    }
                    onInteraction({
                      type: "set-number",
                      phase: "preview",
                      step_id: step.step_id,
                      target_role: "marker-x",
                      value: pointerDomainX(svg, event.clientX, event.clientY, xMin, xMax),
                    });
                  } : undefined}
                  onPointerMove={onInteraction ? (event) => {
                    if (draggingPointerId.current !== event.pointerId) return;
                    const svg = event.currentTarget.ownerSVGElement;
                    if (!svg) return;
                    event.preventDefault();
                    event.stopPropagation();
                    onInteraction({
                      type: "set-number",
                      phase: "preview",
                      step_id: step.step_id,
                      target_role: "marker-x",
                      value: pointerDomainX(svg, event.clientX, event.clientY, xMin, xMax),
                    });
                  } : undefined}
                  onPointerUp={onInteraction ? (event) => {
                    if (draggingPointerId.current !== event.pointerId) return;
                    const svg = event.currentTarget.ownerSVGElement;
                    draggingPointerId.current = null;
                    event.preventDefault();
                    event.stopPropagation();
                    try {
                      event.currentTarget.releasePointerCapture?.(event.pointerId);
                    } catch {
                      // The browser may already have released capture.
                    }
                    if (!svg) {
                      onInteraction({
                        type: "set-number",
                        phase: "cancel",
                        step_id: step.step_id,
                        target_role: "marker-x",
                      });
                      return;
                    }
                    onInteraction({
                      type: "set-number",
                      phase: "commit",
                      step_id: step.step_id,
                      target_role: "marker-x",
                      value: pointerDomainX(svg, event.clientX, event.clientY, xMin, xMax),
                    });
                  } : undefined}
                  onPointerCancel={onInteraction ? (event) => {
                    if (draggingPointerId.current !== event.pointerId) return;
                    draggingPointerId.current = null;
                    event.stopPropagation();
                    onInteraction({
                      type: "set-number",
                      phase: "cancel",
                      step_id: step.step_id,
                      target_role: "marker-x",
                    });
                  } : undefined}
                  onLostPointerCapture={onInteraction ? (event) => {
                    if (draggingPointerId.current !== event.pointerId) return;
                    draggingPointerId.current = null;
                    onInteraction({
                      type: "set-number",
                      phase: "cancel",
                      step_id: step.step_id,
                      target_role: "marker-x",
                    });
                  } : undefined}
                  onKeyDown={onInteraction ? (event) => {
                    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                    event.preventDefault();
                    event.stopPropagation();
                    const delta = (xMax - xMin) / 100;
                    const direction = event.key === "ArrowLeft" ? -1 : 1;
                    const value = Math.max(xMin, Math.min(xMax, marker.mx + direction * delta));
                    onInteraction({
                      type: "set-number",
                      phase: "commit",
                      step_id: step.step_id,
                      target_role: "marker-x",
                      value,
                    });
                  } : undefined}
                >
                  <circle
                    data-interaction-hit-target="marker-x"
                    r={24}
                    cx={marker.px}
                    cy={marker.py}
                    fill="transparent"
                    pointerEvents="all"
                  />
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

    </div>
  );
};
