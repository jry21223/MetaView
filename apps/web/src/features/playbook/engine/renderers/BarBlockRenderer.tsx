import React from "react";
import { Easing, interpolate } from "remotion";
import type { AlgorithmBarsSnapshot } from "../types";
import type { RendererProps } from "./types";
import {
  selectMotion,
  swapMotion,
  writeMotion,
  scaleSwapPhases,
  DEFAULT_SWAP_FRAMES,
} from "./animationTemplates";
import { buildPrevIndexMap } from "./prevIndexMap";
import { THEME_PALETTE } from "../../../../shared/config/themePalette";

/**
 * Theme-reactive palette built on the app's CSS variables (see
 * `useTweaks.themeVars`). Bars consume `var(--ink-2)` / `var(--accent)` so
 * switching theme or accent at the root re-styles the renderer instantly
 * without a renderer re-render — the inline `var(...)` references resolve at
 * paint time against the live root vars.
 *
 * Theme-specific fallbacks keep server-rendered markup (tests, exports) from
 * collapsing to transparent when CSS vars aren't yet applied. Issue #56:
 * values that map onto a CSS var read from the shared THEME_PALETTE so we
 * can't drift away from the browser-resolved colors; renderer-only values
 * (outline / shadow rgba) stay inline.
 */
function buildFallbacks(theme: "dark" | "light") {
  const p = THEME_PALETTE[theme];
  return {
    bg: p.surface2,
    text: p.ink,
    label: p.ink2,
    narration: p.ink3,
    barBase: p.line2,
    barAccent: p.accent,
    floor: p.line,
    warn: p.warn,
    accentShadow: p.accentSoft,
    barOutline: theme === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)",
    swapShadow: theme === "dark" ? "rgba(233,162,59,0.35)" : "rgba(233,162,59,0.30)",
    barShadow: theme === "dark" ? "rgba(0,0,0,0.35)" : "rgba(0,0,0,0.12)",
  } as const;
}

const FALLBACKS = {
  dark: buildFallbacks("dark"),
  light: buildFallbacks("light"),
} as const;

const VAR = {
  bg: (t: "dark" | "light") => `var(--surface-2, ${FALLBACKS[t].bg})`,
  text: (t: "dark" | "light") => `var(--ink, ${FALLBACKS[t].text})`,
  label: (t: "dark" | "light") => `var(--ink-2, ${FALLBACKS[t].label})`,
  narration: (t: "dark" | "light") => `var(--ink-3, ${FALLBACKS[t].narration})`,
  barBase: (t: "dark" | "light") => `var(--line-2, ${FALLBACKS[t].barBase})`,
  accent: (t: "dark" | "light") => `var(--accent, ${FALLBACKS[t].barAccent})`,
  accentSoft: (t: "dark" | "light") => `var(--accent-soft, ${FALLBACKS[t].accentShadow})`,
  warn: (t: "dark" | "light") => `var(--warn, ${FALLBACKS[t].warn})`,
  floor: (t: "dark" | "light") => `var(--line, ${FALLBACKS[t].floor})`,
  barOutline: (t: "dark" | "light") => FALLBACKS[t].barOutline,
  barShadow: (t: "dark" | "light") => FALLBACKS[t].barShadow,
  swapShadow: (t: "dark" | "light") => FALLBACKS[t].swapShadow,
  accentShadow: (t: "dark" | "light") => FALLBACKS[t].accentShadow,
} as const;

const ENTER_BEZIER = Easing.bezier(0.16, 1, 0.3, 1);
const MOVE_FRAMES = 22;
const MAX_BAR_HEIGHT = 360;
const MIN_BAR_HEIGHT = 6;

