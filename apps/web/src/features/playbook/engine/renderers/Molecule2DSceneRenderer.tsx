import React from "react";

import type { Molecule2DAtom, Molecule2DBond, Molecule2DCallout, Molecule2DSceneSnapshot } from "../types";
import { CoreCalloutLabel } from "./CoreCalloutLabel";
import { CoreFormulaTag } from "./CoreFormulaTag";
import { CoreLabGrid } from "./CoreLabGrid";
import type { RendererProps } from "./types";

function displayFormula(formula: string): string {
  return formula.replace(/_/g, "").replace(/\\/g, "");
}

function atomById(atoms: Molecule2DAtom[], id: string): Molecule2DAtom | undefined {
  return atoms.find((atom) => atom.id === id);
}

function bondOffset(from: Molecule2DAtom, to: Molecule2DAtom, distance: number): { x: number; y: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  return {
    x: (-dy / length) * distance,
    y: (dx / length) * distance,
  };
}

function renderBondLine(
  bond: Molecule2DBond,
  from: Molecule2DAtom,
  to: Molecule2DAtom,
  offsetDistance: number,
  key: string,
) {
  const offset = bondOffset(from, to, offsetDistance);
  return (
    <line
      key={key}
      x1={from.x + offset.x}
      y1={from.y + offset.y}
      x2={to.x + offset.x}
      y2={to.y + offset.y}
      stroke="#40546c"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  );
}

function renderBond(bond: Molecule2DBond, atoms: Molecule2DAtom[]) {
  const from = atomById(atoms, bond.from);
  const to = atomById(atoms, bond.to);
  if (!from || !to) return null;

  const offsets = bond.order === 1 ? [0] : bond.order === 2 ? [-1.4, 1.4] : [-2.4, 0, 2.4];
  const stereoOffset = bondOffset(from, to, 3);

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
          points={`${from.x},${from.y} ${to.x + stereoOffset.x},${to.y + stereoOffset.y} ${to.x - stereoOffset.x},${to.y - stereoOffset.y}`}
          fill="#40546c"
          opacity="0.82"
        />
      ) : bond.stereo === "dash" ? (
        Array.from({ length: 6 }, (_, index) => {
          const ratio = (index + 1) / 7;
          const x = from.x + (to.x - from.x) * ratio;
          const y = from.y + (to.y - from.y) * ratio;
          const halfWidth = 0.35 + ratio * 2.2;
          const offset = bondOffset(from, to, halfWidth);
          return (
            <line
              key={`${bond.id}-dash-${index}`}
              x1={x - offset.x}
              y1={y - offset.y}
              x2={x + offset.x}
              y2={y + offset.y}
              stroke="#40546c"
              strokeWidth="0.9"
              strokeLinecap="round"
            />
          );
        })
      ) : (
        offsets.map((offset) => renderBondLine(bond, from, to, offset, `${bond.id}-${offset}`))
      )}
      {bond.label ? (
        <text
          x={(from.x + to.x) / 2}
          y={(from.y + to.y) / 2 - 3.5}
          textAnchor="middle"
          fontSize="3"
          fontWeight="720"
          fill="#52647d"
        >
          {bond.label}
        </text>
      ) : null}
    </g>
  );
}

function atomRadius(atom: Molecule2DAtom): number {
  if (atom.element.toUpperCase() === "H") return 7;
  if (atom.element.toUpperCase() === "O") return 9.5;
  return 8.2;
}

function atomPalette(element: string): { fill: string; stroke: string; text: string } {
  switch (element.toUpperCase()) {
    case "O":
      return { fill: "#f8e4df", stroke: "#b85c4a", text: "#7a3328" };
    case "N":
      return { fill: "#e5eaf5", stroke: "#667ba8", text: "#344668" };
    case "H":
      return { fill: "#fbfaf6", stroke: "#9aa39d", text: "#4f5852" };
    case "C":
      return { fill: "#ecefea", stroke: "#5d655f", text: "#313733" };
    default:
      return { fill: "#eef3ea", stroke: "#82976f", text: "#405137" };
  }
}

