import React from "react";
import type { SamplePoint } from "../../../shared/lib/mathExpr";
import { autoYBounds, fmtNum, niceTicks, padRange } from "../../../shared/lib/plotMath";

export interface PlotSeries {
  points: SamplePoint[];
  color: string;
  label?: string;
  dashed?: boolean;
}

export interface PlotMarker {
  x: number;
  y: number;
  color: string;
  label?: string;
}

interface ParamPlotProps {
  series: PlotSeries[];
  xRange: [number, number];
  /** Fixed y-range; omit to auto-fit from the supplied samples. */
  yRange?: [number, number];
  theme: "dark" | "light";
  marker?: PlotMarker | null;
  xLabel?: string;
  yLabel?: string;
}

const THEME = {
  dark: {
    bg: "rgba(255,255,255,0.02)",
    grid: "rgba(255,255,255,0.08)",
    axis: "rgba(255,255,255,0.32)",
    label: "rgba(232,236,244,0.7)",
    tick: "rgba(232,236,244,0.5)",
    markerLine: "rgba(255,216,77,0.7)",
  },
  light: {
    bg: "rgba(0,0,0,0.015)",
    grid: "rgba(0,0,0,0.09)",
    axis: "rgba(0,0,0,0.42)",
    label: "rgba(20,24,32,0.65)",
    tick: "rgba(20,24,32,0.55)",
    markerLine: "rgba(176,125,0,0.65)",
  },
} as const;

const W = 760;
const H = 460;
const M = { top: 14, right: 18, bottom: 32, left: 46 };
const PW = W - M.left - M.right;
const PH = H - M.top - M.bottom;

function toSegments(pts: SamplePoint[]): SamplePoint[][] {
  const out: SamplePoint[][] = [];
  let cur: SamplePoint[] = [];
  for (const p of pts) {
    if (Number.isFinite(p.y)) cur.push(p);
    else if (cur.length) {
      out.push(cur);
      cur = [];
    }
  }
  if (cur.length) out.push(cur);
  return out;
}

export function ParamPlot({
  series,
  xRange,
  yRange,
  theme,
  marker,
  xLabel = "x",
  yLabel = "y",
}: ParamPlotProps): React.JSX.Element {
  const c = THEME[theme];
  const [xMin, xMax] = xRange[0] < xRange[1] ? xRange : [-10, 10];

  let yLo: number;
  let yHi: number;
  if (yRange && yRange[0] < yRange[1]) {
    [yLo, yHi] = yRange;
  } else {
    const ys: number[] = [];
    for (const s of series)
      for (const p of s.points) if (Number.isFinite(p.y)) ys.push(p.y);
    [yLo, yHi] = padRange(...autoYBounds(ys));
  }
  if (!(yLo < yHi)) {
    yLo = -10;
    yHi = 10;
  }

  const sx = (x: number) => M.left + ((x - xMin) / (xMax - xMin)) * PW;
  const sy = (y: number) => M.top + ((yHi - y) / (yHi - yLo)) * PH;
  const path = (pts: SamplePoint[]) =>
    pts.map((p) => `${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(" ");

  const xTicks = niceTicks(xMin, xMax, 8);
  const yTicks = niceTicks(yLo, yHi, 7);
  const hasXAxis = yLo < 0 && yHi > 0;
  const hasYAxis = xMin < 0 && xMax > 0;
  const axisY = hasXAxis ? sy(0) : M.top + PH;
  const axisX = hasYAxis ? sx(0) : M.left;

  const clipId = "mvw-clip";

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      width="100%"
      height="100%"
      style={{ display: "block" }}
      role="img"
      aria-label="交互函数图"
    >
      <defs>
        <clipPath id={clipId}>
          <rect x={M.left} y={M.top} width={PW} height={PH} />
        </clipPath>
      </defs>

      <rect x={M.left} y={M.top} width={PW} height={PH} fill={c.bg} />

      {xTicks.map((t) => (
        <line
          key={`gx${t}`}
          x1={sx(t)}
          y1={M.top}
          x2={sx(t)}
          y2={M.top + PH}
          stroke={c.grid}
          strokeWidth={1}
        />
      ))}
      {yTicks.map((t) => (
        <line
          key={`gy${t}`}
          x1={M.left}
          y1={sy(t)}
          x2={M.left + PW}
          y2={sy(t)}
          stroke={c.grid}
          strokeWidth={1}
        />
      ))}

      <line
        x1={M.left}
        y1={axisY}
        x2={M.left + PW}
        y2={axisY}
        stroke={c.axis}
        strokeWidth={1.6}
      />
      <line
        x1={axisX}
        y1={M.top}
        x2={axisX}
        y2={M.top + PH}
        stroke={c.axis}
        strokeWidth={1.6}
      />
      <text
        x={M.left + PW - 4}
        y={axisY - 6}
        textAnchor="end"
        fontSize={13}
        fontStyle="italic"
        fill={c.label}
      >
        {xLabel}
      </text>
      <text
        x={axisX + 8}
        y={M.top + 12}
        fontSize={13}
        fontStyle="italic"
        fill={c.label}
      >
        {yLabel}
      </text>

      {xTicks.map((t) =>
        t === 0 && hasYAxis ? null : (
          <text
            key={`tx${t}`}
            x={sx(t)}
            y={axisY + 15}
            textAnchor="middle"
            fontSize={11}
            fill={c.tick}
          >
            {fmtNum(t)}
          </text>
        ),
      )}
      {yTicks.map((t) =>
        t === 0 ? null : (
          <text
            key={`ty${t}`}
            x={axisX - 6}
            y={sy(t) + 4}
            textAnchor="end"
            fontSize={11}
            fill={c.tick}
          >
            {fmtNum(t)}
          </text>
        ),
      )}

      <g clipPath={`url(#${clipId})`}>
        {series.map((s, i) =>
          toSegments(s.points).map((seg, j) => (
            <polyline
              key={`s${i}-${j}`}
              points={path(seg)}
              fill="none"
              stroke={s.color}
              strokeWidth={2.6}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={s.dashed ? "7 5" : undefined}
              opacity={s.dashed ? 0.85 : 1}
            />
          )),
        )}

        {marker && Number.isFinite(marker.y) && (
          <g>
            <line
              x1={sx(marker.x)}
              y1={sy(marker.y)}
              x2={sx(marker.x)}
              y2={axisY}
              stroke={c.markerLine}
              strokeWidth={1.3}
              strokeDasharray="4 4"
            />
            <circle
              cx={sx(marker.x)}
              cy={sy(marker.y)}
              r={8}
              fill={marker.color}
              opacity={0.3}
            />
            <circle
              cx={sx(marker.x)}
              cy={sy(marker.y)}
              r={4.5}
              fill={marker.color}
            />
          </g>
        )}
      </g>

      {marker && Number.isFinite(marker.y) && (
        <text
          x={Math.min(sx(marker.x) + 10, M.left + PW - 4)}
          y={Math.max(sy(marker.y) - 10, M.top + 12)}
          fontSize={12}
          fontWeight={600}
          fill={marker.color}
          textAnchor={sx(marker.x) > M.left + PW - 70 ? "end" : "start"}
        >
          {marker.label ?? `(${fmtNum(marker.x, xMax - xMin)}, ${fmtNum(marker.y, yHi - yLo)})`}
        </text>
      )}
    </svg>
  );
}
