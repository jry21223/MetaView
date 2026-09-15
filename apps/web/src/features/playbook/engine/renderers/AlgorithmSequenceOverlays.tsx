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
  const rowLanes = lanes.filter((lane) => lane.role !== "stack");
  if (rowLanes.length === 0) return null;

  return (
    <div
      style={{
        width,
        display: "grid",
        gap: 10,
      }}
    >
      {rowLanes.map((lane) => (
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

const STACK_SLOT_WIDTH = 76;
const STACK_SLOT_HEIGHT = 34;
const STACK_INDEX_GUTTER = 18;
const STACK_MARKER_WIDTH = 64;
const STACK_DROP_FRAMES = 10;

/**
 * A stack drawn the way it is taught: a vertical column of slots with slot 0
 * at the bottom, the top of the stack on top, empty slots still visible, and a
 * `top` marker beside the current top. A freshly pushed item drops into its
 * slot; everything else stays put so the eye only follows the change.
 */
export function AlgorithmStackColumn({
  lane,
  previousLane,
  capacity,
  elapsed,
  theme,
}: {
  lane: AlgorithmAuxiliaryLane;
  previousLane?: AlgorithmAuxiliaryLane | null;
  capacity: number;
  elapsed: number;
  theme: "dark" | "light";
}) {
  const colors = overlayPalette(theme);
  const slots = Math.max(capacity, lane.items.length, 1);
  const previousIds = new Set((previousLane?.items ?? []).map((item) => item.id));
  const topIndex = lane.items.length - 1;
  const drop = interpolate(elapsed, [0, STACK_DROP_FRAMES], [0, 1], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      data-stack-lane={lane.id}
      data-stack-capacity={slots}
      data-stack-top={topIndex}
      style={{
        display: "grid",
        gap: 8,
        justifyItems: "center",
        fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
      }}
    >
      <span
        style={{
          color: colors.muted,
          fontSize: 9.5,
          fontWeight: 700,
          letterSpacing: "0.06em",
          whiteSpace: "nowrap",
        }}
      >
        {lane.label}
      </span>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `${STACK_INDEX_GUTTER}px ${STACK_SLOT_WIDTH}px ${STACK_MARKER_WIDTH}px`,
          columnGap: 8,
          rowGap: 6,
          alignItems: "center",
        }}
      >
        {Array.from({ length: slots }, (_, position) => slots - 1 - position).map((slot) => {
          const item = lane.items[slot];
          const isTop = slot === topIndex;
          const isNew = Boolean(item) && !previousIds.has(item!.id);
          const color = !item
            ? colors.line
            : item.emphasis === "accent"
              ? colors.focus
              : item.emphasis === "primary" || (isTop && !item.emphasis)
                ? colors.primary
                : colors.secondary;
          return (
            <React.Fragment key={slot}>
              <span style={{ color: colors.muted, fontSize: 10, textAlign: "right" }}>{slot}</span>
              <div
                data-stack-slot={slot}
                data-stack-slot-state={item ? "filled" : "empty"}
                data-stack-item={item?.id}
                style={{
                  boxSizing: "border-box",
                  height: STACK_SLOT_HEIGHT,
                  border: item
                    ? `1.5px solid color-mix(in srgb, ${color} 70%, ${colors.line})`
                    : `1px dashed ${colors.line}`,
                  borderRadius: 6,
                  background: item
                    ? `color-mix(in srgb, ${color} ${isTop ? 12 : 7}%, ${colors.surface})`
                    : "transparent",
                  color: colors.ink,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  lineHeight: 1.15,
                  opacity: isNew ? drop : 1,
                  transform: isNew ? `translateY(${(1 - drop) * -8}px)` : undefined,
                }}
              >
                {item && (
                  <div style={{ color, fontSize: 11, fontWeight: 700 }}>{item.label}</div>
                )}
                {item?.value && (
                  <div style={{ color: colors.muted, fontSize: 9 }}>{item.value}</div>
                )}
              </div>
              <span
                data-stack-marker={isTop ? "top" : undefined}
                style={{
                  color: colors.focus,
                  fontSize: 10,
                  fontWeight: 700,
                  whiteSpace: "nowrap",
                  visibility: isTop ? "visible" : "hidden",
                }}
              >
                ← top
              </span>
            </React.Fragment>
          );
        })}
      </div>
      <span style={{ color: colors.muted, fontSize: 9.5, whiteSpace: "nowrap" }}>
        {lane.items.length > 0 ? `top = ${topIndex} · size = ${lane.items.length}` : "空栈 · top = -1"}
      </span>
    </div>
  );
}
