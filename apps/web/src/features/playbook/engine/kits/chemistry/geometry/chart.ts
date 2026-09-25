import type { ChemAxis, ChemChartPanel, ChemEnergyPanel, ChemEnergyPath } from "../sceneTypes";
import type { Box } from "../labelLayout";
import {
  CHEM_FONT,
  circleShape,
  emptyGeometry,
  flexLabelSize,
  makeText,
  polylineShapes,
  type GeoText,
  type PanelGeometry,
} from "./common";

/**
 * Chart and energy-profile geometry. Both share one plot frame: a y label
 * above the axis, tick labels outside the plot, and curves sampled into
 * obstacles so no label is ever set on top of the line it explains.
 */

export interface PlotFrame {
  plot: Box;
  toX: (value: number) => number;
  toY: (value: number) => number;
  xTicks: number[];
  yTicks: number[];
}

const MARGIN = { left: 50, right: 16, bottom: 40 };

function niceStep(span: number, target: number): number {
  const raw = span / Math.max(1, target);
  const power = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / power;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
  return nice * power;
}

export function axisTicks(axis: ChemAxis, target: number): number[] {
  if (axis.ticks) return axis.ticks;
  const step = niceStep(axis.max - axis.min, target);
  const ticks: number[] = [];
  for (let value = Math.ceil(axis.min / step) * step; value <= axis.max + step * 1e-6; value += step) {
    ticks.push(Number(value.toFixed(10)));
  }
  return ticks;
}

export function plotFrame(
  rect: Box,
  x: ChemAxis | null,
  y: ChemAxis,
  hasTitle: boolean,
): PlotFrame {
  const top = rect.y + (hasTitle ? 50 : 28);
  const plot: Box = {
    x: rect.x + MARGIN.left,
    y: top,
    w: rect.w - MARGIN.left - MARGIN.right,
    h: rect.y + rect.h - MARGIN.bottom - top,
  };
  const xMin = x?.min ?? 0;
  const xMax = x?.max ?? 1;
  return {
    plot,
    toX: (value) => plot.x + ((value - xMin) / (xMax - xMin || 1)) * plot.w,
    toY: (value) => plot.y + plot.h - ((value - y.min) / (y.max - y.min || 1)) * plot.h,
    xTicks: x ? axisTicks(x, Math.max(3, Math.round(plot.w / 90))) : [],
    yTicks: axisTicks(y, Math.max(3, Math.round(plot.h / 60))),
  };
}

function formatTick(value: number): string {
  return Math.abs(value) >= 1000 || Number.isInteger(value) ? String(Math.round(value)) : String(Number(value.toFixed(2)));
}

function axisTexts(panelId: string, rect: Box, frame: PlotFrame, x: ChemAxis | null, xLabel: string | null | undefined, y: ChemAxis, title: string | null | undefined): GeoText[] {
  const texts: GeoText[] = [];
  const { plot } = frame;
  for (const tick of frame.xTicks) {
    texts.push(makeText(`${panelId}:xtick:${tick}`, formatTick(tick), frame.toX(tick), plot.y + plot.h + 22, {
      anchor: "middle",
      fontSize: 12,
      tone: "muted",
    }));
  }
  for (const tick of frame.yTicks) {
    texts.push(makeText(`${panelId}:ytick:${tick}`, formatTick(tick), plot.x - 12, frame.toY(tick) + 4, {
      anchor: "end",
      fontSize: 12,
      tone: "muted",
    }));
  }
  const xText = x?.label ?? xLabel;
  if (xText) {
    texts.push(makeText(`${panelId}:xlabel`, xText, plot.x + plot.w, plot.y + plot.h + 38, {
      anchor: "end",
      fontSize: CHEM_FONT.small,
      tone: "muted",
    }));
  }
  texts.push(makeText(`${panelId}:ylabel`, y.label, plot.x - 4, plot.y - 10, { fontSize: CHEM_FONT.small, tone: "muted" }));
  if (title) {
    texts.push(makeText(`${panelId}:title`, title, rect.x + 4, rect.y + 16, { fontSize: CHEM_FONT.panelTitle, weight: 600, tone: "muted" }));
  }
  return texts;
}

