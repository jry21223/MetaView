import React from "react";
import { THEME_PALETTE } from "../../../../shared/config/themePalette";

interface CoreLabGridProps {
  rendererKind: string;
  theme: "light" | "dark";
  lightFill?: string;
  darkFill?: string;
  /** Scene-space width of the canvas (height is always 100). */
  width?: number;
}

export function CoreLabGrid({
  rendererKind,
  theme,
  lightFill,
  darkFill,
  width = 100,
}: CoreLabGridProps) {
  const isDark = theme === "dark";
  const palette = THEME_PALETTE[theme];
  const patternId = `core-grid-${rendererKind.replace(/[^a-z0-9_-]/gi, "-")}`;
  const gridStroke = `var(--canvas-grid, ${palette.canvasGrid})`;
  const canvasFill = isDark
    ? (darkFill ?? `var(--surface-2, ${palette.surface2})`)
    : (lightFill ?? `var(--surface-2, ${palette.surface2})`);

  return (
    <g data-semantic-role="lab_grid">
      <defs>
        <pattern id={patternId} width="5" height="5" patternUnits="userSpaceOnUse">
          <path d="M 5 0 L 0 0 0 5" fill="none" stroke={gridStroke} strokeWidth="0.22" />
        </pattern>
      </defs>
      <rect x="0" y="0" width={width} height="100" rx="3" fill={canvasFill} />
      <rect x="0" y="0" width={width} height="100" rx="3" fill={`url(#${patternId})`} />
    </g>
  );
}
