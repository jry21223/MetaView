import React from "react";
import { Easing, interpolate } from "remotion";
import type { AlgorithmBarsSnapshot } from "../types";
import type { RendererProps } from "./types";
import { selectMotion, swapMotion, writeMotion } from "./animationTemplates";
import { buildPrevIndexMap } from "./prevIndexMap";

const PALETTE = {
  dark: {
    bg: "#0a0c10",
    floor: "rgba(255,255,255,0.06)",
    floorLine: "rgba(255,255,255,0.10)",
    text: "#e8ecf4",
    label: "rgba(232,236,244,0.85)",
    narration: "rgba(232,236,244,0.6)",
    barShadow: "rgba(0,0,0,0.45)",
    active: "#ffd84d",
    activeGlow: "rgba(255,216,77,0.55)",
    swap: "#ff9e8a",
    swapGlow: "rgba(255,158,138,0.5)",
    sorted: "#5be8b4",
    pointer: "#c8a8f8",
    // heatmap: low value → cool, high value → warm
    heat: (t: number) => `hsl(${Math.round(210 - 210 * t)}, 68%, 56%)`,
    heatTop: (t: number) => `hsl(${Math.round(210 - 210 * t)}, 72%, 68%)`,
    heatSide: (t: number) => `hsl(${Math.round(210 - 210 * t)}, 62%, 40%)`,
  },
  light: {
    bg: "#f5f7fa",
    floor: "rgba(0,0,0,0.05)",
    floorLine: "rgba(0,0,0,0.12)",
    text: "#141820",
    label: "rgba(20,24,32,0.85)",
    narration: "rgba(20,24,32,0.6)",
    barShadow: "rgba(0,0,0,0.18)",
    active: "#d4a017",
    activeGlow: "rgba(212,160,23,0.45)",
    swap: "#c05030",
    swapGlow: "rgba(192,80,48,0.4)",
    sorted: "#1a7a5e",
    pointer: "#6030c0",
    heat: (t: number) => `hsl(${Math.round(210 - 210 * t)}, 64%, 50%)`,
    heatTop: (t: number) => `hsl(${Math.round(210 - 210 * t)}, 68%, 62%)`,
    heatSide: (t: number) => `hsl(${Math.round(210 - 210 * t)}, 58%, 36%)`,
  },
} as const;

const ENTER_BEZIER = Easing.bezier(0.16, 1, 0.3, 1);
const MOVE_FRAMES = 22;
const MAX_BAR_HEIGHT = 360;
const MIN_BAR_HEIGHT = 6;
const SWAP_LIFT_REFERENCE = 90;
const DEPTH = 14; // px of fake 3-D depth (top + side faces)

