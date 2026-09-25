import React from "react";

import type { ChemGalvanicPanel, ChemHalfCell, ChemTint } from "../../kits/chemistry/sceneTypes";
import { galvanicLayout, type ElectrodeShape } from "../../kits/chemistry/geometry/galvanic";
import { lerp } from "../../kits/chemistry/transitions";
import { elementColor, mixHex } from "../../kits/chemistry/elements";
import { tintFill, type ChemPalette } from "./chemPalette";
import { ParticleGlyph } from "./ParticlesPanelView";

interface Props {
  panel: ChemGalvanicPanel;
  prev: ChemGalvanicPanel | null;
  morph: number;
  frame: number;
  palette: ChemPalette;
  uid: string;
}

type Point = [number, number];

function pointAlong(points: Point[], t: number): Point {
  const lengths = points.slice(1).map((point, index) => Math.hypot(point[0] - points[index][0], point[1] - points[index][1]));
  const total = lengths.reduce((sum, value) => sum + value, 0) || 1;
  let remaining = Math.max(0, Math.min(1, t)) * total;
  for (let i = 0; i < lengths.length; i += 1) {
    if (remaining <= lengths[i]) {
      const f = lengths[i] ? remaining / lengths[i] : 0;
      return [lerp(points[i][0], points[i + 1][0], f), lerp(points[i][1], points[i + 1][1], f)];
    }
    remaining -= lengths[i];
  }
  return points.at(-1) ?? [0, 0];
}

function mixTint(a: ChemTint, b: ChemTint, t: number): ChemTint {
  if (a.hue === b.hue) return { hue: b.hue, strength: lerp(a.strength, b.strength, t) };
  return t < 0.5 ? { hue: a.hue, strength: a.strength * (1 - 2 * t) } : { hue: b.hue, strength: b.strength * (2 * t - 1) };
}

function blendCell(prev: ChemHalfCell | null | undefined, cell: ChemHalfCell, t: number): ChemHalfCell {
  if (!prev) return cell;
  return {
    ...cell,
    tint: mixTint(prev.tint, cell.tint, t),
    wear: lerp(prev.wear ?? 0, cell.wear ?? 0, t),
    deposit: lerp(prev.deposit ?? 0, cell.deposit ?? 0, t),
  };
}

function Electrode({ shape, cell, palette }: { shape: ElectrodeShape; cell: ChemHalfCell; palette: ChemPalette }) {
  const metal = elementColor(shape.element, palette.theme);
  const worn = shape.worn;
  const deposit = Math.max(0, Math.min(1, cell.deposit ?? 0));
  const depositColor = elementColor(cell.deposit_element ?? shape.element, palette.theme);
  const layer = deposit * shape.body.w * 0.45;
  const top = shape.body.y;
  const submerged = shape.submergedTop;
  return (
    <g data-electrode={shape.element}>
      <rect x={worn.x} y={top} width={worn.w} height={submerged - top} fill={metal} stroke={mixHex(metal, "#000000", 0.35)} strokeWidth={1} />
      <rect x={worn.x} y={submerged} width={worn.w} height={shape.body.y + shape.body.h - submerged} fill={metal} stroke={mixHex(metal, "#000000", 0.35)} strokeWidth={1} rx={2} />
      <rect x={worn.x + worn.w * 0.18} y={top + 2} width={worn.w * 0.16} height={shape.body.h - 4} fill="#ffffff" opacity={0.22} />
      {deposit > 0.01 ? (
        <g data-deposit={cell.deposit_element ?? shape.element} opacity={0.95}>
          <rect x={worn.x - layer} y={submerged + 6} width={layer} height={shape.body.y + shape.body.h - submerged - 6} fill={depositColor} rx={layer / 2} />
          <rect x={worn.x + worn.w} y={submerged + 6} width={layer} height={shape.body.y + shape.body.h - submerged - 6} fill={depositColor} rx={layer / 2} />
        </g>
      ) : null}
    </g>
  );
}

