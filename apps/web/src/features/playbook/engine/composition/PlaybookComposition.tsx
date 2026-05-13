import React from "react";
import { useCurrentFrame } from "remotion";
import type { PlaybookScript } from "../types";
import { CodeHighlightRenderer } from "../renderers/CodeHighlightRenderer";
import { useStepProgress } from "./useInterpolatedState";
import type { RendererProps } from "../renderers/types";
import { PLAYBOOK_LAYOUT } from "../../../../shared/config/constants";
import { rendererRegistry } from "../renderers/registry";

interface PlaybookCompositionProps {
  script: PlaybookScript;
  theme?: "dark" | "light";
  showSubtitles?: boolean;
  showInlineCode?: boolean;
  /** Total frames for the bar-swap animation; forwarded to renderers. */
  swapDurationFrames?: number;
}

function SnapshotRenderer(props: RendererProps) {
  const Renderer = rendererRegistry.get(props.step.snapshot.kind);
  if (Renderer) return React.createElement(Renderer, props);
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: props.theme === "dark" ? "#0a0c10" : "#f5f7fa",
        color: props.theme === "dark" ? "#e8ecf4" : "#141820",
        fontFamily: "system-ui, sans-serif",
        fontSize: 18,
      }}
    >
      Unknown snapshot kind
    </div>
  );
}

export const PlaybookComposition: React.FC<PlaybookCompositionProps> = ({
  script,
  theme = "dark",
  showSubtitles = true,
  showInlineCode = false,
  swapDurationFrames,
}) => {
  const frame = useCurrentFrame();

  const stepIndex = script.steps.findIndex((s) => frame < s.end_frame);
  const activeIndex = stepIndex === -1 ? script.steps.length - 1 : stepIndex;
  const step = script.steps[activeIndex];
  const prevStep = activeIndex > 0 ? script.steps[activeIndex - 1] : null;

  const stepStartFrame = prevStep?.end_frame ?? 0;
  const stepEndFrame = step?.end_frame ?? script.total_frames;
  const progress = useStepProgress(stepStartFrame, stepEndFrame);

  if (!step) return null;

  const hasCodeTrack = showInlineCode && step.code_highlight != null;
  const subtitleHeight = PLAYBOOK_LAYOUT.SUBTITLE_HEIGHT;
  const vizRatio = PLAYBOOK_LAYOUT.VIZ_SPLIT_RATIO;

  // Subtitle fade: 0→1 over first SUBTITLE_FADE_FRAMES frames of the step
  const localFrame = frame - stepStartFrame;
  const fadeProgress = Math.min(1, localFrame / PLAYBOOK_LAYOUT.SUBTITLE_FADE_FRAMES);

  const isDark = theme === "dark";
  const subtitleBg = isDark ? "rgba(10,12,16,0.85)" : "rgba(245,247,250,0.92)";
  const subtitleColor = isDark ? "#c9d1d9" : "#24292f";
  const dividerColor = isDark ? "#30363d" : "#d0d7de";

  const rendererProps: RendererProps = {
    step,
    prevStep,
    frame,
    stepStartFrame,
    stepEndFrame,
    progress,
    theme,
    swapDurationFrames,
  };

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Main content area */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Visual track */}
        <div style={{ width: hasCodeTrack ? `${vizRatio * 100}%` : "100%", height: "100%" }}>
          <SnapshotRenderer {...rendererProps} />
        </div>

        {/* Code track */}
        {hasCodeTrack && (
          <>
            <div style={{ width: 1, background: dividerColor, flexShrink: 0 }} />
            <div style={{ flex: 1, height: "100%", overflow: "hidden" }}>
              <CodeHighlightRenderer overlay={step.code_highlight!} theme={theme} />
            </div>
          </>
        )}
      </div>

      {/* Subtitle bar — full width, toggleable */}
      {showSubtitles && (
      <div style={{ flexShrink: 0, opacity: fadeProgress }}>
        {/* Progress bar */}
        <div
          style={{
            height: 3,
            background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              height: "100%",
              width: `${(frame / (script.total_frames || 1)) * 100}%`,
              background: isDark ? "#4de8b0" : "#00896e",
              borderRadius: "0 2px 2px 0",
              transition: "width 0.016s linear",
            }}
          />
          {/* Step segment markers */}
          {script.steps.map((s, i) => {
            if (i === 0) return null;
            const pct = (s.end_frame / (script.total_frames || 1)) * 100;
            return (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: `${pct}%`,
                  top: 0,
                  width: 1,
                  height: "100%",
                  background: isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)",
                }}
              />
            );
          })}
        </div>

        {/* Subtitle row */}
        <div
          style={{
            height: subtitleHeight,
            display: "flex",
            alignItems: "center",
            padding: "0 20px",
            background: subtitleBg,
            borderTop: `1px solid ${dividerColor}`,
            gap: 12,
          }}
        >
          <span
            style={{
              color: subtitleColor,
              fontFamily: "system-ui, -apple-system, sans-serif",
              fontSize: 14,
              lineHeight: 1.5,
              flex: 1,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {step.voiceover_text}
          </span>
          <span
            style={{
              flexShrink: 0,
              fontFamily: "IBM Plex Mono, monospace",
              fontSize: 11,
              color: isDark ? "rgba(77,232,176,0.8)" : "rgba(0,120,90,0.8)",
              whiteSpace: "nowrap",
            }}
          >
            {activeIndex + 1} / {script.steps.length}
          </span>
        </div>
      </div>
      )}
    </div>
  );
};
