import React from "react";
import { Easing, interpolate } from "remotion";
import type { AlgorithmArraySnapshot } from "../types";
import type { RendererProps } from "./types";
import {
  selectMotion,
  swapMotion,
  writeMotion,
} from "./animationTemplates";

const PALETTE = {
  dark: {
    bg: "#0a0c10",
    cell: "#1a1e27",
    cellGradient: "linear-gradient(160deg, #1e2330 0%, #12151e 100%)",
    cellShadowBase: "0 2px 8px rgba(0,0,0,0.45)",
    border: "rgba(255,255,255,0.08)",
    text: "#e8ecf4",
    active: "#4de8b0",
    swap: "#ff9e8a",
    sorted: "#5be8b4",
    pointer: "#c8a8f8",
    narration: "rgba(232,236,244,0.6)",
    select: "#ffd84d",
    selectShadow: "rgba(255,216,77,0.55)",
    swapShadow: "rgba(255,158,138,0.5)",
    checkmark: "#5be8b4",
  },
  light: {
    bg: "#f5f7fa",
    cell: "#ffffff",
    cellGradient: "linear-gradient(160deg, #ffffff 0%, #f0f2f7 100%)",
    cellShadowBase: "0 2px 6px rgba(0,0,0,0.10)",
    border: "rgba(0,0,0,0.08)",
    text: "#141820",
    active: "#00896e",
    swap: "#c05030",
    sorted: "#1a7a5e",
    pointer: "#6030c0",
    narration: "rgba(20,24,32,0.6)",
    select: "#d4a017",
    selectShadow: "rgba(212,160,23,0.45)",
    swapShadow: "rgba(192,80,48,0.4)",
    checkmark: "#1a7a5e",
  },
} as const;

