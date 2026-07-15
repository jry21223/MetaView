import React from "react";
import { useCurrentFrame } from "remotion";
import type { DirectorScript, PlaybookScript } from "../types";
import { CodeHighlightRenderer } from "../renderers/CodeHighlightRenderer";
import { useStepProgress } from "./useInterpolatedState";
import type { RendererInteractionEvent, RendererProps } from "../renderers/types";
import { PLAYBOOK_LAYOUT } from "../../../../shared/config/constants";
import { rendererRegistry } from "../renderers/registry";
import { appearTransform, useTimeline } from "../foundation";
import { compileVisualTimeline, type VisualLayerState, type VisualStepState } from "./visualContinuity";
import { snapshotSurface } from "./snapshotSurface";
import { buildDirectorFramePlan } from "../director";
import { AssetSvg } from "../assets/AssetSvg";
import { visualQualityGate } from "../assets/visualQualityGate";
import { assetAttributionEntryId, createAssetAttributionSummary } from "../assets/assetAttributionSummary";

interface PlaybookCompositionProps {
  script: PlaybookScript;
  director?: DirectorScript | null;
  theme?: "dark" | "light";
  showSubtitles?: boolean;
  /** Render diagnostic metadata and warning overlays for teacher/review surfaces. */
  showDiagnostics?: boolean;
  showInlineCode?: boolean;
  /** Total frames for the bar-swap animation; forwarded to renderers. */
  swapDurationFrames?: number;
  /** Browser-only semantic interaction channel; omitted by export renders. */
  onInteraction?: (event: RendererInteractionEvent) => void;
}

function stageBackground(theme: "dark" | "light"): string {
  return theme === "dark" ? "#0f1117" : "#f6f8fa";
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

function VisualQualityWarningIcon() {
  return (
    <svg
      aria-hidden="true"
      data-visual-quality-warning-icon="true"
      viewBox="0 0 36 32"
      style={{
        position: "absolute",
        top: 10,
        right: 10,
        width: 36,
        height: 32,
        zIndex: 30,
        pointerEvents: "none",
        opacity: 0.9,
        filter: "drop-shadow(0 2px 6px rgba(0, 0, 0, 0.26))",
      }}
    >
      <AssetSvg
        assetId="core-warning-icon"
        packId="core-visual-basic"
        semanticRole="warning"
        x={4}
        y={2}
        width={28}
        height={28}
      />
    </svg>
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
  director,
  script,
  frame,
  interactiveLayerKey,
}: {
  layerState: VisualLayerState;
  baseProps: RendererProps;
  stepProgress: number;
  firstStageLayerKey?: string;
  director?: DirectorScript | null;
  script: PlaybookScript;
  frame: number;
  interactiveLayerKey?: string;
}) {
  const { layer } = layerState;
  const slice = useTimeline(layer.timing, stepProgress);
  const visualProgress = useStepProgress(layerState.visualStartFrame, layerState.visualEndFrame);
  const layerStep = React.useMemo(
    () => ({ ...baseProps.step, snapshot: layer.body }),
    [baseProps.step, layer.body],
  );
  const layerDirectorFrame = React.useMemo(
    () =>
      buildDirectorFramePlan({
        director: director ?? null,
        script,
        frame,
        step: layerStep,
        prevStep: baseProps.prevStep,
        stepProgress: visualProgress,
      }),
    [baseProps.prevStep, director, frame, layerStep, script, visualProgress],
  );
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
  const appear = renderMode === "stage-base" || layerState.isVisualContinuation
    ? appearTransform("none", 1)
    : appearTransform(slice.anim, slice.progress);
  const layerOnInteraction = layerState.visualKey === interactiveLayerKey
    ? baseProps.onInteraction
    : undefined;
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
        directorFrame: layerDirectorFrame,
        onInteraction: layerOnInteraction,
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
  director,
  script,
  frame,
}: {
  baseProps: RendererProps;
  stepProgress: number;
  visualState: VisualStepState | undefined;
  director?: DirectorScript | null;
  script: PlaybookScript;
  frame: number;
}) {
  const layers = visualState?.layers;
  if (!layers || layers.length === 0) {
    return <SnapshotRenderer {...baseProps} />;
  }
  const firstStageLayerKey = layers.find(
    (layerState) => snapshotSurface(layerState.layer.body.kind) === "stage",
  )?.visualKey;
  const declaredMathLayerCount = baseProps.step.layers?.length
    ? baseProps.step.layers.filter((layer) => layer.body.kind === "math_plot").length
    : baseProps.step.snapshot.kind === "math_plot" ? 1 : 0;
  const renderedMathLayers = layers.filter(
    (layerState) => layerState.layer.body.kind === "math_plot",
  );
  const interactiveLayerKey =
    baseProps.onInteraction &&
    declaredMathLayerCount === 1 &&
    renderedMathLayers.length === 1
      ? renderedMathLayers[0].visualKey
      : undefined;
  return (
    <div
      className="scene-compositor"
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        background: stageBackground(baseProps.theme),
      }}
    >
      {layers.map((layerState) => (
        <LayerSlot
          key={layerState.visualKey}
          layerState={layerState}
          baseProps={baseProps}
          stepProgress={stepProgress}
          firstStageLayerKey={firstStageLayerKey}
          director={director}
          script={script}
          frame={frame}
          interactiveLayerKey={interactiveLayerKey}
        />
      ))}
    </div>
  );
}

