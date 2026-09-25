import React from "react";

import type { ChemMoleculesPanel } from "../../kits/chemistry/sceneTypes";
import { projectMoleculesPanel, type ProjectedAtom } from "../../kits/chemistry/projection";
import { arrowCurves, BOND_RADIUS_ANGSTROM, bondSegments, reactionArrowSegment } from "../../kits/chemistry/geometry/molecules";
import { morphMolecules, type BondDrawState } from "../../kits/chemistry/transitions";
import { sphereColors, toneColor, type ChemPalette } from "./chemPalette";
import { AtomSphere, SphereGradient } from "./AtomSphere";

interface Props {
  panel: ChemMoleculesPanel;
  prev: ChemMoleculesPanel | null;
  morph: number;
  /** 0–1 reveal of curly arrows (they follow the settled geometry). */
  arrowReveal: number;
  palette: ChemPalette;
  uid: string;
}

type Drawable =
  | { kind: "atom"; depth: number; atom: ProjectedAtom }
  | { kind: "bond"; depth: number; state: BondDrawState; from: ProjectedAtom; to: ProjectedAtom };

const TUCK = 0.55;

function BondStroke({
  x1, y1, x2, y2, width, color, highlight, dashed, opacity,
}: { x1: number; y1: number; x2: number; y2: number; width: number; color: string; highlight: string; dashed: boolean; opacity: number }) {
  return (
    <g opacity={opacity}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={width} strokeLinecap="round" strokeDasharray={dashed ? `${width * 1.1} ${width * 1.2}` : undefined} />
      {!dashed ? (
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={highlight} strokeWidth={width * 0.34} strokeLinecap="round" opacity={0.55} transform={`translate(${-width * 0.18} ${-width * 0.18})`} />
      ) : null}
    </g>
  );
}

function renderBond(
  item: Extract<Drawable, { kind: "bond" }>,
  panel: ChemMoleculesPanel,
  palette: ChemPalette,
) {
  const { state, from, to } = item;
  const dx = to.sx - from.sx;
  const dy = to.sy - from.sy;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  const nx = -uy;
  const ny = ux;
  const width = Math.max(2.4, panel.scale * BOND_RADIUS_ANGSTROM * 2) * (state.order === 1 ? 1 : 0.72);
  const gap = Math.max(2.4, panel.scale * BOND_RADIUS_ANGSTROM * 2) * 1.15;
  const offsets = state.order === 1 ? [0] : state.order === 2 ? [-gap / 2 - 0.5, gap / 2 + 0.5] : [-gap, 0, gap];
  const sx = from.sx + ux * from.r * TUCK;
  const sy = from.sy + uy * from.r * TUCK;
  const ex = to.sx - ux * to.r * TUCK;
  const ey = to.sy - uy * to.r * TUCK;
  const mx = (sx + ex) / 2;
  const my = (sy + ey) / 2;
  const partial = state.bond.state === "partial";
  const fromColors = sphereColors(palette, from.atom.element, from.depthNorm);
  const toColors = sphereColors(palette, to.atom.element, to.depthNorm);
  const accent = state.bond.tone ? toneColor(palette, state.bond.tone) : null;
  const halves: Array<{ ax: number; ay: number; bx: number; by: number; color: string; highlight: string }> = [];
  const half = Math.hypot(mx - sx, my - sy);
  if (state.phase === "forming") {
    // Grow from both atoms toward the middle, then lock.
    const grow = half * state.progress;
    halves.push({ ax: sx, ay: sy, bx: sx + ux * grow, by: sy + uy * grow, color: fromColors.shade, highlight: fromColors.highlight });
    halves.push({ ax: ex, ay: ey, bx: ex - ux * grow, by: ey - uy * grow, color: toColors.shade, highlight: toColors.highlight });
  } else if (state.phase === "breaking") {
    // Crack open at the middle and pull back.
    const retreat = half * state.progress;
    halves.push({ ax: sx, ay: sy, bx: mx - ux * retreat, by: my - uy * retreat, color: fromColors.shade, highlight: fromColors.highlight });
    halves.push({ ax: ex, ay: ey, bx: mx + ux * retreat, by: my + uy * retreat, color: toColors.shade, highlight: toColors.highlight });
  } else {
    halves.push({ ax: sx, ay: sy, bx: mx, by: my, color: fromColors.shade, highlight: fromColors.highlight });
    halves.push({ ax: ex, ay: ey, bx: mx, by: my, color: toColors.shade, highlight: toColors.highlight });
  }
  const opacity = state.phase === "breaking" ? 1 - state.progress * 0.85 : 1;
  return (
    <g
      key={`bond-${state.bond.id}-${state.phase}`}
      data-bond-id={state.bond.id}
      data-bond-phase={state.phase}
      data-bond-order={state.order}
      data-bond-state={partial ? "partial" : "stable"}
    >
      {offsets.map((offset) =>
        halves.map((segment, index) => (
          <BondStroke
            key={`${offset}-${index}`}
            x1={segment.ax + nx * offset}
            y1={segment.ay + ny * offset}
            x2={segment.bx + nx * offset}
            y2={segment.by + ny * offset}
            width={width}
            color={accent ?? (partial ? palette.ink2 : segment.color)}
            highlight={segment.highlight}
            dashed={partial}
            opacity={opacity}
          />
        )),
      )}
      {state.phase === "breaking" && state.progress > 0.05 && state.progress < 0.95 ? (
        <circle cx={mx} cy={my} r={width * (1 + state.progress)} fill="none" stroke={palette.focus} strokeWidth={1.4} opacity={0.7 * (1 - state.progress)} />
      ) : null}
      {state.phase === "forming" && state.progress > 0.7 && state.progress < 1 ? (
        <circle cx={mx} cy={my} r={width * 1.6} fill="none" stroke={palette.focus} strokeWidth={1.4} opacity={(1 - state.progress) * 2.4} />
      ) : null}
    </g>
  );
}

