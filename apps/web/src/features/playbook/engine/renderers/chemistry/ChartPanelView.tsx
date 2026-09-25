import React from "react";

import type { ChemChartPanel, ChemEnergyPanel, ChemSeries } from "../../kits/chemistry/sceneTypes";
import {
  energyFrame,
  energyMeasureShapes,
  energyPathPoints,
  energyValueAt,
  plotFrame,
  seriesStagePoints,
  type PlotFrame,
} from "../../kits/chemistry/geometry/chart";
import { elementColor } from "../../kits/chemistry/elements";
import { lerp } from "../../kits/chemistry/transitions";
import { tintFill, toneColor, type ChemPalette } from "./chemPalette";

function seriesColor(palette: ChemPalette, series: Pick<ChemSeries, "element" | "tone">): string {
  if (series.element) return elementColor(series.element, palette.theme);
  return toneColor(palette, series.tone ?? "primary");
}

function Grid({ frame, palette }: { frame: PlotFrame; palette: ChemPalette }) {
  const { plot } = frame;
  return (
    <g data-chart-grid="true">
      {frame.yTicks.map((tick) => (
        <line key={`y${tick}`} x1={plot.x} x2={plot.x + plot.w} y1={frame.toY(tick)} y2={frame.toY(tick)} stroke={palette.grid} strokeWidth={1} />
      ))}
      {frame.xTicks.map((tick) => (
        <line key={`x${tick}`} x1={frame.toX(tick)} x2={frame.toX(tick)} y1={plot.y} y2={plot.y + plot.h} stroke={palette.grid} strokeWidth={1} />
      ))}
      <line x1={plot.x} y1={plot.y + plot.h} x2={plot.x + plot.w} y2={plot.y + plot.h} stroke={palette.axis} strokeWidth={1.4} />
      <line x1={plot.x} y1={plot.y} x2={plot.x} y2={plot.y + plot.h} stroke={palette.axis} strokeWidth={1.4} />
    </g>
  );
}