export const BarBlockRenderer: React.FC<RendererProps> = ({
  step,
  prevStep,
  frame,
  stepStartFrame,
  theme,
  swapDurationFrames = DEFAULT_SWAP_FRAMES,
}) => {
  // Plain compute — this component is intentionally hook-free so tests can
  // invoke it as a regular function (see BarBlockRenderer.test.tsx). The
  // array.map cost on a 3-phase descriptor is negligible per frame.
  const swapPhases = scaleSwapPhases(swapDurationFrames);
  const snap = step.snapshot as AlgorithmBarsSnapshot;
  const prevSnap =
    prevStep && prevStep.snapshot.kind === "algorithm_bars"
      ? (prevStep.snapshot as AlgorithmBarsSnapshot)
      : null;
  const c = VAR;
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
          background: c.bg(theme),
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <p style={{ color: c.narration(theme), fontFamily: "system-ui", fontSize: 16 }}>
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
        background: c.bg(theme),
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
          color: c.text(theme),
          fontSize: 20,
          fontWeight: 600,
          letterSpacing: "0.01em",
          margin: 0,
          opacity: titleOpacity,
        }}
      >
        {step.title}
      </h2>

      {/* Bar field — flat 2D bars on a single baseline */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: barGap,
          position: "relative",
          height: MAX_BAR_HEIGHT + 8,
          paddingTop: 24,
          borderBottom: `1px solid ${c.floor(theme)}`,
        }}
      >
        {snap.numeric_values.map((val, i) => {
          const label = snap.array_values[i] ?? String(val);
          // value-driven fill strength: shorter bars lean toward the base
          // line color, taller bars saturate toward the accent. Keeps the
          // whole field in one hue family (theme accent) instead of a
          // rainbow heatmap.
          const t = Math.abs(val) / heightRef; // 0..1
          const fillRatio = 0.35 + 0.65 * t; // 0.35..1
          const barH = Math.max(MIN_BAR_HEIGHT, t * MAX_BAR_HEIGHT);

          const prevIdx = prevIndexMap[i];
          const isActive = activeSet.has(i);
          const isSwap = swapSet.has(i);
          const isSorted = sortedSet.has(i);

          // ── Motion accumulators ──
          let tx = 0;
          let ty = 0;
          let scale = 1;
          let shadowOpacity = 0;
          let shadowColor: string = c.swapShadow(theme);
          let zIndex = 0;
          let writeOpacity = 1;

          const partner =
            isSwap && prevIdx >= 0 && prevIdx !== i
              ? prevIndexMap.findIndex((p, k) => k !== i && p === i)
              : -1;
          const isPairedSwap = isSwap && partner >= 0 && swapSet.has(partner) && prevIdx !== i;

          if (isPairedSwap && prevIdx >= 0) {
            const dx = (prevIdx - i) * pitch;
            const m = swapMotion(elapsed, dx, swapPhases);
            tx = m.translateX;
            // ty stays 0 — bars slide horizontally without lifting off baseline
            scale = m.scale;
            shadowOpacity = m.shadowOpacity;
            shadowColor = c.swapShadow(theme);
            zIndex = m.zIndex;
            writeOpacity = m.opacity; // reuse opacity channel for cross-fade
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
          // Default: line color (subtle) blended into accent based on height.
          // We use a single solid color per bar (no top/side faces, no
          // multi-stop gradient) so the visual is genuinely flat 2D.
          let face: string = c.accent(theme);
          let opacity = fillRatio;
          let outline: string = c.barOutline(theme);
          let labelColor: string = c.label(theme);

          if (isActive) {
            const s = selectMotion(elapsed);
            ty += s.translateY;
            scale = Math.max(scale, s.scale);
            face = c.accent(theme);
            opacity = 1;
            outline = c.accent(theme);
            labelColor = c.text(theme);
            shadowOpacity = Math.max(shadowOpacity, s.shadowOpacity);
            shadowColor = c.accentShadow(theme);
          } else if (isSwap) {
            face = c.warn(theme);
            opacity = 1;
            outline = c.warn(theme);
            labelColor = c.text(theme);
            if (shadowOpacity === 0) shadowOpacity = 0.4;
            shadowColor = c.swapShadow(theme);
          } else if (isSorted) {
            // Sorted: same hue as accent, slightly lower opacity to read as
            // "settled, no longer interactive".
            face = c.accent(theme);
            opacity = 0.55;
            outline = c.barOutline(theme);
            labelColor = c.label(theme);
          } else {
            // Idle bars: muted color so highlights pop.
            face = c.barBase(theme);
            opacity = Math.max(0.5, fillRatio);
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
              ? `, 0 0 ${10 + shadowOpacity * 12}px ${shadowColor}`
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
                  fontWeight: 600,
                  color: labelColor,
                  lineHeight: 1,
                  whiteSpace: "nowrap",
                }}
              >
                {label}
                {isSorted && (
                  <span
                    style={{
                      color: c.accent(theme),
                      marginLeft: 3,
                      fontSize: labelFont * 0.9,
                      opacity: 0.85,
                    }}
                  >
                    ✓
                  </span>
                )}
              </span>

              {/* flat 2D bar */}
              <div
                style={{
                  width: barW,
                  height: renderedH,
                  background: face,
                  opacity,
                  border: `1px solid ${outline}`,
                  borderBottom: "none",
                  borderTopLeftRadius: 3,
                  borderTopRightRadius: 3,
                  boxShadow: `0 1px 2px ${c.barShadow(theme)}${glow}`,
                }}
              />
              {/* index label below the baseline */}
              <span
                style={{
                  position: "absolute",
                  bottom: -22,
                  fontSize: 11,
                  color: c.narration(theme),
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
                  color: c.accent(theme),
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
          color: c.narration(theme),
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
