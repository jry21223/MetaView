import React from "react";

import type { Molecule2DAtom, Molecule2DBond, Molecule2DCallout, Molecule2DSceneSnapshot } from "../types";
import { elementStyle } from "../kits/chemistry/elements";
import { CoreCalloutLabel } from "./CoreCalloutLabel";
import { CoreFormulaTag } from "./CoreFormulaTag";
import { CoreLabGrid } from "./CoreLabGrid";
import { chemPalette, sphereColors, type ChemPalette } from "./chemistry/chemPalette";
import { AtomSphere, SphereGradient } from "./chemistry/AtomSphere";
import type { RendererProps } from "./types";

/**
 * `molecule_2d_scene`: a flat structure from generated runs, drawn with the
 * same shaded CPK spheres and two-tone sticks as the chemistry kit.
 *
 * Atom coordinates arrive in a 0–100 square. The canvas is widened to the
 * stage's own proportion (178 × 100) and the square is centred in it, so the
 * molecule keeps its bond angles while the title, formula and callouts get
 * the side room the old square canvas never had.
 */

const CANVAS_WIDTH = 178;
const OFFSET_X = (CANVAS_WIDTH - 100) / 2;
/** Canvas units per ångström for sphere size, tuned to the ~13–20-unit bonds generated layouts use. */
const UNITS_PER_ANGSTROM = 14;

/** Plain digits ("C6H12O6"): showcase fixtures and blueprint tests match on this text. */
function displayFormula(formula: string): string {
  return formula.replace(/_/g, "").replace(/\\/g, "");
}

function atomById(atoms: Molecule2DAtom[], id: string): Molecule2DAtom | undefined {
  return atoms.find((atom) => atom.id === id);
}

function atomRadius(atom: Molecule2DAtom): number {
  return Math.max(4.2, elementStyle(atom.element).ballRadius * UNITS_PER_ANGSTROM);
}

function place(atom: Molecule2DAtom): { x: number; y: number } {
  return { x: atom.x + OFFSET_X, y: atom.y };
}

function bondOffset(dx: number, dy: number, distance: number): { x: number; y: number } {
  const length = Math.hypot(dx, dy) || 1;
  return { x: (-dy / length) * distance, y: (dx / length) * distance };
}

function renderBond(bond: Molecule2DBond, atoms: Molecule2DAtom[], palette: ChemPalette) {
  const fromAtom = atomById(atoms, bond.from);
  const toAtom = atomById(atoms, bond.to);
  if (!fromAtom || !toAtom) return null;
  const from = place(fromAtom);
  const to = place(toAtom);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  const width = bond.order === 1 ? 1.9 : 1.3;
  const offsets = bond.order === 1 ? [0] : bond.order === 2 ? [-1.25, 1.25] : [-2.1, 0, 2.1];
  const fromColor = sphereColors(palette, fromAtom.element).shade;
  const toColor = sphereColors(palette, toAtom.element).shade;
  const stereo = bondOffset(dx, dy, 2.6);

  return (
    <g
      key={bond.id}
      data-bond-id={bond.id}
      data-semantic-role="bond"
      data-bond-order={bond.order}
      data-bond-stereo={bond.stereo ?? undefined}
    >
      {bond.stereo === "wedge" ? (
        <polygon
          points={`${from.x},${from.y} ${to.x + stereo.x},${to.y + stereo.y} ${to.x - stereo.x},${to.y - stereo.y}`}
          fill={palette.ink2}
          opacity="0.82"
        />
      ) : bond.stereo === "dash" ? (
        Array.from({ length: 6 }, (_, index) => {
          const ratio = (index + 1) / 7;
          const x = from.x + dx * ratio;
          const y = from.y + dy * ratio;
          const offset = bondOffset(dx, dy, 0.35 + ratio * 2.2);
          return (
            <line key={`${bond.id}-dash-${index}`} x1={x - offset.x} y1={y - offset.y} x2={x + offset.x} y2={y + offset.y} stroke={palette.ink2} strokeWidth="0.9" strokeLinecap="round" />
          );
        })
      ) : (
        offsets.map((distance) => {
          const offset = bondOffset(dx, dy, distance);
          return (
            <g key={`${bond.id}-${distance}`}>
              <line x1={from.x + offset.x} y1={from.y + offset.y} x2={mid.x + offset.x} y2={mid.y + offset.y} stroke={fromColor} strokeWidth={width} strokeLinecap="round" />
              <line x1={mid.x + offset.x} y1={mid.y + offset.y} x2={to.x + offset.x} y2={to.y + offset.y} stroke={toColor} strokeWidth={width} strokeLinecap="round" />
            </g>
          );
        })
      )}
      {bond.label ? (
        <text x={mid.x} y={mid.y - 3.5} textAnchor="middle" fontSize="3" fontWeight="650" fill={palette.ink2}>
          {bond.label}
        </text>
      ) : null}
    </g>
  );
}

