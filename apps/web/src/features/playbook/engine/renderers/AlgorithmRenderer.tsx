import React from "react";
import { Easing, interpolate } from "remotion";
import type { AlgorithmArraySnapshot } from "../types";
import type { RendererProps } from "./types";

const PALETTE = {
  dark: {
    bg: "#0a0c10",
    cell: "#1a1e27",
    cellGradient: "linear-gradient(145deg, #1e2330, #11151c)",
    cellShadow: "0 2px 6px rgba(0,0,0,0.45)",
    border: "rgba(255,255,255,0.08)",
    text: "#e8ecf4",
    active: "#4de8b0",
    swap: "#ff9e8a",
    sorted: "#5be8b4",
    sortedShadow: "rgba(91,232,180,0.35)",
    pointer: "#c8a8f8",
    narration: "rgba(232,236,244,0.6)",
    select: "#ffd84d",
    selectShadow: "rgba(255,216,77,0.55)",
  },
  light: {
    bg: "#f5f7fa",
    cell: "#ffffff",
    cellGradient: "linear-gradient(145deg, #ffffff, #eef1f5)",
    cellShadow: "0 2px 6px rgba(0,0,0,0.10)",
    border: "rgba(0,0,0,0.08)",
    text: "#141820",
    active: "#00896e",
    swap: "#c05030",
    sorted: "#1a7a5e",
    sortedShadow: "rgba(26,122,94,0.30)",
    pointer: "#6030c0",
    narration: "rgba(20,24,32,0.6)",
    select: "#d4a017",
    selectShadow: "rgba(212,160,23,0.45)",
  },
} as const;

const ENTER_BEZIER = Easing.bezier(0.16, 1, 0.3, 1);
const POP_BEZIER = Easing.bezier(0.34, 1.56, 0.64, 1);
const MOVE_FRAMES = 12;
const POP_FRAMES = 10;
const BREATH_PERIOD = 40; // frames per cycle, ~1.3s @30fps

/**
 * Greedy index map: for each currentIndex find a unique prevIndex with the same
 * value (so that real cell migration can be animated). Newly written values
 * (no remaining match) yield -1, signalling a "pop-in".
 */
function buildPrevIndexMap(
  current: readonly string[],
  prev: readonly string[] | null,
): number[] {
  if (!prev) return current.map(() => -1);
  const used = new Array(prev.length).fill(false) as boolean[];
  const result: number[] = [];
  // First pass: prefer matching same index when value unchanged (stable).
  for (let i = 0; i < current.length; i++) {
    if (i < prev.length && !used[i] && prev[i] === current[i]) {
      result.push(i);
      used[i] = true;
    } else {
      result.push(-2); // sentinel: needs second-pass match
    }
  }
  // Second pass: greedy nearest unused match by value.
  for (let i = 0; i < current.length; i++) {
    if (result[i] !== -2) continue;
    let best = -1;
    let bestDist = Infinity;
    for (let j = 0; j < prev.length; j++) {
      if (used[j]) continue;
      if (prev[j] !== current[i]) continue;
      const d = Math.abs(j - i);
      if (d < bestDist) {
        bestDist = d;
        best = j;
      }
    }
    if (best >= 0) {
      result[i] = best;
      used[best] = true;
    } else {
      result[i] = -1; // truly new
    }
  }
  return result;
}

