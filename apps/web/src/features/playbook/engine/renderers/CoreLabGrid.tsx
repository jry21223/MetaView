import React from "react";

import { AssetSvg } from "../assets/AssetSvg";
import type { AssetManifestEntry } from "../assets/assetRegistry";
import { resolveAssetByRole, resolveAssetForRenderer } from "../assets/assetResolver";

const CORE_PACK_ID = "core-visual-basic";
const LAB_GRID_ROLE = "light_lab_grid";

interface CoreLabGridProps {
  rendererKind: string;
  theme: "light" | "dark";
  lightFill?: string;
  darkFill?: string;
}

function resolveCoreLabGridAsset(rendererKind: string): AssetManifestEntry | undefined {
  return (
    resolveAssetForRenderer(rendererKind, LAB_GRID_ROLE, CORE_PACK_ID) ??
    resolveAssetByRole("core", LAB_GRID_ROLE, CORE_PACK_ID) ??
    resolveAssetByRole("core", "paper_grid", CORE_PACK_ID) ??
    resolveAssetByRole("core", LAB_GRID_ROLE)
  );
}

export function CoreLabGrid({
  rendererKind,
  theme,
  lightFill = "#f7f9fc",
  darkFill = "#111827",
}: CoreLabGridProps) {
  const asset = resolveCoreLabGridAsset(rendererKind);
  const isDark = theme === "dark";

  return (
    <g data-semantic-role="lab_grid">
      <rect x="0" y="0" width="100" height="100" rx="3" fill={isDark ? darkFill : lightFill} />
      <AssetSvg
        asset={asset}
        assetId={asset?.id}
        packId={CORE_PACK_ID}
        subject="core"
        semanticRole={LAB_GRID_ROLE}
        x={0}
        y={0}
        width={100}
        height={100}
        opacity={isDark ? 0.12 : 1}
        preserveAspectRatio="none"
      />
      {isDark ? <rect x="0" y="0" width="100" height="100" rx="3" fill={darkFill} opacity="0.82" /> : null}
    </g>
  );
}