function renderAtom(atom: Molecule2DAtom, palette: ChemPalette, gradientId: string) {
  const { x, y } = place(atom);
  const radius = atomRadius(atom);
  return (
    <g key={atom.id} data-atom-id={atom.id} data-element={atom.element} data-semantic-role="atom">
      <AtomSphere gradientId={gradientId} palette={palette} element={atom.element} cx={x} cy={y} r={radius} minSymbolRadius={3.5} />
      {atom.charge ? (
        // Generated structures carry free-form charge text ("δ+", "2−"), not a formal charge.
        <text x={x + radius * 0.9} y={y - radius * 0.8} textAnchor="start" fontSize="3" fontWeight="700" fill={palette.focus}>
          {atom.charge}
        </text>
      ) : null}
      {atom.label ? (
        <text x={x} y={y + radius + 4.2} textAnchor="middle" fontSize="2.9" fill={palette.ink2}>
          {atom.label}
        </text>
      ) : null}
    </g>
  );
}

function calloutAnchor(
  atom: Molecule2DAtom,
  callout: Molecule2DCallout,
): { x1: number; y1: number; x2: number; y2: number; textAnchor: "start" | "middle" | "end" } {
  const { x, y } = place(atom);
  const radius = atomRadius(atom) + 1;
  const side = callout.side ?? (atom.x < 50 ? "left" : "right");
  if (side === "left") return { x1: x - radius, y1: y, x2: Math.max(6, x - 28), y2: y - 8, textAnchor: "end" };
  if (side === "top") return { x1: x, y1: y - radius, x2: x, y2: Math.max(20, y - 22), textAnchor: "middle" };
  if (side === "bottom") return { x1: x, y1: y + radius, x2: x, y2: Math.min(86, y + 24), textAnchor: "middle" };
  return { x1: x + radius, y1: y, x2: Math.min(CANVAS_WIDTH - 6, x + 28), y2: y - 8, textAnchor: "start" };
}

export const Molecule2DSceneRenderer: React.FC<RendererProps> = ({ step, theme }) => {
  const snap = step.snapshot as Molecule2DSceneSnapshot;
  const palette = chemPalette(theme);
  const uid = `m2d${React.useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const elements = [...new Set(snap.atoms.map((atom) => atom.element))];

  return (
    <div
      className="molecule-2d-scene"
      data-theme={theme}
      data-molecule-id={snap.molecule_id}
      data-smiles={snap.smiles ?? undefined}
      style={{
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
        padding: 12,
        background: palette.surface,
        color: palette.ink,
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <svg width="100%" height="100%" viewBox={`0 0 ${CANVAS_WIDTH} 100`} role="img" aria-label={step.title}>
        <defs>
          {elements.map((element) => (
            <SphereGradient key={element} id={`${uid}-${element}`} palette={palette} element={element} />
          ))}
        </defs>
        <CoreLabGrid rendererKind="molecule_2d_scene" theme={theme} width={CANVAS_WIDTH} />
        <text x="8" y="11" fontSize="5" fontWeight="650" fill={palette.ink}>
          {step.title}
        </text>
        <CoreFormulaTag
          id={`${snap.molecule_id}-formula`}
          text={displayFormula(snap.formula_latex ?? snap.molecule_id)}
          rendererKind="molecule_2d_scene"
          x={CANVAS_WIDTH - 34}
          y={5}
          width={28}
          height={7.4}
          textY={10.2}
          textFill={palette.ink}
          fill={palette.plate}
          stroke={palette.line2}
        />

        <g
          data-semantic-role="molecule"
          data-structured-molecule="true"
          data-smiles={snap.smiles ?? undefined}
          data-structured-preset-id={snap.molecule_asset_id ?? undefined}
        >
          {snap.bonds.map((bond) => renderBond(bond, snap.atoms, palette))}
          {snap.atoms.map((atom) => renderAtom(atom, palette, `${uid}-${atom.element}`))}
        </g>

        {(snap.callouts ?? []).map((callout) => {
          const atom = atomById(snap.atoms, callout.target_id);
          if (!atom) return null;
          return (
            <CoreCalloutLabel
              key={callout.id}
              id={callout.id}
              targetId={callout.target_id}
              label={callout.label}
              anchor={calloutAnchor(atom, callout)}
              rendererKind="molecule_2d_scene"
              stroke={palette.ink3}
              textFill={palette.ink}
              fill={palette.plate}
            />
          );
        })}

        {snap.caption ? (
          <text x={CANVAS_WIDTH / 2} y="95" textAnchor="middle" fontSize="3.4" fill={palette.ink2}>
            {snap.caption}
          </text>
        ) : null}
      </svg>
    </div>
  );
};