/** Series points in stage space, clipped to the axis window. */
export function seriesStagePoints(frame: PlotFrame, points: ReadonlyArray<[number, number]>, y: ChemAxis): Array<[number, number]> {
  return points
    .filter(([, value]) => Number.isFinite(value))
    .map(([px, py]) => [frame.toX(px), frame.toY(Math.max(y.min, Math.min(y.max, py)))] as [number, number]);
}

/** A line-end label's box height (small font) plus a hair of air. */
const END_LABEL_GAP = flexLabelSize({ id: "gap", text: "H", anchor: { x: 0, y: 0 }, fontSize: CHEM_FONT.small }).h + 1;

/**
 * Line-end label heights, pushed apart so neighbouring labels never collide:
 * each keeps its line's end height where it can, and a crowded group is
 * spread just enough (`gap` apart) and kept inside `[top, bottom]`.
 */
export function stackEndLabels(ends: ReadonlyArray<{ id: string; y: number }>, gap: number, top: number, bottom: number): Map<string, number> {
  const sorted = [...ends].sort((a, b) => a.y - b.y);
  const ys = sorted.reduce<number[]>((acc, end, index) => [...acc, index === 0 ? Math.max(top, end.y) : Math.max(end.y, acc[index - 1] + gap)], []);
  const settled = ys.reduceRight<number[]>((acc, y, index) => {
    const limit = index === ys.length - 1 ? bottom : acc[0] - gap;
    return [Math.min(y, limit), ...acc];
  }, []);
  return new Map(sorted.map((end, index) => [end.id, settled[index]]));
}