function Beaker({ glass, liquid, tint, palette }: { glass: { x: number; y: number; w: number; h: number }; liquid: { x: number; y: number; w: number; h: number }; tint: ChemTint; palette: ChemPalette }) {
  const fill = tintFill(palette, tint);
  const r = Math.min(14, glass.w * 0.08);
  return (
    <g data-beaker="true">
      <rect x={liquid.x} y={liquid.y} width={liquid.w} height={liquid.h} fill={fill.color} opacity={fill.opacity} rx={r * 0.7} />
      <line x1={liquid.x + 4} y1={liquid.y} x2={liquid.x + liquid.w - 4} y2={liquid.y} stroke={fill.color} strokeWidth={1.4} opacity={Math.min(1, fill.opacity + 0.25)} />
      <path
        d={`M ${glass.x - 6} ${glass.y} L ${glass.x} ${glass.y + 4} L ${glass.x} ${glass.y + glass.h - r} Q ${glass.x} ${glass.y + glass.h} ${glass.x + r} ${glass.y + glass.h} L ${glass.x + glass.w - r} ${glass.y + glass.h} Q ${glass.x + glass.w} ${glass.y + glass.h} ${glass.x + glass.w} ${glass.y + glass.h - r} L ${glass.x + glass.w} ${glass.y}`}
        fill="none"
        stroke={palette.glass}
        strokeWidth={2.4}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </g>
  );
}

/**
 * The direction an ion migrates, drawn under the moving ions: a faint dashed
 * track ending in an arrowhead, so a paused frame still says where they go.
 */
