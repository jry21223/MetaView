import React from "react";

import { CHEM_SCRIPT_SCALE, parseChemMarkup } from "../../kits/chemistry/chemMarkup";

export const CHEM_FONT_FAMILY = '"Inter", -apple-system, system-ui, "PingFang SC", "Noto Sans SC", sans-serif';

const SHIFT_EM: Record<"sub" | "sup", number> = { sub: 0.3, sup: -0.42 };

interface ChemTextProps {
  text: string;
  x: number;
  y: number;
  fontSize: number;
  fill: string;
  anchor?: "start" | "middle" | "end";
  weight?: number;
  opacity?: number;
  id?: string;
}

/**
 * A formula-aware SVG text run: subscripts and superscripts are real tspans
 * shifted with `dy`, so `SO_4^{2-}` sets identically in the browser and in
 * the headless export regardless of which fonts carry Unicode scripts.
 */
export function ChemText({ text, x, y, fontSize, fill, anchor = "start", weight, opacity, id }: ChemTextProps) {
  const segments = parseChemMarkup(text);
  // Each run's baseline offset, and the dy that moves the pen there from the previous run.
  const offsets = segments.map((segment) => (segment.shift ? SHIFT_EM[segment.shift] * fontSize : 0));
  return (
    <text
      x={x}
      y={y}
      textAnchor={anchor}
      fontSize={fontSize}
      fontWeight={weight}
      fill={fill}
      opacity={opacity}
      fontFamily={CHEM_FONT_FAMILY}
      style={{ fontVariantNumeric: "tabular-nums" }}
      data-chem-text={id}
    >
      {segments.map((segment, index) => {
        const dy = offsets[index] - (index > 0 ? offsets[index - 1] : 0);
        return (
          <tspan
            key={index}
            dy={dy !== 0 ? dy : undefined}
            fontSize={segment.shift ? fontSize * CHEM_SCRIPT_SCALE : undefined}
          >
            {segment.text}
          </tspan>
        );
      })}
    </text>
  );
}
