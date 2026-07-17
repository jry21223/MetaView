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

function numericFontSize(fontSize: CoreFormulaTagProps["fontSize"]): number | null {
  if (typeof fontSize === "number") return fontSize;
  if (typeof fontSize === "string") {
    const parsed = Number(fontSize);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function fittedFontSize(text: string, width: number, fontSize: CoreFormulaTagProps["fontSize"]): number | string {
  const requested = numericFontSize(fontSize);
  if (requested == null) return fontSize ?? 3.4;
  const max = (width - 7) / Math.max(1, text.length * 0.64);
  return Number(Math.max(2.4, Math.min(requested, max)).toFixed(2));
}

function textMaskGeometry(
  text: string,
  textX: number,
  textY: number,
  width: number,
  fontSize: number | string,
  textAnchor: CoreFormulaTagProps["textAnchor"],
) {
  const size = numericFontSize(fontSize) ?? 3.4;
  const maskWidth = Math.min(width - 2.4, Math.max(8, text.length * size * 0.58 + 3.8));
  const x = textAnchor === "end" ? textX - maskWidth : textAnchor === "middle" ? textX - maskWidth / 2 : textX;
  return {
    x,
    y: textY - size * 0.78,
    width: maskWidth,
    height: size * 1.18,
    rx: Math.max(0.8, size * 0.32),
  };
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
  const renderedTextX = textX ?? defaultTextX(x, width, textAnchor);
  const renderedTextY = textY ?? y + height * 0.66;
  const renderedFontSize = fittedFontSize(text, width, fontSize);
  const mask = textMaskGeometry(text, renderedTextX, renderedTextY, width, renderedFontSize, textAnchor);

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
      <rect
        data-formula-text-mask="true"
        x={mask.x}
        y={mask.y}
        width={mask.width}
        height={mask.height}
        rx={mask.rx}
        fill="#f7fbff"
        opacity="0.94"
      />
      <text
        x={renderedTextX}
        y={renderedTextY}
        textAnchor={textAnchor}
        fontSize={renderedFontSize}
        data-fitted-font-size={String(renderedFontSize)}
        fontWeight={fontWeight}
        fill={textFill}
      >
        {text}
      </text>
    </g>
  );
}
