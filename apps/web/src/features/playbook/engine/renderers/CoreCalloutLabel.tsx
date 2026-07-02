import React from "react";

import { AssetSvg } from "../assets/AssetSvg";
import type { AssetManifestEntry } from "../assets/assetRegistry";
import { resolveAssetByRole, resolveAssetForRenderer } from "../assets/assetResolver";

const CORE_PACK_ID = "core-visual-basic";
const CALLOUT_ROLE = "callout";

export interface CoreCalloutAnchor {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  textAnchor: "start" | "middle" | "end";
}

interface CoreCalloutLabelProps {
  id: string;
  targetId: string;
  label: string;
  anchor: CoreCalloutAnchor;
  rendererKind: string;
  stroke?: string;
  textFill?: string;
  dotRadius?: number;
}

function resolveCoreCalloutAsset(rendererKind: string): AssetManifestEntry | undefined {
  return (
    resolveAssetForRenderer(rendererKind, CALLOUT_ROLE, CORE_PACK_ID) ??
    resolveAssetByRole("core", CALLOUT_ROLE, CORE_PACK_ID) ??
    resolveAssetByRole("core", CALLOUT_ROLE)
  );
}

function calloutWidth(label: string): number {
  return Math.max(20, Math.min(36, label.length * 1.45 + 8));
}

function calloutGeometry(anchor: CoreCalloutAnchor, label: string) {
  const width = calloutWidth(label);
  const height = 8.4;
  const x =
    anchor.textAnchor === "end"
      ? anchor.x2 - width
      : anchor.textAnchor === "middle"
        ? anchor.x2 - width / 2
        : anchor.x2;
  const textX =
    anchor.textAnchor === "end" ? anchor.x2 - 2 : anchor.textAnchor === "middle" ? anchor.x2 : anchor.x2 + 2;
  return {
    x,
    y: anchor.y2 - height + 2,
    width,
    height,
    textX,
    textY: anchor.y2 - 1.2,
  };
}

export function CoreCalloutLabel({
  id,
  targetId,
  label,
  anchor,
  rendererKind,
  stroke = "#64748b",
  textFill = "#243447",
  dotRadius = 1.2,
}: CoreCalloutLabelProps) {
  const asset = resolveCoreCalloutAsset(rendererKind);
  const geometry = calloutGeometry(anchor, label);

  return (
    <g key={id} data-semantic-role="callout" data-callout-id={id} data-target-id={targetId}>
      <path
        d={`M ${anchor.x1} ${anchor.y1} L ${anchor.x2} ${anchor.y2}`}
        fill="none"
        stroke={stroke}
        strokeWidth="0.75"
        strokeLinecap="round"
      />
      <circle cx={anchor.x1} cy={anchor.y1} r={dotRadius} fill={stroke} />
      <AssetSvg
        asset={asset}
        assetId={asset?.id}
        packId={CORE_PACK_ID}
        subject="core"
        semanticRole={CALLOUT_ROLE}
        x={geometry.x}
        y={geometry.y}
        width={geometry.width}
        height={geometry.height}
        preserveAspectRatio="none"
      />
      <text
        x={geometry.textX}
        y={geometry.textY}
        textAnchor={anchor.textAnchor}
        fontSize="2.8"
        fontWeight="760"
        fill={textFill}
      >
        {label}
      </text>
    </g>
  );
}
