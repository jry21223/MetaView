import React from "react";
import { spring } from "remotion";
import type { AlgorithmArraySnapshot } from "../types";
import type { RendererProps } from "./types";

const PALETTE = {
  dark: {
    bg: "#0a0c10",
    cell: "#1a1e27",
    border: "rgba(255,255,255,0.08)",
    text: "#e8ecf4",
    active: "#4de8b0",
    swap: "#ff9e8a",
    sorted: "#5be8b4",
    pointer: "#c8a8f8",
    narration: "rgba(232,236,244,0.6)",
  },
  light: {
    bg: "#f5f7fa",
    cell: "#ffffff",
    border: "rgba(0,0,0,0.08)",
    text: "#141820",
    active: "#00896e",
    swap: "#c05030",
    sorted: "#1a7a5e",
    pointer: "#6030c0",
    narration: "rgba(20,24,32,0.6)",
  },
} as const;

export const AlgorithmRenderer: React.FC<RendererProps> = ({
  step,
  frame,
  stepStartFrame,
  theme,
}) => {
  const snap = step.snapshot as AlgorithmArraySnapshot;
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
          opacity: spring({ frame: elapsed, fps: 30, config: { stiffness: 80, damping: 20 } }),
        }}
      >
        {step.title}
      </h2>

      {/* Array cells */}
      <div style={{ display: "flex", gap: 4, position: "relative" }}>
        {snap.array_values.map((val, i) => {
          const isActive = snap.active_indices.includes(i);
          const isSwap = snap.swap_indices.includes(i);
          const isSorted = snap.sorted_indices.includes(i);
          const cellOpacity = spring({
            frame: Math.max(0, elapsed - i * 2),
            fps: 30,
            config: { stiffness: 120, damping: 18 },
          });

          let bg: string = colors.cell;
          let border: string = colors.border;
          let textColor: string = colors.text;
          if (isSwap) { bg = `${colors.swap}22`; border = colors.swap; textColor = colors.swap; }
          else if (isActive) { bg = `${colors.active}22`; border = colors.active; textColor = colors.active; }
          else if (isSorted) { bg = `${colors.sorted}18`; border = colors.sorted; }

          return (
            <div
              key={i}
              style={{
                width: cellW,
                height: cellH,
                background: bg,
                border: `1.5px solid ${border}`,
                borderRadius: 8,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: textColor,
                fontWeight: 700,
                fontSize: Math.max(12, Math.min(20, cellW * 0.3)),
                opacity: cellOpacity,
                transition: "background 0.2s, border-color 0.2s",
                position: "relative",
              }}
            >
              {val}
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
          {Object.entries(snap.pointers).map(([name, idx]) => (
            <div
              key={name}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                color: colors.pointer,
                fontSize: 13,
                fontWeight: 600,
                opacity: spring({ frame: elapsed, fps: 30, config: { stiffness: 100, damping: 20 } }),
                position: "relative",
                left: idx * (cellW + 4),
              }}
            >
              ▲
              <span>{name}</span>
            </div>
          ))}
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
          opacity: spring({
            frame: Math.max(0, elapsed - 6),
            fps: 30,
            config: { stiffness: 60, damping: 20 },
          }),
        }}
      >
        {step.voiceover_text}
      </p>
    </div>
  );
};
