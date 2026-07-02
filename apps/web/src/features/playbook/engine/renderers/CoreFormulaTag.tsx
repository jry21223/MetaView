import React from "react";

import { AssetSvg } from "../assets/AssetSvg";
import type { AssetManifestEntry } from "../assets/assetRegistry";
import { resolveAssetByRole, resolveAssetForRenderer } from "../assets/assetResolver";

const CORE_PACK_ID = "core-visual-basic";
const FORMULA_ROLE = "formula_tag";

interface CoreFormulaTagProps {
  id: string;
  text: string;
  rendererKind: string;
  x: number;
  y: number;
  width: number;
  height: number;
  textAnchor?: "start" | "middle" | "end";
  textX?: number;
  textY?: number;
  fontSize?: number | string;
  fontWeight?: number | string;
  textFill?: string;
  opacity?: number | string;
}

function resolveCoreFormulaAsset(rendererKind: string): AssetManifestEntry | undefined {
  return (
    resolveAssetForRenderer(rendererKind, FORMULA_ROLE, CORE_PACK_ID) ??
    resolveAssetByRole("core", FORMULA_ROLE, CORE_PACK_ID) ??
    resolveAssetByRole("core", "formula", CORE_PACK_ID) ??
    resolveAssetByRole("core", FORMULA_ROLE)
  );
}

function defaultTextX(x: number, width: number, textAnchor: CoreFormulaTagProps["textAnchor"]): number {
  if (textAnchor === "start") return x + 2.4;
  if (textAnchor === "end") return x + width - 2.4;
  return x + width / 2;
}

export function CoreFormulaTag({
  id,
  text,
  rendererKind,
  x,
  y,
  width,
  height,
  textAnchor = "middle",
  textX,
  textY,
  fontSize = 3.4,
  fontWeight = 760,
  textFill = "#243447",
  opacity = 0.96,
}: CoreFormulaTagProps) {
  const asset = resolveCoreFormulaAsset(rendererKind);

  return (
    <g data-semantic-role="formula_card" data-formula-tag-id={id}>
      <AssetSvg
        asset={asset}
        assetId={asset?.id}
        packId={CORE_PACK_ID}
        subject="core"
        semanticRole={FORMULA_ROLE}
        x={x}
        y={y}
        width={width}
        height={height}
        opacity={opacity}
        preserveAspectRatio="none"
      />
      <text
        x={textX ?? defaultTextX(x, width, textAnchor)}
        y={textY ?? y + height * 0.66}
        textAnchor={textAnchor}
        fontSize={fontSize}
        fontWeight={fontWeight}
        fill={textFill}
      >
        {text}
      </text>
    </g>
  );
}
