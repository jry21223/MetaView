import React from "react";
import { Easing, interpolate } from "remotion";
import { THEME_PALETTE } from "../../../../shared/config/themePalette";
import type {
  AlgorithmAuxiliaryLane,
  AlgorithmRange,
} from "../types";

const RANGE_MOVE_FRAMES = 12;

function overlayPalette(theme: "dark" | "light") {
  const palette = THEME_PALETTE[theme];
  return {
    surface: `var(--surface, ${theme === "dark" ? "#111715" : "#ffffff"})`,
    line: `var(--line, ${palette.line})`,
    ink: `var(--ink, ${palette.ink})`,
    muted: `var(--ink-2, ${palette.ink2})`,
    primary: `var(--canvas-primary, ${palette.canvasPrimary})`,
    secondary: `var(--canvas-secondary, ${palette.canvasSecondary})`,
    focus: `var(--canvas-focus, ${palette.canvasFocus})`,
  };
}

function rangeColor(
  range: AlgorithmRange,
  colors: ReturnType<typeof overlayPalette>,
): string {
  if (range.emphasis === "accent") return colors.focus;
  if (range.emphasis === "secondary" || range.emphasis === "muted") {
    return colors.secondary;
  }
  return colors.primary;
}

export function AlgorithmRangeOverlay({
  ranges,
  previousRanges,
  itemWidth,
  gap,
  itemHeight,
  elapsed,
  theme,
}: {
  ranges: readonly AlgorithmRange[];
  previousRanges?: readonly AlgorithmRange[];
  itemWidth: number;
  gap: number;
  itemHeight: number;
  elapsed: number;
  theme: "dark" | "light";
}) {
  const colors = overlayPalette(theme);
  const pitch = itemWidth + gap;
  const progress = interpolate(elapsed, [0, RANGE_MOVE_FRAMES], [0, 1], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <>
      {ranges.map((range) => {
        const previous = previousRanges?.find((candidate) => candidate.id === range.id);
        const start = interpolate(
          progress,
          [0, 1],
          [previous?.start ?? range.start, range.start],
        );
        const end = interpolate(
          progress,
          [0, 1],
          [previous?.end ?? range.end, range.end],
        );
        const color = rangeColor(range, colors);
        const left = start * pitch - 6;
        const width = (end - start + 1) * pitch - gap + 12;

        return (
          <div
            key={range.id}
            data-range-id={range.id}
            data-range-role={range.role}
            data-range-start={range.start}
            data-range-end={range.end}
            style={{
              position: "absolute",
              left,
              top: -10,
              width,
              height: itemHeight + 20,
              boxSizing: "border-box",
              border: `2px solid ${color}`,
              borderRadius: 10,
              background: `color-mix(in srgb, ${color} 7%, transparent)`,
              boxShadow: `0 0 0 1px color-mix(in srgb, ${color} 12%, transparent)`,
              pointerEvents: "none",
              zIndex: 4,
            }}
          >
            {range.label && (
              <span
                style={{
                  position: "absolute",
                  left: 8,
                  top: -22,
                  padding: "2px 6px",
                  borderRadius: 4,
                  background: colors.surface,
                  color,
                  fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
                  fontSize: 10,
                  fontWeight: 700,
                  lineHeight: 1.4,
                  whiteSpace: "nowrap",
                }}
              >
                {range.label}
              </span>
            )}
          </div>
        );
      })}
    </>
  );
}

export function AlgorithmAuxiliaryLanes({
  lanes,
  width,
  theme,
}: {
  lanes: readonly AlgorithmAuxiliaryLane[];
  width: number;
  theme: "dark" | "light";
}) {
  const colors = overlayPalette(theme);
  if (lanes.length === 0) return null;

  return (
    <div
      style={{
        width,
        display: "grid",
        gap: 10,
      }}
    >
      {lanes.map((lane) => (
        <div
          key={lane.id}
          data-auxiliary-role={lane.role}
          style={{
            display: "grid",
            gridTemplateColumns: "144px minmax(0, 1fr)",
            alignItems: "center",
            gap: 12,
            minHeight: 34,
          }}
        >
          <span
            style={{
              color: colors.muted,
              fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
              fontSize: 9.5,
              fontWeight: 700,
              letterSpacing: "0.06em",
              whiteSpace: "nowrap",
            }}
          >
            {lane.label}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
            {lane.items.length === 0 ? (
              <span style={{ color: colors.muted, fontSize: 11 }}>—</span>
            ) : lane.items.map((item) => {
              const color =
                item.emphasis === "accent"
                  ? colors.focus
                  : item.emphasis === "primary"
                    ? colors.primary
                    : colors.secondary;
              return (
                <div
                  key={item.id}
                  data-auxiliary-item={item.id}
                  style={{
                    minWidth: 38,
                    padding: "5px 8px",
                    border: `1px solid color-mix(in srgb, ${color} 50%, ${colors.line})`,
                    borderRadius: 6,
                    background: `color-mix(in srgb, ${color} 7%, ${colors.surface})`,
                    color: colors.ink,
                    fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
                    fontSize: 10,
                    lineHeight: 1.25,
                    textAlign: "center",
                  }}
                >
                  <div style={{ color, fontWeight: 700 }}>{item.label}</div>
                  {item.value && (
                    <div style={{ color: colors.muted, marginTop: 2 }}>{item.value}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
