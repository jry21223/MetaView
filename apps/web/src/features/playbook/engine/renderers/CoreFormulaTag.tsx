import React from "react";

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
  const renderedTextX = textX ?? defaultTextX(x, width, textAnchor);
  const renderedTextY = textY ?? y + height * 0.66;
  const renderedFontSize = fittedFontSize(text, width, fontSize);

  return (
    <g
      data-semantic-role="formula_card"
      data-formula-tag-id={id}
      data-renderer-kind={rendererKind}
      opacity={opacity}
    >
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx="1.6"
        fill="#ffffff"
        stroke="#d6d1c2"
        strokeWidth="0.45"
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
