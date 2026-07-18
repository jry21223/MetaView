import React from "react";

interface CoreLabGridProps {
  rendererKind: string;
  theme: "light" | "dark";
  lightFill?: string;
  darkFill?: string;
}

export function CoreLabGrid({
  rendererKind,
  theme,
  lightFill = "#f7f9fc",
  darkFill = "#111827",
}: CoreLabGridProps) {
  const isDark = theme === "dark";
  const patternId = `core-grid-${rendererKind.replace(/[^a-z0-9_-]/gi, "-")}`;
  const gridStroke = isDark ? "#d9e2dd" : "#82976f";

  return (
    <g data-semantic-role="lab_grid">
      <defs>
        <pattern id={patternId} width="5" height="5" patternUnits="userSpaceOnUse">
          <path d="M 5 0 L 0 0 0 5" fill="none" stroke={gridStroke} strokeWidth="0.22" opacity="0.13" />
        </pattern>
      </defs>
      <rect x="0" y="0" width="100" height="100" rx="3" fill={isDark ? darkFill : lightFill} />
      <rect x="0" y="0" width="100" height="100" rx="3" fill={`url(#${patternId})`} />
    </g>
  );
}