function pathOf(points: Array<[number, number]>): string {
  return points.map(([x, y], index) => `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");
}

export function ChartPanelView({ panel, prev, morph, palette, uid }: { panel: ChemChartPanel; prev: ChemChartPanel | null; morph: number; palette: ChemPalette; uid: string }) {
  const frame = plotFrame(panel.rect, panel.x, panel.y, Boolean(panel.title));
  const { plot } = frame;
  const clipId = `${uid}-${panel.id}-plot`;
  const revealIds = new Set(panel.reveal?.series_ids ?? []);
  const revealX = panel.reveal ? lerp(panel.reveal.from_x, panel.x.max, morph) : panel.x.max;
  const prevMarkers = new Map((prev?.markers ?? []).map((marker) => [marker.id, marker]));
  return (
    <g data-chem-panel="chart" data-panel-id={panel.id}>
      <defs>
        <clipPath id={clipId}>
          <rect x={plot.x} y={plot.y - 2} width={plot.w} height={plot.h + 4} />
        </clipPath>
      </defs>
      <Grid frame={frame} palette={palette} />
      <g clipPath={`url(#${clipId})`}>
        {(panel.bands ?? []).map((band) => {
          const fill = band.tint ? tintFill(palette, band.tint) : { color: toneColor(palette, band.tone ?? "secondary"), opacity: 0.12 };
          const x0 = band.axis === "x" ? frame.toX(band.from) : plot.x;
          const x1 = band.axis === "x" ? frame.toX(band.to) : plot.x + plot.w;
          const y0 = band.axis === "y" ? frame.toY(band.to) : plot.y;
          const y1 = band.axis === "y" ? frame.toY(band.from) : plot.y + plot.h;
          return <rect key={band.id} data-band={band.id} x={x0} y={y0} width={Math.max(0, x1 - x0)} height={Math.max(0, y1 - y0)} fill={fill.color} opacity={fill.opacity} />;
        })}
        {(panel.areas ?? []).map((area) => {
          const series = panel.series.find((item) => item.id === area.series_id);
          if (!series) return null;
          const inside = series.points.filter(([x]) => x >= area.from_x && x <= area.to_x);
          if (inside.length < 2) return null;
          const top = seriesStagePoints(frame, inside, panel.y);
          const d = `${pathOf(top)} L ${top.at(-1)![0]} ${frame.toY(Math.max(panel.y.min, 0))} L ${top[0][0]} ${frame.toY(Math.max(panel.y.min, 0))} Z`;
          return <path key={area.id} data-area={area.id} d={d} fill={toneColor(palette, area.tone ?? "focus")} opacity={0.28} />;
        })}
        {(panel.rules ?? []).map((rule) => {
          const color = toneColor(palette, rule.tone ?? "muted");
          return rule.axis === "x" ? (
            <line key={rule.id} x1={frame.toX(rule.value)} x2={frame.toX(rule.value)} y1={plot.y} y2={plot.y + plot.h} stroke={color} strokeWidth={1.4} strokeDasharray="5 5" />
          ) : (
            <line key={rule.id} x1={plot.x} x2={plot.x + plot.w} y1={frame.toY(rule.value)} y2={frame.toY(rule.value)} stroke={color} strokeWidth={1.4} strokeDasharray="5 5" />
          );
        })}
        {panel.series.map((series) => {
          const visible = revealIds.has(series.id) ? series.points.filter(([x]) => x <= revealX) : series.points;
          const points = seriesStagePoints(frame, visible, panel.y);
          if (points.length < 2) return null;
          return (
            <path
              key={series.id}
              data-series={series.id}
              d={pathOf(points)}
              fill="none"
              stroke={seriesColor(palette, series)}
              strokeWidth={series.tone === "muted" ? 2 : 3}
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray={series.dashed ? "7 6" : undefined}
            />
          );
        })}
      </g>
      {(panel.markers ?? []).map((marker) => {
        const before = prevMarkers.get(marker.id);
        const x = before ? lerp(before.x, marker.x, morph) : marker.x;
        const y = before ? lerp(before.y, marker.y, morph) : marker.y;
        const color = toneColor(palette, marker.tone ?? "focus");
        return (
          <g key={marker.id} data-marker={marker.id}>
            <circle cx={frame.toX(x)} cy={frame.toY(y)} r={9} fill={color} opacity={0.22} />
            <circle cx={frame.toX(x)} cy={frame.toY(y)} r={5.5} fill={color} stroke={palette.plate} strokeWidth={1.6} />
          </g>
        );
      })}
    </g>
  );
}

export function EnergyPanelView({ panel, prev, morph, palette, uid }: { panel: ChemEnergyPanel; prev: ChemEnergyPanel | null; morph: number; palette: ChemPalette; uid: string }) {
  const frame = energyFrame(panel);
  const { plot } = frame;
  const measures = energyMeasureShapes(panel, frame);
  const riderPath = panel.rider ? panel.paths.find((path) => path.id === panel.rider?.path_id) : undefined;
  const prevRiderT = prev?.rider?.path_id === panel.rider?.path_id ? prev?.rider?.t : undefined;
  const riderT = panel.rider ? lerp(prevRiderT ?? panel.rider.t, panel.rider.t, morph) : 0;
  const prevPaths = new Set((prev?.paths ?? []).map((path) => path.id));
  const markerId = `${uid}-${panel.id}-measure`;
  return (
    <g data-chem-panel="energy_profile" data-panel-id={panel.id}>
      <defs>
        {(panel.measures ?? []).map((measure) => (
          <marker key={measure.id} id={`${markerId}-${measure.id}`} viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4.5" markerHeight="4.5" orient="auto-start-reverse">
            <path d="M0,1 L10,5 L0,9 Z" fill={toneColor(palette, measure.tone ?? (measure.kind === "ea" ? "focus" : "primary"))} />
          </marker>
        ))}
      </defs>
      <Grid frame={{ ...frame, xTicks: [] }} palette={palette} />
      {panel.paths.map((path) => {
        const points = energyPathPoints(path).map(([t, e]) => [frame.toX(t), frame.toY(e)] as [number, number]);
        const entering = prev && !prevPaths.has(path.id);
        return (
          <path
            key={path.id}
            data-energy-path={path.id}
            d={pathOf(points)}
            fill="none"
            stroke={toneColor(palette, path.tone ?? "primary")}
            strokeWidth={3}
            strokeDasharray={path.dashed ? "8 6" : undefined}
            strokeLinecap="round"
            opacity={entering ? morph : 1}
          />
        );
      })}
      {measures.map((measure, index) => {
        const source = (panel.measures ?? [])[index];
        const color = toneColor(palette, source.tone ?? (source.kind === "ea" ? "focus" : "primary"));
        return (
          <g key={measure.id} data-energy-measure={source.kind}>
            {measure.guide ? (
              <line x1={measure.guide[0]} y1={measure.guide[1]} x2={measure.guide[2] + 8} y2={measure.guide[3]} stroke={palette.ink3} strokeWidth={1.2} strokeDasharray="4 4" />
            ) : null}
            <line x1={measure.x} y1={measure.y1} x2={measure.x} y2={measure.y2} stroke={color} strokeWidth={2.2} markerStart={`url(#${markerId}-${source.id})`} markerEnd={`url(#${markerId}-${source.id})`} />
          </g>
        );
      })}
      {riderPath ? (
        <g data-rider="true">
          <circle cx={frame.toX(riderT)} cy={frame.toY(energyValueAt(riderPath, riderT))} r={9} fill={palette.focus} opacity={0.25} />
          <circle cx={frame.toX(riderT)} cy={frame.toY(energyValueAt(riderPath, riderT))} r={6} fill={palette.focus} />
        </g>
      ) : null}
      <line x1={plot.x} y1={plot.y + plot.h} x2={plot.x + plot.w} y2={plot.y + plot.h} stroke={palette.axis} strokeWidth={1.4} />
    </g>
  );
}