export const PlaybookComposition: React.FC<PlaybookCompositionProps> = ({
  script,
  director = null,
  theme = "light",
  showSubtitles = true,
  showDiagnostics = false,
  showInlineCode = false,
  swapDurationFrames,
  onInteraction,
}) => {
  const frame = useCurrentFrame();
  const visualTimeline = React.useMemo(() => compileVisualTimeline(script), [script]);
  const visualQualityWarnings = React.useMemo(() => visualQualityGate(script), [script]);
  const assetAttributionSummary = React.useMemo(
    () => createAssetAttributionSummary(visualQualityWarnings),
    [visualQualityWarnings],
  );

  React.useEffect(() => {
    if (showDiagnostics && visualQualityWarnings.length > 0) {
      console.warn("[MetaView visualQualityGate]", visualQualityWarnings);
    }
  }, [showDiagnostics, visualQualityWarnings]);

  const stepIndex = script.steps.findIndex((s) => frame < s.end_frame);
  const activeIndex = stepIndex === -1 ? script.steps.length - 1 : stepIndex;
  const step = script.steps[activeIndex];
  const visualState = visualTimeline.steps[activeIndex];
  const prevStep = activeIndex > 0 ? script.steps[activeIndex - 1] : null;

  const stepStartFrame = prevStep?.end_frame ?? 0;
  const stepEndFrame = step?.end_frame ?? script.total_frames;
  const stepProgress = useStepProgress(stepStartFrame, stepEndFrame);

  const directorFrame = React.useMemo(
    () => {
      if (!step) return null;
      return buildDirectorFramePlan({
        director,
        script,
        frame,
        step,
        prevStep,
        stepProgress,
      });
    },
    [director, frame, prevStep, script, step, stepProgress],
  );
  if (!step || !directorFrame) return null;

  const cameraTransform = directorFrame.stage.transform;
  const directorVoiceoverText = directorFrame.voiceoverText;
  const directorBeatHasVoiceover = Boolean(directorVoiceoverText?.trim());
  const shouldShowDirectorVoiceover =
    directorFrame.activeBeat != null &&
    directorFrame.activeBeat.end_frame - directorFrame.activeBeat.start_frame >= 60 &&
    directorBeatHasVoiceover;
  const subtitleText = shouldShowDirectorVoiceover ? directorVoiceoverText : step.voiceover_text;
  const hasCodeTrack = showInlineCode && step.code_highlight != null;
  const subtitleHeight = PLAYBOOK_LAYOUT.SUBTITLE_HEIGHT;
  const vizRatio = PLAYBOOK_LAYOUT.VIZ_SPLIT_RATIO;

  // Subtitle fade: 0→1 over first SUBTITLE_FADE_FRAMES frames of the step
  const localFrame = frame - stepStartFrame;
  const fadeProgress = Math.min(1, localFrame / PLAYBOOK_LAYOUT.SUBTITLE_FADE_FRAMES);

  const isDark = theme === "dark";
  const visualBackground = stageBackground(theme);
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
    directorFrame,
    onInteraction,
  };

  return (
    <div
      data-visual-quality-warning-count={showDiagnostics ? visualQualityWarnings.length || undefined : undefined}
      data-visual-quality-warning-codes={
        showDiagnostics && visualQualityWarnings.length ? visualQualityWarnings.map((warning) => warning.code).join(",") : undefined
      }
      data-visual-quality-warning-steps={
        showDiagnostics && visualQualityWarnings.length ? visualQualityWarnings.map((warning) => warning.step_id).join(",") : undefined
      }
      data-asset-attribution-count={assetAttributionSummary.attributionRequired.length || undefined}
      data-asset-attribution-ids={
        assetAttributionSummary.attributionRequired.length
          ? assetAttributionSummary.attributionRequired.map(assetAttributionEntryId).join(",")
          : undefined
      }
      data-asset-license-risk-count={assetAttributionSummary.licenseRisk.length || undefined}
      data-asset-license-risk-ids={
        assetAttributionSummary.licenseRisk.length
          ? assetAttributionSummary.licenseRisk.map(assetAttributionEntryId).join(",")
          : undefined
      }
      data-asset-attribution-summary={
        assetAttributionSummary.entries.length ? JSON.stringify(assetAttributionSummary.entries) : undefined
      }
      style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}
    >
      {/* Main content area */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Visual track */}
        <div
          style={{
            width: hasCodeTrack ? `${vizRatio * 100}%` : "100%",
            height: "100%",
            overflow: "hidden",
            position: "relative",
            background: visualBackground,
          }}
        >
          <div
            data-camera-motion={directorFrame.activeBeat?.camera_motion}
            data-director-adapter={directorFrame.debug.adapter}
            style={{
              width: "100%",
              height: "100%",
              transform: cameraTransform,
              transformOrigin: "center center",
              background: visualBackground,
            }}
          >
            <SceneCompositor
              baseProps={rendererProps}
              stepProgress={stepProgress}
              visualState={visualState}
              director={director}
              script={script}
              frame={frame}
            />
          </div>
          {showDiagnostics && visualQualityWarnings.length > 0 ? <VisualQualityWarningIcon /> : null}
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