export function MoleculesPanelView({ panel, prev, morph, arrowReveal, palette, uid }: Props) {
  const state = morphMolecules(prev, panel, morph);
  const atoms = projectMoleculesPanel(state.panel);
  const byId = new Map(atoms.map((atom) => [atom.id, atom]));
  const ballStick = (panel.style ?? "ball_stick") === "ball_stick";
  const drawables: Drawable[] = atoms.map((atom) => ({ kind: "atom", depth: atom.depth, atom }));
  if (ballStick) {
    for (const bondState of state.bonds) {
      const from = byId.get(bondState.bond.from);
      const to = byId.get(bondState.bond.to);
      if (!from || !to) continue;
      drawables.push({ kind: "bond", depth: Math.min(from.depth, to.depth) - 0.01, state: bondState, from, to });
    }
  }
  drawables.sort((a, b) => a.depth - b.depth);
  const settled = projectMoleculesPanel(panel);
  const arrows = arrowCurves(panel, settled, bondSegments(panel, settled));
  const reaction = reactionArrowSegment(panel);
  return (
    <g data-chem-panel="molecules" data-panel-id={panel.id} data-style={panel.style ?? "ball_stick"}>
      <defs>
        {atoms.map((atom) => (
          <SphereGradient key={atom.id} id={`${uid}-${panel.id}-${atom.id}`} palette={palette} element={atom.atom.element} depth={atom.depthNorm} />
        ))}
        <marker id={`${uid}-${panel.id}-arrowhead`} viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 L3,5 Z" fill={palette.focus} />
        </marker>
      </defs>
      {reaction ? (
        <g data-reaction-arrow={panel.reaction_arrow?.reversible ? "reversible" : "forward"} stroke={palette.ink2} strokeWidth={2.2} strokeLinecap="round" fill="none">
          {panel.reaction_arrow?.reversible ? (
            <>
              <path d={`M ${reaction.x1} ${reaction.y1 - 4} L ${reaction.x2} ${reaction.y2 - 4} l -9 -6`} />
              <path d={`M ${reaction.x2} ${reaction.y2 + 4} L ${reaction.x1} ${reaction.y1 + 4} l 9 6`} />
            </>
          ) : (
            <path d={`M ${reaction.x1} ${reaction.y1} L ${reaction.x2} ${reaction.y2} m -10 -6 l 10 6 l -10 6`} />
          )}
        </g>
      ) : null}
      {drawables.map((item) =>
        item.kind === "bond" ? (
          renderBond(item, panel, palette)
        ) : (
          <AtomSphere
            key={`atom-${item.atom.id}`}
            atomId={item.atom.id}
            gradientId={`${uid}-${panel.id}-${item.atom.id}`}
            palette={palette}
            element={item.atom.atom.element}
            isotope={item.atom.atom.isotope}
            cx={item.atom.sx}
            cy={item.atom.sy}
            r={item.atom.r}
            depth={item.atom.depthNorm}
            charge={item.atom.atom.charge}
            previousCharge={state.previousCharge.get(item.atom.id)}
            chargeMix={morph}
            tone={item.atom.atom.tone}
            opacity={state.atomOpacity.get(item.atom.id) ?? 1}
          />
        ),
      )}
      {arrows.map((curve) => {
        const d = `M ${curve.start[0]} ${curve.start[1]} Q ${curve.control[0]} ${curve.control[1]} ${curve.end[0]} ${curve.end[1]}`;
        return (
          <path
            key={curve.id}
            data-curly-arrow={curve.id}
            d={d}
            fill="none"
            stroke={palette.focus}
            strokeWidth={2.6}
            strokeLinecap="round"
            pathLength={1}
            strokeDasharray="1 1"
            strokeDashoffset={1 - arrowReveal}
            markerEnd={arrowReveal > 0.92 ? `url(#${uid}-${panel.id}-arrowhead)` : undefined}
          />
        );
      })}
    </g>
  );
}
