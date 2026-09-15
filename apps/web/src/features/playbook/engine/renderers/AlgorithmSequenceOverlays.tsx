import React from "react";
import { Easing, interpolate } from "remotion";
import { THEME_PALETTE } from "../../../../shared/config/themePalette";
import type {
  AlgorithmAuxiliaryLane,
  AlgorithmRange,
} from "../types";
import { stackColumnCapacity } from "./stackColumnLayout";

const RANGE_MOVE_FRAMES = 12;
const POINTER_ENTER_FRAMES = 12;
/** Gap between the main sequence column and the stack columns beside it. */
const SEQUENCE_STACK_GAP = 40;
/**
 * Pointers a reader scans left to right. Anything else keeps the order the
 * snapshot declared it in.
 */
const POINTER_LABEL_ORDER = ["low", "mid", "high"];

function pointerLabelRank(name: string): number {
  const rank = POINTER_LABEL_ORDER.indexOf(name);
  return rank === -1 ? POINTER_LABEL_ORDER.length : rank;
}

/** Pointers sharing one index are drawn as a single `i · j` marker. */
function groupPointersByIndex(pointers: Record<string, number>): Array<[number, string[]]> {
  return Array.from(
    Object.entries(pointers).reduce((groups, [name, index]) => {
      const names = groups.get(index) ?? [];
      names.push(name);
      groups.set(index, names);
      return groups;
    }, new Map<number, string[]>()),
  );
}

/**
 * The ▲ markers under a sequence. The row keeps its height even when a step
 * declares no pointers, so the sequence and the lanes below it do not jump.
 *
 * `indexAttribute` and `noWrapLabels` exist because the two sequence
 * renderers were written apart and differ in exactly these two details; they
 * are kept as they are so extracting this component changed no markup.
 */
export function AlgorithmPointerRow({
  pointers,
  itemCount,
  itemWidth,
  gap,
  color,
  elapsed,
  settled,
  indexAttribute = false,
  noWrapLabels = false,
}: {
  pointers: Record<string, number>;
  itemCount: number;
  itemWidth: number;
  gap: number;
  color: string;
  elapsed: number;
  /** True once a previous snapshot exists: the markers are already on screen. */
  settled: boolean;
  indexAttribute?: boolean;
  noWrapLabels?: boolean;
}) {
  const groups = groupPointersByIndex(pointers);
  const pitch = itemWidth + gap;
  const opacity = settled
    ? 1
    : interpolate(elapsed, [0, POINTER_ENTER_FRAMES], [0, 1], {
        easing: Easing.bezier(0.16, 1, 0.3, 1),
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });

  return (
    <div
      data-pointer-row={groups.length}
      style={{
        position: "relative",
        width: itemCount * itemWidth + (itemCount - 1) * gap,
        height: 34,
        marginTop: 8,
      }}
    >
      {groups.length > 0 && (
      <div style={{ position: "absolute", inset: 0 }}>
        {groups.map(([idx, names]) => (
          <div
            key={idx}
            data-pointer-index={indexAttribute ? idx : undefined}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              color,
              fontSize: 13,
              fontWeight: 600,
              opacity,
              position: "absolute",
              left: idx * pitch + itemWidth / 2,
              top: 0,
              transform: "translateX(-50%)",
            }}
          >
            ▲
            <span style={noWrapLabels ? { whiteSpace: "nowrap" } : undefined}>
              {[...names]
                .sort((left, right) => pointerLabelRank(left) - pointerLabelRank(right))
                .join(" · ")}
            </span>
          </div>
        ))}
      </div>
      )}
    </div>
  );
}

/**
 * Main sequence on the left, stack columns on the right.
 *
 * Both sequence renderers lay themselves out this way and both used to repeat
 * the previous-lane lookup and the capacity call for every stack column.
 */
export function AlgorithmSequenceLayout({
  columnGap,
  stackLanes,
  previousLanes,
  sequenceLength,
  elapsed,
  theme,
  children,
}: {
  /** Vertical gap inside the sequence column — bars sit tighter than cells. */
  columnGap: number;
  stackLanes: readonly AlgorithmAuxiliaryLane[];
  previousLanes?: readonly AlgorithmAuxiliaryLane[];
  sequenceLength: number;
  elapsed: number;
  theme: "dark" | "light";
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: SEQUENCE_STACK_GAP }}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: columnGap,
        }}
      >
        {children}
      </div>
      {stackLanes.map((lane) => (
        <AlgorithmStackColumn
          key={lane.id}
          lane={lane}
          previousLane={previousLanes?.find((candidate) => candidate.id === lane.id) ?? null}
          capacity={stackColumnCapacity(lane, sequenceLength)}
          elapsed={elapsed}
          theme={theme}
        />
      ))}
    </div>
  );
}

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

const STACK_SLOT_WIDTH = 84;
const STACK_SLOT_HEIGHT = 38;
const STACK_SLOT_GAP = 6;
const STACK_INDEX_GUTTER = 18;
const STACK_MARKER_WIDTH = 64;
const STACK_DROP_FRAMES = 10;
/** Slot columns taller than this squeeze their slots so the column stays on stage. */
const STACK_COLUMN_MAX_HEIGHT = 300;

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
  const slotHeight = Math.max(
    22,
    Math.min(STACK_SLOT_HEIGHT, Math.floor((STACK_COLUMN_MAX_HEIGHT - (slots - 1) * STACK_SLOT_GAP) / slots)),
  );
  const compact = slotHeight < 30;
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
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.06em",
          whiteSpace: "nowrap",
        }}
      >
        {lane.label}
      </span>
      <div
        data-stack-slot-height={slotHeight}
        style={{
          display: "grid",
          gridTemplateColumns: `${STACK_INDEX_GUTTER}px ${STACK_SLOT_WIDTH}px ${STACK_MARKER_WIDTH}px`,
          columnGap: 8,
          rowGap: STACK_SLOT_GAP,
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
              <span style={{ color: colors.muted, fontSize: 11, textAlign: "right" }}>{slot}</span>
              <div
                data-stack-slot={slot}
                data-stack-slot-state={item ? "filled" : "empty"}
                data-stack-item={item?.id}
                style={{
                  boxSizing: "border-box",
                  height: slotHeight,
                  border: item
                    ? `1.5px solid color-mix(in srgb, ${color} 70%, ${colors.line})`
                    : `1.5px dashed color-mix(in srgb, ${colors.muted} 55%, ${colors.line})`,
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
                  <div style={{ color, fontSize: compact ? 11 : 13, fontWeight: 700 }}>{item.label}</div>
                )}
                {item?.value && !compact && (
                  <div style={{ color: colors.muted, fontSize: 10.5 }}>{item.value}</div>
                )}
              </div>
              <span
                data-stack-marker={isTop ? "top" : undefined}
                style={{
                  color: colors.focus,
                  fontSize: 11.5,
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
      <span style={{ color: colors.muted, fontSize: 10.5, whiteSpace: "nowrap" }}>
        {lane.items.length > 0 ? `top = ${topIndex} · size = ${lane.items.length}` : "空栈 · top = -1"}
      </span>
    </div>
  );
}
