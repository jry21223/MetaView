import React from "react";

import { AssetSvg } from "../assets/AssetSvg";
import type { AssetManifestEntry } from "../assets/assetRegistry";
import { resolveAssetById, resolveAssetByRole, resolveAssetForRenderer } from "../assets/assetResolver";
import type { BioCellCallout, BioCellSceneSnapshot, BioCellStructure } from "../types";
import type { RendererProps } from "./types";

const DEFAULT_BIOLOGY_PACK_ID = "biology-basic";

function resolveStructureAsset(structure: BioCellStructure, packId: string): AssetManifestEntry | undefined {
  if (structure.asset_id) return resolveAssetById(packId, structure.asset_id);
  return (
    resolveAssetForRenderer("bio_cell_scene", structure.semantic_role, packId) ??
    resolveAssetByRole("biology", structure.semantic_role, packId) ??
    resolveAssetByRole("biology", structure.semantic_role)
  );
}

function structureById(structures: BioCellStructure[], id: string): BioCellStructure | undefined {
  return structures.find((structure) => structure.id === id);
}

function calloutAnchor(
  target: BioCellStructure,
  callout: BioCellCallout,
): { x1: number; y1: number; x2: number; y2: number; textAnchor: "start" | "middle" | "end" } {
  const side = callout.side ?? (target.x < 50 ? "left" : "right");
  if (side === "left") {
    return { x1: target.x - target.width / 2 + 2, y1: target.y, x2: Math.max(7, target.x - 32), y2: target.y - 7, textAnchor: "end" };
  }
  if (side === "top") {
    return { x1: target.x, y1: target.y - target.height / 2 + 1, x2: target.x, y2: Math.max(20, target.y - 24), textAnchor: "middle" };
  }
  if (side === "bottom") {
    return { x1: target.x, y1: target.y + target.height / 2 - 1, x2: target.x, y2: Math.min(86, target.y + 24), textAnchor: "middle" };
  }
  return { x1: target.x + target.width / 2 - 2, y1: target.y, x2: Math.min(93, target.x + 32), y2: target.y - 7, textAnchor: "start" };
}

function renderCallout(callout: BioCellCallout, structures: BioCellStructure[]) {
  const target = structureById(structures, callout.target_id);
  if (!target) return null;
  const anchor = calloutAnchor(target, callout);
  return (
    <g key={callout.id} data-semantic-role="callout" data-target-id={callout.target_id}>
      <path
        d={`M ${anchor.x1} ${anchor.y1} L ${anchor.x2} ${anchor.y2}`}
        fill="none"
        stroke="#4f6f5a"
        strokeWidth="0.8"
        strokeLinecap="round"
      />
      <circle cx={anchor.x1} cy={anchor.y1} r="1.3" fill="#4f6f5a" />
      <rect
        x={anchor.textAnchor === "end" ? anchor.x2 - 25 : anchor.textAnchor === "middle" ? anchor.x2 - 14 : anchor.x2}
        y={anchor.y2 - 6.2}
        width={anchor.textAnchor === "middle" ? 28 : 25}
        height="8.2"
        rx="2"
        fill="#ffffff"
        stroke="#d8e1d7"
        opacity="0.96"
      />
      <text
        x={anchor.textAnchor === "end" ? anchor.x2 - 2 : anchor.textAnchor === "middle" ? anchor.x2 : anchor.x2 + 2}
        y={anchor.y2 - 1.2}
        textAnchor={anchor.textAnchor}
        fontSize="2.8"
        fontWeight="760"
        fill="#26384a"
      >
        {callout.label}
      </text>
    </g>
  );
}

export const BioCellSceneRenderer: React.FC<RendererProps> = ({ step, progress, theme }) => {
  const snap = step.snapshot as BioCellSceneSnapshot;
  const packId = snap.pack_id ?? DEFAULT_BIOLOGY_PACK_ID;
  const structures = [...snap.structures].sort((a, b) => {
    if (a.semantic_role === "cell") return -1;
    if (b.semantic_role === "cell") return 1;
    return 0;
  });
  const p = Math.max(0, Math.min(1, progress));

  return (
    <div
      className="bio-cell-scene"
      data-theme={theme}
      data-cell-type={snap.cell_type ?? "cell"}
      style={{
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
        padding: 24,
        background: theme === "dark" ? "#111827" : "#f7fbf7",
        color: theme === "dark" ? "#f8fafc" : "#182235",
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <svg width="100%" height="100%" viewBox="0 0 100 100" role="img" aria-label={step.title}>
        <defs>
          <linearGradient id="bio-lab-grid" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor="#f8fff6" />
            <stop offset="1" stopColor="#e5f1ea" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="100" height="100" rx="3" fill={theme === "dark" ? "#111827" : "url(#bio-lab-grid)"} />
        <path d="M 8 24 H 92 M 8 42 H 92 M 8 60 H 92 M 8 78 H 92 M 22 16 V 84 M 42 16 V 84 M 62 16 V 84 M 82 16 V 84" fill="none" stroke="#b8c8bd" strokeWidth="0.28" opacity="0.28" />
        <text x="8" y="12" fontSize="5.6" fontWeight="780" fill={theme === "dark" ? "#f8fafc" : "#182235"}>
          {step.title}
        </text>
        <text x="92" y="12" textAnchor="end" fontSize="3.5" fontWeight="760" fill="#5b8c6a">
          {snap.cell_type ?? "cell"}
        </text>

        {structures.map((structure, index) => {
          const asset = resolveStructureAsset(structure, packId);
          const opacity = index === 0 ? 1 : Math.max(0.72, Math.min(1, p + 0.72));
          return (
            <g
              key={structure.id}
              data-structure-id={structure.id}
              data-semantic-role={structure.semantic_role}
              opacity={opacity}
            >
              <AssetSvg
                asset={asset}
                assetId={structure.asset_id ?? asset?.id}
                packId={packId}
                subject="biology"
                semanticRole={structure.semantic_role}
                x={structure.x - structure.width / 2}
                y={structure.y - structure.height / 2}
                width={structure.width}
                height={structure.height}
                fallbackShape="rect"
              />
              {structure.label ? (
                <text
                  x={structure.x}
                  y={structure.y + structure.height / 2 + 4.2}
                  textAnchor="middle"
                  fontSize="3"
                  fontWeight="760"
                  fill="#34513f"
                >
                  {structure.label}
                </text>
              ) : null}
            </g>
          );
        })}

        {(snap.callouts ?? []).map((callout) => renderCallout(callout, structures))}

        {snap.caption ? (
          <text x="50" y="94" textAnchor="middle" fontSize="3.6" fill={theme === "dark" ? "#cbd5e1" : "#566b5d"}>
            {snap.caption}
          </text>
        ) : null}
      </svg>
    </div>
  );
};
