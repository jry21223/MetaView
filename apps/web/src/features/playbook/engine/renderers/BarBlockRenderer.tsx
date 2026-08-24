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
import {
  AlgorithmAuxiliaryLanes,
  AlgorithmRangeOverlay,
} from "./AlgorithmSequenceOverlays";

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
const MAX_BAR_HEIGHT = 342;
const MIN_BAR_HEIGHT = 6;
// Headroom above the tallest bar so its value label (top: -22) never rides
// into the step title when the centered column overflows a short scene.
const BAR_FIELD_TOP_PAD = 42;
const POINTER_LABEL_ORDER = ["low", "mid", "high"];

function pointerLabelRank(name: string): number {
  const rank = POINTER_LABEL_ORDER.indexOf(name);
  return rank === -1 ? POINTER_LABEL_ORDER.length : rank;
}

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

  const titleOpacity = prevStep
    ? 1
    : interpolate(elapsed, [0, 8], [0, 1], {
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

  const domainMin = Math.min(0, ...snap.numeric_values);
  const domainMax = Math.max(0, ...snap.numeric_values);
  const domainSpan = Math.max(domainMax - domainMin, 1);
  const pixelsPerUnit = MAX_BAR_HEIGHT / domainSpan;
  const zeroAxisY = domainMax * pixelsPerUnit;
  const barW = Math.max(10, Math.min(72, Math.floor(960 / n) - 8));
  const barGap = Math.max(4, Math.min(14, Math.floor(barW * 0.18)));
  const pitch = barW + barGap;

  const prevIndexMap = buildPrevIndexMap(snap.array_values, prevSnap?.array_values ?? null);
  const swapSet = new Set(snap.swap_indices);
  const activeSet = new Set(snap.active_indices);
  const sortedSet = new Set(snap.sorted_indices);
  const pointerGroups = Array.from(
    Object.entries(snap.pointers).reduce((groups, [name, index]) => {
      const names = groups.get(index) ?? [];
      names.push(name);
      groups.set(index, names);
      return groups;
    }, new Map<number, string[]>()),
  );

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
        // Keep the pointer row inside the 16:9 scene instead of letting the
        // caption strip crop its labels at common desktop widths.
        gap: 18,
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

      {/* Bar field — signed values share a real zero axis. */}
      <div
        data-zero-axis={zeroAxisY}
        style={{
          display: "flex",
          gap: barGap,
          position: "relative",
          height: MAX_BAR_HEIGHT + 8,
          paddingTop: BAR_FIELD_TOP_PAD,
        }}
      >
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: BAR_FIELD_TOP_PAD + zeroAxisY,
            borderTop: `1px solid ${c.floor(theme)}`,
            zIndex: 0,
          }}
        />
        {snap.numeric_values.map((val, i) => {
          const label = snap.array_values[i] ?? String(val);
          const rawBarHeight = Math.abs(val) * pixelsPerUnit;
          const t = rawBarHeight / MAX_BAR_HEIGHT;
          const fillRatio = 0.35 + 0.65 * t; // 0.35..1
          const barH = Math.max(MIN_BAR_HEIGHT, rawBarHeight);

          const prevIdx = prevIndexMap[i];
          const isActive = activeSet.has(i);
          const isSwap = swapSet.has(i);
          const isSorted = sortedSet.has(i);
          const elementStates = snap.element_states?.[i] ?? [];
          const isEntering = elementStates.includes("entering");
          const isLeaving = elementStates.includes("leaving");
          const isMaximum = elementStates.includes("maximum");
          const isPivot = elementStates.includes("pivot");

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
          if (isMaximum) {
            face = c.accent(theme);
            opacity = 1;
            outline = c.accent(theme);
            labelColor = c.text(theme);
          } else if (isPivot) {
            face = c.warn(theme);
            opacity = 1;
            outline = c.warn(theme);
            labelColor = c.text(theme);
          }
          if (isEntering) {
            outline = c.accent(theme);
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
            prevIdx === -1 ? Math.max(MIN_BAR_HEIGHT, barH * entryGrow) : barH;
          const barTop = val >= 0 ? zeroAxisY - renderedH : zeroAxisY;
          const negativeLabelInside = val < 0 && renderedH >= labelFont + 10;
          const valueLabelPosition =
            val < 0
              ? negativeLabelInside
                ? "inside-negative"
                : "above-short-negative"
              : "outside";
          const valueLabelTop =
            val >= 0
              ? barTop - 22
              : negativeLabelInside
                ? barTop + renderedH - labelFont - 5
                : barTop - 22;
          const finalOpacity =
            (prevIdx >= 0 ? 1 : entryOpacity) * writeOpacity * (isLeaving ? 0.42 : 1);

          const glow =
            shadowOpacity > 0
              ? `, 0 0 ${10 + shadowOpacity * 12}px ${shadowColor}`
              : "";

          return (
            <div
              key={i}
              data-bar-index={i}
              data-bar-direction={val < 0 ? "negative" : "positive"}
              data-element-states={elementStates.join(" ") || undefined}
              style={{
                position: "relative",
                width: barW,
                height: MAX_BAR_HEIGHT,
                transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
                transformOrigin: `center ${zeroAxisY}px`,
                opacity: finalOpacity,
                zIndex,
              }}
            >
              {/* value label above the bar */}
              <span
                data-value-label-position={valueLabelPosition}
                style={{
                  position: "absolute",
                  top: valueLabelTop,
                  left: "50%",
                  transform: "translateX(-50%)",
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
                  position: "absolute",
                  top: barTop,
                  left: 0,
                  background: face,
                  opacity,
                  border: `1px solid ${outline}`,
                  borderRadius: 3,
                  boxShadow: `0 1px 2px ${c.barShadow(theme)}${glow}`,
                }}
              />
              {(isMaximum || isPivot) && (
                <span
                  style={{
                    position: "absolute",
                    top: barTop + 4,
                    left: "50%",
                    transform: "translateX(-50%)",
                    color: c.text(theme),
                    fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
                    fontSize: 8,
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                  }}
                >
                  {isMaximum ? "MAX" : "PIVOT"}
                </span>
              )}
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
        <AlgorithmRangeOverlay
          ranges={snap.ranges ?? []}
          previousRanges={prevSnap?.ranges}
          itemWidth={barW}
          gap={barGap}
          itemHeight={MAX_BAR_HEIGHT}
          elapsed={elapsed}
          theme={theme}
        />
      </div>

      {Object.entries(snap.pointers).length > 0 && (
        <div
          style={{
            position: "relative",
            width: n * barW + (n - 1) * barGap,
            height: 34,
            marginTop: 8,
          }}
        >
          {pointerGroups.map(([idx, names]) => {
            const pointerOpacity = prevSnap
              ? 1
              : interpolate(elapsed, [0, 12], [0, 1], {
                  easing: ENTER_BEZIER,
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                });
            return (
              <div
                key={idx}
                data-pointer-index={idx}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  color: c.accent(theme),
                  fontSize: 13,
                  fontWeight: 600,
                  opacity: pointerOpacity,
                  position: "absolute",
                  left: idx * pitch + barW / 2,
                  top: 0,
                  transform: "translateX(-50%)",
                }}
              >
                ▲
                <span style={{ whiteSpace: "nowrap" }}>
                  {[...names]
                    .sort((left, right) => pointerLabelRank(left) - pointerLabelRank(right))
                    .join(" · ")}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <AlgorithmAuxiliaryLanes
        lanes={snap.auxiliary_lanes ?? []}
        width={n * barW + (n - 1) * barGap}
        theme={theme}
      />

    </div>
  );
};
