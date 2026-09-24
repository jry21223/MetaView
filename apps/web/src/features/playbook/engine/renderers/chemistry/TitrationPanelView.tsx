import React from "react";

import type { ChemTint, ChemTitrationPanel } from "../../kits/chemistry/sceneTypes";
import { titrationLayout } from "../../kits/chemistry/geometry/titration";
import { lerp } from "../../kits/chemistry/transitions";
import { clearSolutionColor, tintFill, type ChemPalette } from "./chemPalette";

interface Props {
  panel: ChemTitrationPanel;
  prev: ChemTitrationPanel | null;
  morph: number;
  frame: number;
  palette: ChemPalette;
}

function mixTint(a: ChemTint, b: ChemTint, t: number): ChemTint {
  if (a.hue === b.hue) return { hue: b.hue, strength: lerp(a.strength, b.strength, t) };
  return t < 0.5 ? { hue: a.hue, strength: a.strength * (1 - 2 * t) } : { hue: b.hue, strength: b.strength * (2 * t - 1) };
}

export function TitrationPanelView({ panel, prev, morph, frame, palette }: Props) {
  const layout = titrationLayout(panel);
  const t = prev ? morph : 1;
  const dispensed = lerp(prev?.dispensed_ml ?? panel.dispensed_ml, panel.dispensed_ml, t);
  const tint = prev ? mixTint(prev.flask_tint, panel.flask_tint, t) : panel.flask_tint;
  const flaskFill = tintFill(palette, tint);
  // The NaOH titrant is colourless.
  const titrantFill = clearSolutionColor(palette);
  const level = layout.levelY(dispensed);
  const { burette } = layout;
  const dropPeriod = 22;
  const dropPhase = (frame % dropPeriod) / dropPeriod;
  const dropY = lerp(layout.tipEnd[1] + 4, layout.liquidTopY, dropPhase);
  const toPath = (points: Array<[number, number]>) => `M ${points.map((point) => point.join(" ")).join(" L ")} Z`;
  return (
    <g data-chem-panel="titration" data-panel-id={panel.id} data-dispensed={panel.dispensed_ml}>
      <rect {...layout.stand.base} rx={2} fill={palette.ink3} opacity={0.5} />
      <rect {...layout.stand.rod} rx={2} fill={palette.ink3} opacity={0.5} />
      <rect {...layout.stand.clamp} rx={2} fill={palette.ink3} opacity={0.6} />
      <rect x={burette.x + 2} y={level} width={burette.w - 4} height={Math.max(0, burette.y + burette.h - level)} fill={titrantFill} opacity={0.45} />
      <rect x={burette.x} y={burette.y} width={burette.w} height={burette.h} rx={3} fill="none" stroke={palette.glass} strokeWidth={2} />
      {layout.ticks.map((tick) => (
        <line key={tick.ml} x1={burette.x} y1={tick.y} x2={burette.x + (tick.major ? burette.w * 0.55 : burette.w * 0.32)} y2={tick.y} stroke={palette.ink3} strokeWidth={tick.major ? 1.3 : 0.9} />
      ))}
      <line x1={burette.x - 3} y1={level} x2={burette.x + burette.w + 3} y2={level} stroke={palette.focus} strokeWidth={2} />
      <rect {...layout.stopcock} rx={3} fill={palette.ink2} opacity={0.75} />
      <path d={toPath(layout.tip)} fill={titrantFill} opacity={0.5} stroke={palette.glass} strokeWidth={1.4} />
      {panel.dripping ? (
        <ellipse cx={layout.tipEnd[0]} cy={dropY} rx={2.6} ry={3.6} fill={titrantFill} stroke={palette.glass} strokeWidth={0.8} opacity={dropPhase < 0.92 ? 0.95 : 0} data-drop="true" />
      ) : null}
      <path d={toPath(layout.flaskLiquid)} fill={flaskFill.color} opacity={flaskFill.opacity + 0.12} data-flask-hue={tint.hue} />
      <path d={toPath(layout.flask)} fill="none" stroke={palette.glass} strokeWidth={2.4} strokeLinejoin="round" />
      <rect {...layout.meter} rx={8} fill={palette.plate} stroke={palette.line2} strokeWidth={1.6} />
    </g>
  );
}