export function chartGeometry(panel: ChemChartPanel): PanelGeometry {
  const geometry = emptyGeometry();
  const frame = plotFrame(panel.rect, panel.x, panel.y, Boolean(panel.title));
  geometry.texts.push(...axisTexts(panel.id, panel.rect, frame, panel.x, null, panel.y, panel.title));
  // Line-end labels stay level with the plot: below the x axis they would read as tick labels.
  const seriesBounds: Box = {
    x: frame.plot.x,
    y: frame.plot.y - 6,
    w: panel.rect.x + panel.rect.w - frame.plot.x,
    h: frame.plot.h + 6,
  };
  const seriesPoints = panel.series.map((series) => ({ series, points: seriesStagePoints(frame, series.points, panel.y) }));
  const labelY = stackEndLabels(
    seriesPoints.flatMap(({ series, points }) => (series.label && points.length > 0 ? [{ id: series.id, y: points[points.length - 1][1] }] : [])),
    END_LABEL_GAP,
    frame.plot.y + END_LABEL_GAP / 2,
    frame.plot.y + frame.plot.h - END_LABEL_GAP / 2,
  );
  for (const { series, points } of seriesPoints) {
    geometry.shapes.push(...polylineShapes(`${panel.id}:series:${series.id}`, points, 4, 7));
    const last = points.at(-1);
    if (last) geometry.anchors[`series:${series.id}`] = { x: last[0], y: last[1], r: 3 };
    if (series.label && last) {
      geometry.requests.push({
        id: `${panel.id}:series:${series.id}`,
        text: series.label,
        anchor: { x: last[0], y: labelY.get(series.id) ?? last[1], r: 4 },
        prefer: "right",
        fontSize: CHEM_FONT.small,
        tone: series.tone ?? "ink",
        bounds: seriesBounds,
        leader: false,
      });
    }
  }
  for (const marker of panel.markers ?? []) {
    const cx = frame.toX(marker.x);
    const cy = frame.toY(marker.y);
    geometry.shapes.push(circleShape(`${panel.id}:marker:${marker.id}`, cx, cy, 8));
    geometry.anchors[marker.id] = { x: cx, y: cy, r: 7 };
    if (marker.label) {
      geometry.requests.push({
        id: `${panel.id}:marker:${marker.id}`,
        text: marker.label,
        anchor: { x: cx, y: cy, r: 8 },
        prefer: "right",
        fontSize: CHEM_FONT.small,
        tone: marker.tone ?? "focus",
        bounds: panel.rect,
        leader: true,
      });
    }
  }
  for (const band of panel.bands ?? []) {
    const x0 = band.axis === "x" ? frame.toX(band.from) : frame.plot.x;
    const x1 = band.axis === "x" ? frame.toX(band.to) : frame.plot.x + frame.plot.w;
    const y0 = band.axis === "y" ? frame.toY(band.to) : frame.plot.y;
    geometry.anchors[`band:${band.id}`] = { x: band.axis === "x" ? (x0 + x1) / 2 : x1, y: band.axis === "y" ? y0 : y0, r: 0 };
    if (band.label) {
      geometry.requests.push({
        id: `${panel.id}:band:${band.id}`,
        text: band.label,
        anchor: band.axis === "y" ? { x: x1 - 4, y: (y0 + frame.toY(band.from)) / 2, r: 0 } : { x: (x0 + x1) / 2, y: y0, r: 0 },
        prefer: band.axis === "y" ? "left" : "below",
        fontSize: 13,
        tone: band.tone ?? "muted",
        bounds: frame.plot,
        leader: false,
      });
    }
  }
  for (const rule of panel.rules ?? []) {
    const points: Array<[number, number]> = rule.axis === "x"
      ? [[frame.toX(rule.value), frame.plot.y], [frame.toX(rule.value), frame.plot.y + frame.plot.h]]
      : [[frame.plot.x, frame.toY(rule.value)], [frame.plot.x + frame.plot.w, frame.toY(rule.value)]];
    geometry.shapes.push(...polylineShapes(`${panel.id}:rule:${rule.id}`, points, 2, 10));
    geometry.anchors[`rule:${rule.id}`] = { x: points[0][0], y: points[0][1], r: 0 };
    if (rule.label) {
      geometry.requests.push({
        id: `${panel.id}:rule:${rule.id}`,
        text: rule.label,
        anchor: rule.axis === "x" ? { x: points[0][0], y: frame.plot.y + 10, r: 2 } : { x: frame.plot.x + frame.plot.w - 4, y: points[0][1], r: 2 },
        prefer: rule.axis === "x" ? "right" : "above",
        fontSize: 13,
        tone: rule.tone ?? "muted",
        bounds: frame.plot,
        leader: false,
      });
    }
  }
  return geometry;
}

// ---------------------------------------------------------------------------
// energy profile

/** Samples along a path: flat shoulders at the ends, cosine humps between levels. */
export function energyPathPoints(path: ChemEnergyPath): Array<[number, number]> {
  const levels = [...path.levels].sort((a, b) => a.x - b.x);
  if (levels.length === 0) return [];
  const points: Array<[number, number]> = [[0, levels[0].e], [levels[0].x, levels[0].e]];
  for (let i = 0; i < levels.length - 1; i += 1) {
    const a = levels[i];
    const b = levels[i + 1];
    for (let k = 1; k <= 24; k += 1) {
      const s = k / 24;
      points.push([a.x + (b.x - a.x) * s, a.e + (b.e - a.e) * (1 - Math.cos(Math.PI * s)) / 2]);
    }
  }
  const last = levels.at(-1)!;
  points.push([1, last.e]);
  return points;
}

export function energyValueAt(path: ChemEnergyPath, t: number): number {
  const points = energyPathPoints(path);
  for (let i = 0; i < points.length - 1; i += 1) {
    const [x0, e0] = points[i];
    const [x1, e1] = points[i + 1];
    if (t >= x0 && t <= x1) return x1 === x0 ? e1 : e0 + ((t - x0) / (x1 - x0)) * (e1 - e0);
  }
  return points.at(-1)?.[1] ?? 0;
}