export const AlgorithmRenderer: React.FC<RendererProps> = ({
  step,
  prevStep,
  frame,
  stepStartFrame,
  theme,
}) => {
  const snap = step.snapshot as AlgorithmArraySnapshot;
  const prevSnap =
    prevStep && prevStep.snapshot.kind === "algorithm_array"
      ? (prevStep.snapshot as AlgorithmArraySnapshot)
      : null;
  const colors = PALETTE[theme];
  const elapsed = Math.max(0, frame - stepStartFrame);

  if (!snap.array_values.length) {
    return (
      <div style={{ background: colors.bg, width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: colors.narration, fontFamily: "system-ui", fontSize: 16 }}>
          {step.voiceover_text}
        </p>
      </div>
    );
  }

  const cellW = Math.min(80, Math.floor(880 / snap.array_values.length));
  const cellH = 64;
  const cellGap = 4;
  const cellPitch = cellW + cellGap;

  const prevIndexMap = buildPrevIndexMap(
    snap.array_values,
    prevSnap?.array_values ?? null,
  );

  const titleOpacity = interpolate(elapsed, [0, 8], [0, 1], {
    easing: ENTER_BEZIER,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const narrationOpacity = interpolate(elapsed, [6, 14], [0, 1], {
    easing: ENTER_BEZIER,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Used to draw arc Y-offset only for swap pairs (two cells in swap_indices that exchange).
  const swapSet = new Set(snap.swap_indices);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: colors.bg,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui, -apple-system, sans-serif",
        gap: 32,
        padding: "0 40px",
      }}
    >
      <h2
        style={{
          color: colors.text,
          fontSize: 20,
          fontWeight: 700,
          margin: 0,
          opacity: titleOpacity,
        }}
      >
        {step.title}
      </h2>

      {/* Array cells */}
      <div style={{ display: "flex", gap: cellGap, position: "relative" }}>
        {snap.array_values.map((val, i) => {
          const isActive = snap.active_indices.includes(i);
          const isSwap = snap.swap_indices.includes(i);
          const isSorted = snap.sorted_indices.includes(i);
          const prevIdx = prevIndexMap[i];

          // ── Movement: translateX from old position to new ──
          const progressMove = interpolate(elapsed, [0, MOVE_FRAMES], [0, 1], {
            easing: POP_BEZIER,
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          let translateX = 0;
          let translateY = 0;
          if (prevIdx >= 0 && prevIdx !== i) {
            const dx = (prevIdx - i) * cellPitch;
            translateX = interpolate(progressMove, [0, 1], [dx, 0]);
            // Arc only when both endpoints participate in a swap (visual "穿插")
            const partner = prevIndexMap.findIndex((p, k) => k !== i && p === i);
            const isPairedSwap = isSwap && partner >= 0 && swapSet.has(partner);
            if (isPairedSwap) {
              // Even index goes high arc, odd goes low arc for cross-over effect
              const arcHeight = Math.min(40, Math.abs(dx) * 0.4 + 20);
              const dir = i % 2 === 0 ? -1 : 1;
              // Quadratic arc: peak at midpoint
              const arcProgress = 1 - Math.pow(progressMove * 2 - 1, 2);
              translateY = dir * arcHeight * arcProgress;
            }
          }

          // ── Wave entry: each cell bounces up from bottom ──
          const waveDelay = i * 1.5;
          const waveElapsed = elapsed - waveDelay;
          let scale = 1;
          let entryY = 0;
          if (prevIdx === -1) {
            // Newly written values: pop-in scale
            scale = interpolate(waveElapsed, [0, POP_FRAMES], [0.8, 1], {
              easing: POP_BEZIER,
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
          } else if (prevIdx === i) {
            // Unchanged cells: wave bounce from bottom
            entryY = interpolate(waveElapsed, [0, 10], [20, 0], {
              easing: Easing.out(Easing.quad),
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            scale = interpolate(waveElapsed, [0, 10], [0.9, 1], {
              easing: POP_BEZIER,
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
          }

          // ── Static enter opacity (wave-staggered) ──
          const cellOpacity = interpolate(
            elapsed,
            [Math.max(0, waveDelay), Math.max(0, waveDelay) + 8],
            [0, 1],
            { easing: ENTER_BEZIER, extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          );

          // ── Visual layer (priority: active > swap > sorted) ──
          let bg: string = colors.cellGradient;
          let border: string = colors.border;
          let borderWidth = 1.5;
          let textColor: string = colors.text;
          let liftY = 0;
          let glow: string = colors.cellShadow;
          let breath = 1;

          if (isActive) {
            // Yellow breathing select
            border = colors.select;
            borderWidth = 2.5;
            textColor = colors.select;
            bg = `${colors.select}18`;
            liftY = -4;
            const phase = (elapsed * (Math.PI * 2)) / BREATH_PERIOD;
            breath = 0.65 + 0.35 * (0.5 + 0.5 * Math.sin(phase));
            glow = `0 0 14px ${colors.selectShadow}, ${colors.cellShadow}`;
          } else if (isSwap) {
            bg = `${colors.swap}22`;
            border = colors.swap;
            textColor = colors.swap;
            glow = `0 4px 12px rgba(0,0,0,0.3)`;
          } else if (isSorted) {
            bg = `${colors.sorted}18`;
            border = colors.sorted;
            glow = `0 0 8px ${colors.sortedShadow}, ${colors.cellShadow}`;
          }

          return (
            <div
              key={i}
              style={{
                width: cellW,
                height: cellH,
                background: bg,
                border: `${borderWidth}px solid ${border}`,
                borderRadius: 8,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: textColor,
                fontWeight: 700,
                fontSize: Math.max(12, Math.min(20, cellW * 0.3)),
                opacity: cellOpacity * breath,
                transform: `translate(${translateX}px, ${translateY + liftY + entryY}px) scale(${scale})`,
                boxShadow: glow,
                position: "relative",
              }}
            >
              {val}
              {/* Sorted checkmark */}
              {isSorted && !isActive && !isSwap && (
                <span
                  style={{
                    position: "absolute",
                    top: 2,
                    right: 4,
                    fontSize: 9,
                    color: colors.sorted,
                    fontWeight: 700,
                    lineHeight: 1,
                  }}
                >
                  ✓
                </span>
              )}
              {/* Index label */}
              <span
                style={{
                  position: "absolute",
                  bottom: -20,
                  fontSize: 11,
                  color: colors.narration,
                  fontWeight: 400,
                }}
              >
                {i}
              </span>
            </div>
          );
        })}
      </div>

      {/* Pointer arrows */}
      {Object.entries(snap.pointers).length > 0 && (
        <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
          {Object.entries(snap.pointers).map(([name, idx]) => {
            const pointerOpacity = interpolate(elapsed, [0, 12], [0, 1], {
              easing: ENTER_BEZIER,
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            return (
              <div
                key={name}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  color: colors.pointer,
                  fontSize: 13,
                  fontWeight: 600,
                  opacity: pointerOpacity,
                  position: "relative",
                  left: idx * cellPitch,
                }}
              >
                ▲
                <span>{name}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Narration text */}
      <p
        style={{
          color: colors.narration,
          fontSize: 15,
          maxWidth: 720,
          textAlign: "center",
          lineHeight: 1.6,
          margin: 0,
          opacity: narrationOpacity,
        }}
      >
        {step.voiceover_text}
      </p>
    </div>
  );
};
