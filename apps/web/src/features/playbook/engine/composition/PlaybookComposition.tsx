import React from "react";
import { useCurrentFrame } from "remotion";
import type { DirectorScript, PlaybookScript } from "../types";
import { CodeHighlightRenderer } from "../renderers/CodeHighlightRenderer";
import { useStepProgress } from "./useInterpolatedState";
import type { RendererProps } from "../renderers/types";
import { PLAYBOOK_LAYOUT } from "../../../../shared/config/constants";
import { rendererRegistry } from "../renderers/registry";
import { appearTransform, useTimeline } from "../foundation";
import { compileVisualTimeline, type VisualLayerState, type VisualStepState } from "./visualContinuity";
import { snapshotSurface } from "./snapshotSurface";
import {
  cameraTransformForBeat,
  findActiveDirectorBeat,
  resolveDirectorVoiceover,
} from "../director";

interface PlaybookCompositionProps {
  script: PlaybookScript;
  director?: DirectorScript | null;
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

/**
 * Render a single layer using its body's snapshot kind through the renderer
 * registry. The layer's timing controls visibility — when the current step
 * progress is outside [enter_at, exit_at], the layer renders nothing.
 */
function LayerSlot({
  layerState,
  baseProps,
  stepProgress,
  firstStageLayerKey,
}: {
  layerState: VisualLayerState;
  baseProps: RendererProps;
  stepProgress: number;
  firstStageLayerKey?: string;
}) {
  const { layer } = layerState;
  const slice = useTimeline(layer.timing, stepProgress);
  const visualProgress = useStepProgress(layerState.visualStartFrame, layerState.visualEndFrame);
  if (!slice.visible) return null;
  const Renderer = rendererRegistry.get(layer.body.kind);
  if (!Renderer) return null;
  const surface = snapshotSurface(layer.body.kind);
  const renderMode =
    surface === "overlay"
      ? "standalone"
      : layerState.visualKey === firstStageLayerKey
        ? "stage-base"
        : "stage-overlay";
  // Each layer renders against its body snapshot; clone the step so the
  // existing RendererProps contract works without changing every renderer.
  const layerStep = { ...baseProps.step, snapshot: layer.body };
  const appear = layerState.isVisualContinuation
    ? appearTransform("none", 1)
    : appearTransform(slice.anim, slice.progress);
  return (
    <div
      className="scene-compositor__layer"
      data-layer-kind={layer.body.kind}
      data-appear-anim={slice.anim}
      data-visual-continuation={layerState.isVisualContinuation ? "true" : "false"}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: layer.timing.z_order,
        pointerEvents: "none",
        opacity: appear.opacity,
        transform: appear.transform === "none" ? undefined : appear.transform,
      }}
    >
      {React.createElement(Renderer, {
        ...baseProps,
        step: layerStep,
        progress: visualProgress,
        stepProgress,
        visualStartFrame: layerState.visualStartFrame,
        visualKey: layerState.visualKey,
        isVisualContinuation: layerState.isVisualContinuation,
        renderMode,
      })}
    </div>
  );
}

/**
 * Multi-layer scene composer. Renders each layer in z_order ascending into
 * stacked absolute layers and falls back to the legacy single-snapshot path
 * when a step has no layers field (older fixtures).
 */
function SceneCompositor({
  baseProps,
  stepProgress,
  visualState,
}: {
  baseProps: RendererProps;
  stepProgress: number;
  visualState: VisualStepState | undefined;
}) {
  const layers = visualState?.layers;
  if (!layers || layers.length === 0) {
    return <SnapshotRenderer {...baseProps} />;
  }
  const firstStageLayerKey = layers.find(
    (layerState) => snapshotSurface(layerState.layer.body.kind) === "stage",
  )?.visualKey;
  return (
    <div className="scene-compositor" style={{ position: "relative", width: "100%", height: "100%" }}>
      {layers.map((layerState, i) => (
        <LayerSlot
          key={`${layerState.visualKey}-${i}`}
          layerState={layerState}
          baseProps={baseProps}
          stepProgress={stepProgress}
          firstStageLayerKey={firstStageLayerKey}
        />
      ))}
    </div>
  );
}

export const PlaybookComposition: React.FC<PlaybookCompositionProps> = ({
  script,
  director = null,
  theme = "dark",
  showSubtitles = true,
  showInlineCode = false,
  swapDurationFrames,
}) => {
  const frame = useCurrentFrame();
  const visualTimeline = React.useMemo(() => compileVisualTimeline(script), [script]);

  const stepIndex = script.steps.findIndex((s) => frame < s.end_frame);
  const activeIndex = stepIndex === -1 ? script.steps.length - 1 : stepIndex;
  const step = script.steps[activeIndex];
  const visualState = visualTimeline.steps[activeIndex];
  const prevStep = activeIndex > 0 ? script.steps[activeIndex - 1] : null;

  const stepStartFrame = prevStep?.end_frame ?? 0;
  const stepEndFrame = step?.end_frame ?? script.total_frames;
  const stepProgress = useStepProgress(stepStartFrame, stepEndFrame);

  if (!step) return null;

  const activeBeat = findActiveDirectorBeat(director, frame);
  const cameraTransform = cameraTransformForBeat(activeBeat, frame);
  const subtitleText = resolveDirectorVoiceover(director, step);
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
    stepProgress,
    progress: stepProgress,
    theme,
    domain: script.domain,
    swapDurationFrames,
    visualStartFrame: visualState?.visualStartFrame,
    visualKey: visualState?.visualKey,
    isVisualContinuation: visualState?.isVisualContinuation,
  };

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Main content area */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Visual track */}
        <div
          style={{
            width: hasCodeTrack ? `${vizRatio * 100}%` : "100%",
            height: "100%",
            overflow: "hidden",
          }}
        >
          <div
            data-camera-motion={activeBeat?.camera_motion}
            style={{
              width: "100%",
              height: "100%",
              transform: cameraTransform,
              transformOrigin: "center center",
            }}
          >
            <SceneCompositor
              baseProps={rendererProps}
              stepProgress={stepProgress}
              visualState={visualState}
            />
          </div>
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

        {/* Subtitle row — minHeight so short narration uses the compact row,
            longer text wraps up to PLAYBOOK_LAYOUT.SUBTITLE_MAX_LINES before
            the ellipsis kicks in. */}
        <div
          style={{
            minHeight: subtitleHeight,
            display: "flex",
            alignItems: "center",
            padding: "8px 20px",
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
              display: "-webkit-box",
              WebkitBoxOrient: "vertical",
              WebkitLineClamp: PLAYBOOK_LAYOUT.SUBTITLE_MAX_LINES,
              overflow: "hidden",
              wordBreak: "break-word",
            }}
          >
            {subtitleText}
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