function renderAtom(atom: Molecule2DAtom) {
  const radius = atomRadius(atom);
  const palette = atomPalette(atom.element);

  return (
    <g key={atom.id} data-atom-id={atom.id} data-element={atom.element} data-semantic-role="atom">
      <circle
        cx={atom.x}
        cy={atom.y}
        r={radius}
        fill={palette.fill}
        stroke={palette.stroke}
        strokeWidth="0.9"
      />
      <text
        x={atom.x}
        y={atom.y + 1.8}
        textAnchor="middle"
        fontSize={atom.element.length > 1 ? "5" : "6.1"}
        fontWeight="820"
        fill={palette.text}
      >
        {atom.element}
      </text>
      {atom.charge ? (
        <text x={atom.x + radius * 0.58} y={atom.y - radius * 0.55} textAnchor="middle" fontSize="3" fill="#7f3654">
          {atom.charge}
        </text>
      ) : null}
      {atom.label ? (
        <text x={atom.x} y={atom.y + radius + 4.5} textAnchor="middle" fontSize="3" fill="#52647d">
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
  const side = callout.side ?? (atom.x < 50 ? "left" : "right");
  if (side === "left") return { x1: atom.x - 6, y1: atom.y, x2: Math.max(8, atom.x - 26), y2: atom.y - 8, textAnchor: "end" };
  if (side === "top") return { x1: atom.x, y1: atom.y - 6, x2: atom.x, y2: Math.max(18, atom.y - 22), textAnchor: "middle" };
  if (side === "bottom") return { x1: atom.x, y1: atom.y + 6, x2: atom.x, y2: Math.min(86, atom.y + 24), textAnchor: "middle" };
  return { x1: atom.x + 6, y1: atom.y, x2: Math.min(92, atom.x + 26), y2: atom.y - 8, textAnchor: "start" };
}

function renderCallout(callout: Molecule2DCallout, atoms: Molecule2DAtom[]) {
  const atom = atomById(atoms, callout.target_id);
  if (!atom) return null;
  const anchor = calloutAnchor(atom, callout);
  return (
    <CoreCalloutLabel
      key={callout.id}
      id={callout.id}
      targetId={callout.target_id}
      label={callout.label}
      anchor={anchor}
      rendererKind="molecule_2d_scene"
      stroke="#6b7280"
      textFill="#2f3c50"
    />
  );
}

export const Molecule2DSceneRenderer: React.FC<RendererProps> = ({ step, theme }) => {
  const snap = step.snapshot as Molecule2DSceneSnapshot;

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
        padding: 24,
        background: theme === "dark" ? "#111827" : "#f8fbff",
        color: theme === "dark" ? "#f8fafc" : "#172033",
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <svg width="100%" height="100%" viewBox="0 0 100 100" role="img" aria-label={step.title}>
        <CoreLabGrid rendererKind="molecule_2d_scene" theme={theme} lightFill="#f8fbff" />
        <text x="8" y="12" fontSize="5.6" fontWeight="780" fill={theme === "dark" ? "#f8fafc" : "#172033"}>
          {step.title}
        </text>
        <CoreFormulaTag
          id={`${snap.molecule_id}-formula`}
          text={displayFormula(snap.formula_latex ?? snap.molecule_id)}
          rendererKind="molecule_2d_scene"
          x={38}
          y={14.2}
          width={24}
          height={7.4}
          textY={19}
          textFill="#4f6f82"
        />

        <g
          data-semantic-role="molecule"
          data-structured-molecule="true"
          data-smiles={snap.smiles ?? undefined}
          data-structured-preset-id={snap.molecule_asset_id ?? undefined}
        >
          {snap.bonds.map((bond) => renderBond(bond, snap.atoms))}
          {snap.atoms.map((atom) => renderAtom(atom))}
        </g>

        {(snap.callouts ?? []).map((callout) => renderCallout(callout, snap.atoms))}

        {snap.caption ? (
          <text x="50" y="94" textAnchor="middle" fontSize="3.6" fill={theme === "dark" ? "#cbd5e1" : "#52647d"}>
            {snap.caption}
          </text>
        ) : null}
      </svg>
    </div>
  );
};