export const BarBlockRenderer: React.FC<RendererProps> = ({
  step,
  prevStep,
  frame,
  stepStartFrame,
  theme,
}) => {
  const snap = step.snapshot as AlgorithmBarsSnapshot;
  const prevSnap =
    prevStep && prevStep.snapshot.kind === "algorithm_bars"
      ? (prevStep.snapshot as AlgorithmBarsSnapshot)
      : null;
  const colors = PALETTE[theme];
  const elapsed = Math.max(0, frame - stepStartFrame);

  const n = snap.numeric_values.length;

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

  if (!n) {
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

  const heightRef = Math.max(...snap.numeric_values.map((v) => Math.abs(v)), 1);
  const barW = Math.max(10, Math.min(72, Math.floor(960 / n) - 8));
  const barGap = Math.max(4, Math.min(14, Math.floor(barW * 0.18)));
  const pitch = barW + barGap;

  const prevIndexMap = buildPrevIndexMap(snap.array_values, prevSnap?.array_values ?? null);
  const swapSet = new Set(snap.swap_indices);
  const activeSet = new Set(snap.active_indices);
  const sortedSet = new Set(snap.sorted_indices);

  const labelFont = Math.max(10, Math.min(16, barW * 0.32));

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
        gap: 28,
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

      {/* Bar field — bars rise from a shared baseline */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: barGap,
          position: "relative",
          height: MAX_BAR_HEIGHT + DEPTH + 8,
          paddingTop: DEPTH + 24,
          // half-transparent floor grid as a coordinate reference
          borderBottom: `2px solid ${colors.floorLine}`,
        }}
      >
        {snap.numeric_values.map((val, i) => {
          const label = snap.array_values[i] ?? String(val);
          const t = Math.abs(val) / heightRef; // 0..1 heatmap position
          const barH = Math.max(MIN_BAR_HEIGHT, (Math.abs(val) / heightRef) * MAX_BAR_HEIGHT);

          const prevIdx = prevIndexMap[i];
          const isActive = activeSet.has(i);
          const isSwap = swapSet.has(i);
          const isSorted = sortedSet.has(i);

          // ── Motion accumulators ──
          let tx = 0;
          let ty = 0;
          let scale = 1;
          let shadowOpacity = 0;
          let shadowColor: string = colors.swapGlow;
          let zIndex = 0;
          let writeOpacity = 1;

          const partner =
            isSwap && prevIdx >= 0 && prevIdx !== i
              ? prevIndexMap.findIndex((p, k) => k !== i && p === i)
              : -1;
          const isPairedSwap = isSwap && partner >= 0 && swapSet.has(partner) && prevIdx !== i;

          if (isPairedSwap && prevIdx >= 0) {
            const dx = (prevIdx - i) * pitch;
            const arcDirection: 1 | -1 = i % 2 === 0 ? 1 : -1;
            const m = swapMotion(elapsed, dx, SWAP_LIFT_REFERENCE, arcDirection);
            tx = m.translateX;
            ty = m.translateY;
            scale = m.scale;
            shadowOpacity = m.shadowOpacity;
            shadowColor = colors.swapGlow;
            zIndex = m.zIndex;
          } else if (prevIdx >= 0 && prevIdx !== i) {
            const progress = interpolate(elapsed, [0, MOVE_FRAMES], [0, 1], {
              easing: ENTER_BEZIER,
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            tx = interpolate(progress, [0, 1], [(prevIdx - i) * pitch, 0]);
          } else if (prevIdx === -1 && !isSwap) {
            const m = writeMotion(elapsed);
            scale = m.scale;
            writeOpacity = m.opacity;
          }

          // ── Fill colors ──
          let face = colors.heat(t);
          let faceTop = colors.heatTop(t);
          let faceSide = colors.heatSide(t);
          let outline = "rgba(0,0,0,0.18)";
          let labelColor: string = colors.label;

          if (isActive) {
            const s = selectMotion(elapsed);
            ty += s.translateY;
            scale = Math.max(scale, s.scale);
            face = colors.active;
            faceTop = colors.active;
            faceSide = colors.active;
            outline = colors.active;
            labelColor = colors.text;
            shadowOpacity = Math.max(shadowOpacity, s.shadowOpacity);
            shadowColor = colors.activeGlow;
          } else if (isSwap) {
            face = colors.swap;
            faceTop = colors.swap;
            faceSide = colors.swap;
            outline = colors.swap;
            labelColor = colors.text;
            if (shadowOpacity === 0) shadowOpacity = 0.4;
            shadowColor = colors.swapGlow;
          } else if (isSorted) {
            face = colors.sorted;
            faceTop = colors.sorted;
            faceSide = colors.sorted;
            outline = "rgba(0,0,0,0.18)";
          }

          // ── Staggered entry ──
          const entryStart = Math.max(0, i * 1.4);
          const entryEnd = entryStart + 12;
          const entryGrow = interpolate(elapsed, [entryStart, entryEnd], [0, 1], {
            easing: ENTER_BEZIER,
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const entryOpacity = interpolate(elapsed, [entryStart, entryStart + 8], [0, 1], {
            easing: ENTER_BEZIER,
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const renderedH =
            prevIdx === -1 || prevIdx === i ? Math.max(MIN_BAR_HEIGHT, barH * entryGrow) : barH;
          const finalOpacity = entryOpacity * writeOpacity;

          const glow =
            shadowOpacity > 0
              ? `, 0 0 ${12 + shadowOpacity * 16}px ${shadowColor.replace(
                  /[\d.]+\)$/,
                  `${shadowOpacity})`,
                )}`
              : "";

          return (
            <div
              key={i}
              style={{
                position: "relative",
                width: barW,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "flex-end",
                transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
                transformOrigin: "bottom center",
                opacity: finalOpacity,
                zIndex,
              }}
            >
              {/* value label above the bar */}
              <span
                style={{
                  position: "absolute",
                  top: -22,
                  fontSize: labelFont,
                  fontWeight: 700,
                  color: labelColor,
                  lineHeight: 1,
                  whiteSpace: "nowrap",
                }}
              >
                {label}
                {isSorted && (
                  <span style={{ color: colors.sorted, marginLeft: 3, fontSize: labelFont * 0.9 }}>
                    ✓
                  </span>
                )}
              </span>

              {/* top face (fake 3-D) */}
              <div
                style={{
                  position: "absolute",
                  bottom: renderedH,
                  width: barW,
                  height: DEPTH,
                  background: faceTop,
                  transform: `skewX(-45deg) translateX(${DEPTH / 2}px)`,
                  transformOrigin: "bottom left",
                  borderTopLeftRadius: 3,
                  borderTopRightRadius: 3,
                  filter: "brightness(1.18)",
                }}
              />
              {/* right side face (fake 3-D) */}
              <div
                style={{
                  position: "absolute",
                  bottom: 0,
                  left: barW,
                  width: DEPTH,
                  height: renderedH,
                  background: faceSide,
                  transform: "skewY(-45deg)",
                  transformOrigin: "bottom left",
                  filter: "brightness(0.78)",
                }}
              />
              {/* front face */}
              <div
                style={{
                  width: barW,
                  height: renderedH,
                  background: `linear-gradient(160deg, ${face} 0%, ${faceSide} 130%)`,
                  border: `1.5px solid ${outline}`,
                  borderTopLeftRadius: 4,
                  borderTopRightRadius: 4,
                  boxShadow: `0 4px 10px ${colors.barShadow}${glow}`,
                }}
              />
              {/* index label below the baseline */}
              <span
                style={{
                  position: "absolute",
                  bottom: -22,
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
                  left: idx * pitch,
                }}
              >
                ▲<span>{name}</span>
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