function IonTrack({ lane, color, opacity }: { lane: Point[]; color: string; opacity: number }) {
  if (lane.length < 2) return null;
  const [tipX, tipY] = lane[lane.length - 1];
  const [fromX, fromY] = lane[lane.length - 2];
  const length = Math.hypot(tipX - fromX, tipY - fromY) || 1;
  const ux = (tipX - fromX) / length;
  const uy = (tipY - fromY) / length;
  const head = 6;
  const wing = 3.6;
  const baseX = tipX - ux * head;
  const baseY = tipY - uy * head;
  return (
    <g opacity={opacity} data-ion-track="true">
      <polyline
        points={[...lane.slice(0, -1), [baseX, baseY]].map((point) => point.join(",")).join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={1.3}
        strokeDasharray="3 3"
        strokeLinecap="round"
      />
      <path d={`M ${tipX} ${tipY} L ${baseX - uy * wing} ${baseY + ux * wing} L ${baseX + uy * wing} ${baseY - ux * wing} Z`} fill={color} />
    </g>
  );
}

export function GalvanicPanelView({ panel, prev, morph, frame, palette, uid }: Props) {
  const layout = galvanicLayout(panel);
  const t = prev ? morph : 1;
  const left = blendCell(prev?.left, panel.left, t);
  const right = panel.right ? blendCell(prev?.right, panel.right, t) : null;
  const cells = right ? [left, right] : [left];
  const deflection = lerp(prev?.meter?.deflection ?? 0, panel.meter?.deflection ?? 0, t);
  const flowing = (panel.electron_flow ?? "none") !== "none";
  const period = 150;
  const electrons = flowing ? Array.from({ length: 7 }, (_, index) => pointAlong(layout.electronPath, ((frame / period) + index / 7) % 1)) : [];
  const ionPeriod = 120;
  return (
    <g data-chem-panel="galvanic_cell" data-panel-id={panel.id} data-mode={panel.mode}>
      {layout.bridge ? (
        <g data-salt-bridge="true">
          <polyline points={layout.bridge.map((point) => point.join(",")).join(" ")} fill="none" stroke={palette.glass} strokeWidth={layout.bridgeWidth + 3} strokeLinejoin="round" opacity={0.9} />
          <polyline points={layout.bridge.map((point) => point.join(",")).join(" ")} fill="none" stroke={palette.plate} strokeWidth={layout.bridgeWidth - 1} strokeLinejoin="round" />
          <polyline points={layout.bridge.map((point) => point.join(",")).join(" ")} fill="none" stroke={palette.secondary} strokeWidth={layout.bridgeWidth - 8} strokeLinejoin="round" opacity={0.18} />
        </g>
      ) : null}
      {layout.beakers.map((beaker, index) => (
        <Beaker key={index} glass={beaker.glass} liquid={beaker.liquid} tint={cells[index].tint} palette={palette} />
      ))}
      {layout.electrodes.map((shape, index) => (
        <Electrode key={index} shape={{ ...shape, worn: { ...shape.worn, w: shape.body.w * (1 - 0.55 * (cells[index].wear ?? 0)), x: shape.body.x + (shape.body.w - shape.body.w * (1 - 0.55 * (cells[index].wear ?? 0))) / 2 } }} cell={cells[index]} palette={palette} />
      ))}
      {layout.wire.map((segment, index) => (
        <polyline key={index} points={segment.map((point) => point.join(",")).join(" ")} fill="none" stroke={palette.ink2} strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" />
      ))}
      {layout.meter ? (
        <g data-meter={panel.meter?.kind} data-deflection={deflection.toFixed(2)}>
          <circle cx={layout.meter.cx} cy={layout.meter.cy} r={layout.meter.r} fill={palette.plate} stroke={palette.ink2} strokeWidth={2.2} />
          <path
            d={`M ${layout.meter.cx - layout.meter.r * 0.7} ${layout.meter.cy + layout.meter.r * 0.1} A ${layout.meter.r * 0.72} ${layout.meter.r * 0.72} 0 0 1 ${layout.meter.cx + layout.meter.r * 0.7} ${layout.meter.cy + layout.meter.r * 0.1}`}
            fill="none"
            stroke={palette.line2}
            strokeWidth={1.4}
          />
          <line
            x1={layout.meter.cx}
            y1={layout.meter.cy + layout.meter.r * 0.45}
            x2={layout.meter.cx + Math.sin(deflection * 1.05) * layout.meter.r * 0.78}
            y2={layout.meter.cy + layout.meter.r * 0.45 - Math.cos(deflection * 1.05) * layout.meter.r * 0.78}
            stroke={palette.focus}
            strokeWidth={2.2}
            strokeLinecap="round"
          />
          <circle cx={layout.meter.cx} cy={layout.meter.cy + layout.meter.r * 0.45} r={2.6} fill={palette.ink2} />
          <text x={layout.meter.cx} y={layout.meter.cy - layout.meter.r * 0.36} textAnchor="middle" fontSize={layout.meter.r * 0.42} fontWeight={700} fill={palette.ink2}>
            {panel.meter?.kind === "voltmeter" ? "V" : "A"}
          </text>
        </g>
      ) : null}
      {electrons.map(([x, y], index) => (
        <ParticleGlyph key={`e-${index}`} species="e-" x={x} y={y} angle={0} scale={16} palette={palette} uid={uid} />
      ))}
      {(panel.ion_flows ?? []).map((flow) => (
        <g key={`${flow.id}-tracks`}>
          {(layout.routes[flow.route] ?? []).map((lane, index) => (
            <IonTrack
              key={index}
              lane={lane}
              color={palette.ink3}
              opacity={prev?.ion_flows?.some((before) => before.id === flow.id) ? 0.7 : 0.7 * t}
            />
          ))}
        </g>
      ))}
      {(panel.ion_flows ?? []).map((flow) => {
        const lanes = layout.routes[flow.route] ?? [];
        return lanes.map((lane, index) => {
          const phase = ((frame / ionPeriod) + index / lanes.length + (flow.id.length % 5) * 0.07) % 1;
          const [x, y] = pointAlong(lane, phase);
          const fade = Math.min(1, phase * 5, (1 - phase) * 5);
          return (
            <ParticleGlyph key={`${flow.id}-${index}`} species={flow.species} x={x} y={y} angle={0} scale={13} palette={palette} uid={uid} opacity={fade} />
          );
        });
      })}
    </g>
  );
}