export function energyFrame(panel: ChemEnergyPanel): PlotFrame {
  return plotFrame(panel.rect, null, panel.y, Boolean(panel.title));
}

export interface EnergyMeasureShape {
  id: string;
  x: number;
  y1: number;
  y2: number;
  /** Dashed guide from the reference level to the measure line. */
  guide: [number, number, number, number] | null;
}

export function energyMeasureShapes(panel: ChemEnergyPanel, frame: PlotFrame): EnergyMeasureShape[] {
  const levels = new Map(panel.paths.flatMap((path) => path.levels.map((level) => [level.id, level] as const)));
  return (panel.measures ?? []).flatMap((measure) => {
    const from = levels.get(measure.from);
    const to = levels.get(measure.to);
    if (!from || !to) return [];
    const x = frame.toX(measure.at ?? (measure.kind === "ea" ? to.x : Math.min(0.96, to.x + 0.06)));
    const y1 = frame.toY(from.e);
    const y2 = frame.toY(to.e);
    return [{ id: measure.id, x, y1, y2, guide: [frame.toX(from.x), y1, x, y1] }];
  });
}

export function energyGeometry(panel: ChemEnergyPanel): PanelGeometry {
  const geometry = emptyGeometry();
  const frame = energyFrame(panel);
  geometry.texts.push(...axisTexts(panel.id, panel.rect, frame, null, panel.x_label ?? "反应进程", panel.y, panel.title));
  for (const path of panel.paths) {
    const points = energyPathPoints(path).map(([t, e]) => [frame.toX(t), frame.toY(e)] as [number, number]);
    geometry.shapes.push(...polylineShapes(`${panel.id}:path:${path.id}`, points, 4, 7));
    for (const level of path.levels) {
      const x = frame.toX(level.x);
      const y = frame.toY(level.e);
      geometry.anchors[level.id] = { x, y, r: 4 };
      if (level.label) {
        geometry.requests.push({
          id: `${panel.id}:level:${level.id}`,
          text: level.label,
          anchor: { x, y, r: 6 },
          prefer: level.kind === "ts" || level.kind === "intermediate" ? "above" : "below",
          fontSize: CHEM_FONT.small,
          tone: path.tone ?? "ink",
          bounds: frame.plot,
          leader: false,
        });
      }
    }
  }
  for (const [index, shape] of energyMeasureShapes(panel, frame).entries()) {
    const measure = (panel.measures ?? [])[index];
    geometry.shapes.push(...polylineShapes(`${panel.id}:measure:${shape.id}`, [[shape.x, shape.y1], [shape.x, shape.y2]], 4, 8));
    geometry.requests.push({
      id: `${panel.id}:measure:${shape.id}`,
      text: measure.label,
      anchor: { x: shape.x, y: measure.kind === "dh" ? Math.min(shape.y1, shape.y2) : (shape.y1 + shape.y2) / 2, r: 4 },
      // A reaction-heat arrow is short and sits at the right edge: label above it.
      prefer: measure.side ?? (measure.kind === "dh" ? "above" : "right"),
      fontSize: CHEM_FONT.label,
      tone: measure.tone ?? (measure.kind === "ea" ? "focus" : "primary"),
      bounds: frame.plot,
      leader: false,
    });
  }
  if (panel.rider) {
    const path = panel.paths.find((item) => item.id === panel.rider?.path_id);
    if (path) {
      const cx = frame.toX(panel.rider.t);
      const cy = frame.toY(energyValueAt(path, panel.rider.t));
      geometry.shapes.push(circleShape(`${panel.id}:rider`, cx, cy, 9));
      geometry.anchors.rider = { x: cx, y: cy, r: 8 };
    }
  }
  return geometry;
}
