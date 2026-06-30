import React from "react";

import { AssetSvg } from "../assets/AssetSvg";
import type { AssetManifestEntry } from "../assets/assetRegistry";
import { resolveAssetById, resolveAssetByRole, resolveAssetForRenderer } from "../assets/assetResolver";
import type { Molecule2DAtom, Molecule2DBond, Molecule2DCallout, Molecule2DSceneSnapshot } from "../types";
import type { RendererProps } from "./types";

const DEFAULT_CHEMISTRY_PACK_ID = "chemistry-basic";

function resolveMoleculeAsset(snapshot: Molecule2DSceneSnapshot, packId: string): AssetManifestEntry | undefined {
  if (snapshot.molecule_asset_id) return resolveAssetById(packId, snapshot.molecule_asset_id);
  return (
    resolveAssetForRenderer("molecule_2d_scene", snapshot.molecule_id, packId) ??
    resolveAssetForRenderer("molecule_2d_scene", "molecule", packId) ??
    resolveAssetByRole("chemistry", snapshot.molecule_id, packId) ??
    resolveAssetByRole("chemistry", "molecule", packId)
  );
}

function resolvePrimitiveAsset(
  semanticRole: "atom" | "bond",
  packId: string,
  assetId?: string | null,
): AssetManifestEntry | undefined {
  if (assetId) return resolveAssetById(packId, assetId);
  return (
    resolveAssetForRenderer("molecule_2d_scene", semanticRole, packId) ??
    resolveAssetByRole("chemistry", semanticRole, packId) ??
    resolveAssetByRole("chemistry", semanticRole)
  );
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

function renderBond(bond: Molecule2DBond, atoms: Molecule2DAtom[], packId: string) {
  const from = atomById(atoms, bond.from);
  const to = atomById(atoms, bond.to);
  if (!from || !to) return null;

  const bondAsset = resolvePrimitiveAsset("bond", packId, bond.asset_id);
  const offsets = bond.order === 1 ? [0] : bond.order === 2 ? [-1.4, 1.4] : [-2.4, 0, 2.4];

  return (
    <g
      key={bond.id}
      data-bond-id={bond.id}
      data-semantic-role="bond"
      data-asset-id={bondAsset?.id ?? bond.asset_id ?? undefined}
      data-asset-path={bondAsset?.path}
      data-bond-order={bond.order}
    >
      {offsets.map((offset) => renderBondLine(bond, from, to, offset, `${bond.id}-${offset}`))}
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

function renderAtom(atom: Molecule2DAtom, packId: string) {
  const radius = atomRadius(atom);
  const atomAsset = resolvePrimitiveAsset("atom", packId, atom.asset_id);

  return (
    <g key={atom.id} data-atom-id={atom.id} data-element={atom.element} data-semantic-role="atom">
      <AssetSvg
        asset={atomAsset}
        assetId={atom.asset_id ?? atomAsset?.id}
        packId={packId}
        subject="chemistry"
        semanticRole="atom"
        x={atom.x - radius}
        y={atom.y - radius}
        width={radius * 2}
        height={radius * 2}
        fallbackShape="circle"
      />
      <text
        x={atom.x}
        y={atom.y + 1.8}
        textAnchor="middle"
        fontSize={atom.element.length > 1 ? "5" : "6.1"}
        fontWeight="820"
        fill="#233044"
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
    <g key={callout.id} data-semantic-role="callout" data-target-id={callout.target_id}>
      <path d={`M ${anchor.x1} ${anchor.y1} L ${anchor.x2} ${anchor.y2}`} fill="none" stroke="#6b7280" strokeWidth="0.7" />
      <circle cx={anchor.x1} cy={anchor.y1} r="1.2" fill="#6b7280" />
      <text
        x={anchor.textAnchor === "end" ? anchor.x2 - 2 : anchor.textAnchor === "middle" ? anchor.x2 : anchor.x2 + 2}
        y={anchor.y2 - 1.6}
        textAnchor={anchor.textAnchor}
        fontSize="3"
        fontWeight="740"
        fill="#2f3c50"
      >
        {callout.label}
      </text>
    </g>
  );
}

export const Molecule2DSceneRenderer: React.FC<RendererProps> = ({ step, theme }) => {
  const snap = step.snapshot as Molecule2DSceneSnapshot;
  const packId = snap.pack_id ?? DEFAULT_CHEMISTRY_PACK_ID;
  const moleculeAsset = resolveMoleculeAsset(snap, packId);

  return (
    <div
      className="molecule-2d-scene"
      data-theme={theme}
      data-molecule-id={snap.molecule_id}
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
        <defs>
          <linearGradient id="chemistry-lab-grid" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor="#fbfdff" />
            <stop offset="1" stopColor="#edf5f8" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="100" height="100" rx="3" fill={theme === "dark" ? "#111827" : "url(#chemistry-lab-grid)"} />
        <path d="M 10 24 H 90 M 10 42 H 90 M 10 60 H 90 M 10 78 H 90 M 24 14 V 84 M 44 14 V 84 M 64 14 V 84 M 84 14 V 84" fill="none" stroke="#bdd0dd" strokeWidth="0.28" opacity="0.3" />
        <text x="8" y="12" fontSize="5.6" fontWeight="780" fill={theme === "dark" ? "#f8fafc" : "#172033"}>
          {step.title}
        </text>
        <text x="92" y="12" textAnchor="end" fontSize="3.4" fontWeight="760" fill="#4f6f82">
          {snap.formula_latex ?? snap.molecule_id}
        </text>

        <g
          data-semantic-role="molecule"
          data-structured-molecule="true"
          data-asset-id={moleculeAsset?.id ?? snap.molecule_asset_id ?? undefined}
          data-asset-path={moleculeAsset?.path}
          data-asset-type={moleculeAsset?.type}
        >
          {snap.bonds.map((bond) => renderBond(bond, snap.atoms, packId))}
          {snap.atoms.map((atom) => renderAtom(atom, packId))}
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