const ENTER_BEZIER = Easing.bezier(0.16, 1, 0.3, 1);
const MOVE_FRAMES = 22; // single-phase slide for non-paired displacement (e.g. merge shift-down)

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
  for (let i = 0; i < current.length; i++) {
    if (i < prev.length && !used[i] && prev[i] === current[i]) {
      result.push(i);
      used[i] = true;
    } else {
      result.push(-2);
    }
  }
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
      result[i] = -1;
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
      <div
        style={{
          background: colors.bg,
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
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

  const swapSet = new Set(snap.swap_indices);
  const activeSet = new Set(snap.active_indices);
  const sortedSet = new Set(snap.sorted_indices);

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

      <div style={{ display: "flex", gap: cellGap, position: "relative" }}>
        {snap.array_values.map((val, i) => {
          const prevIdx = prevIndexMap[i];
          const isActive = activeSet.has(i);
          const isSwap = swapSet.has(i);
          const isSorted = sortedSet.has(i);

          // ── Motion accumulators ──
          let tx = 0;
          let ty = 0;
          let scale = 1;
          let shadowOpacity = 0;
          let shadowColor: string = colors.swapShadow;
          let zIndex = 0;
          let writeOpacity = 1;

          // ── Swap (paired) → 3-phase lift / translate / drop ──
          const partner =
            isSwap && prevIdx >= 0 && prevIdx !== i
              ? prevIndexMap.findIndex((p, k) => k !== i && p === i)
              : -1;
          const isPairedSwap =
            isSwap && partner >= 0 && swapSet.has(partner) && prevIdx !== i;

          if (isPairedSwap && prevIdx >= 0) {
            const dx = (prevIdx - i) * cellPitch;
            // Even-index cell arcs upward, odd-index arcs downward → crossing arc effect
            const arcDirection: 1 | -1 = i % 2 === 0 ? 1 : -1;
            const m = swapMotion(elapsed, dx, cellH, arcDirection);
            tx = m.translateX;
            ty = m.translateY;
            scale = m.scale;
            shadowOpacity = m.shadowOpacity;
            shadowColor = colors.swapShadow;
            zIndex = m.zIndex;
          } else if (prevIdx >= 0 && prevIdx !== i) {
            // Non-paired displacement (e.g. merge shift): single-phase slide
            const progress = interpolate(elapsed, [0, MOVE_FRAMES], [0, 1], {
              easing: ENTER_BEZIER,
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            tx = interpolate(progress, [0, 1], [(prevIdx - i) * cellPitch, 0]);
          } else if (prevIdx === -1 && !isSwap) {
            // Brand-new value (merge write etc.)
            const m = writeMotion(elapsed);
            scale = m.scale;
            writeOpacity = m.opacity;
          }

          // ── Select (active) overlay: stacks on top of swap/write ──
          let borderColor: string = colors.border;
          let borderWidth = 1.5;
          let bg: string = colors.cell;
          let textColor: string = colors.text;

          if (isActive) {
            const s = selectMotion(elapsed);
            ty += s.translateY;
            scale = Math.max(scale, s.scale);
            borderColor = colors.select;
            borderWidth = 2.5;
            textColor = colors.select;
            bg = `${colors.select}18`;
            // Override shadow with select glow (bigger priority than swap shadow)
            shadowOpacity = Math.max(shadowOpacity, s.shadowOpacity);
            shadowColor = colors.selectShadow;
          } else if (isSwap) {
            bg = `${colors.swap}22`;
            borderColor = colors.swap;
            textColor = colors.swap;
          } else if (isSorted) {
            bg = `${colors.sorted}18`;
            borderColor = colors.sorted;
          }

          // ── Staggered entry: fade + slide up from 20px + scale 0.9→1 ──
          const entryStart = Math.max(0, i * 1.5);
          const entryEnd = entryStart + 10;
          const cellOpacity = interpolate(elapsed, [entryStart, entryEnd], [0, 1], {
            easing: ENTER_BEZIER, extrapolateLeft: "clamp", extrapolateRight: "clamp",
          });
          const entryY = interpolate(elapsed, [entryStart, entryEnd], [20, 0], {
            easing: ENTER_BEZIER, extrapolateLeft: "clamp", extrapolateRight: "clamp",
          });
          const entryScale = interpolate(elapsed, [entryStart, entryEnd], [0.88, 1], {
            easing: ENTER_BEZIER, extrapolateLeft: "clamp", extrapolateRight: "clamp",
          });
          // Accumulate entry offset only if cell hasn't moved (prevIdx === -1 or same position)
          if (prevIdx === -1 || prevIdx === i) {
            ty += entryY;
            scale = Math.max(scale, entryScale);
          }

          const finalOpacity = cellOpacity * writeOpacity;

          // Use gradient background for visual depth; override with accent tint when active/swap
          const bgStyle = isActive || isSwap
            ? bg  // tinted solid for active/swap states
            : isSorted
            ? `${colors.sorted}18`
            : colors.cellGradient;

          const combinedShadow = [
            colors.cellShadowBase,
            shadowOpacity > 0
              ? `0 ${Math.max(4, Math.abs(ty) * 0.3)}px ${14 + shadowOpacity * 8}px ${shadowColor.replace(
                  /[\d.]+\)/,
                  `${shadowOpacity})`,
                )}`
              : null,
          ].filter(Boolean).join(", ");

          return (
            <div
              key={i}
              style={{
                width: cellW,
                height: cellH,
                background: bgStyle,
                border: `${borderWidth}px solid ${borderColor}`,
                borderRadius: 8,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: textColor,
                fontWeight: 700,
                fontSize: Math.max(12, Math.min(20, cellW * 0.3)),
                opacity: finalOpacity,
                transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
                boxShadow: combinedShadow,
                position: "relative",
                zIndex,
              }}
            >
              {val}
              {isSorted && (
                <span
                  style={{
                    position: "absolute",
                    top: 3,
                    right: 5,
                    fontSize: 9,
                    color: colors.checkmark,
                    fontWeight: 700,
                    lineHeight: 1,
                  }}
                >
                  ✓
                </span>
              )}
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
