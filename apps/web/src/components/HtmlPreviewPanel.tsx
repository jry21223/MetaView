import { HtmlSandbox, type SandboxCapabilities } from "./HtmlSandbox";
import { HtmlPlaybackControls } from "./HtmlPlaybackControls";
import { HtmlParameterPanel } from "./HtmlParameterPanel";
import { useHtmlPreviewSync } from "../hooks/useHtmlPreviewSync";
import type { CirDocument, ExecutionMap } from "../types";

interface HtmlPreviewPanelProps {
  src: string;
  cir: CirDocument;
  meta?: string;
  executionMap?: ExecutionMap | null;
}

export function HtmlPreviewPanel({ src, cir, meta, executionMap }: HtmlPreviewPanelProps) {
  const {
    totalSteps,
    setTotalSteps,
    currentStep,
    setCurrentStep,
    goToStep,
    setGoToStep,
    playback,
    setPlayback,
    params,
    setParams,
    setCapabilities,
    handlePrev,
    handleNext,
    seekToStep,
    updateParam,
    highlightedLines,
    jumpToCodeLine,
  } = useHtmlPreviewSync(cir, executionMap);

  const currentCirStep = cir.steps[currentStep];

  const handleCapabilities = (caps: SandboxCapabilities) => {
    setCapabilities(caps);
  };

  return (
    <div
      className="html-preview-panel"
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        background: "var(--surface)",
        borderRadius: "var(--radius-lg)",
        border: "1px solid var(--outline-variant)",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        className="html-preview-header"
        style={{
          padding: "16px 20px",
          borderBottom: "1px solid var(--outline-variant)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <div
            className="video-preview-title"
            style={{ fontWeight: 600, fontSize: "1.1rem" }}
          >
            交互动画预览
          </div>
          {meta && (
            <div
              className="video-preview-meta"
              style={{ fontSize: "0.85rem", color: "var(--on-surface-variant)", marginTop: "4px" }}
            >
              {meta}
            </div>
          )}
        </div>

        {/* Step indicator */}
        {totalSteps > 0 && (
          <span className="chip chip-outline">
            步骤 {currentStep + 1} / {totalSteps}
          </span>
        )}
      </div>

      {/* Sandbox iframe wrapper */}
      <div
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: "16/9",
          background: "var(--surface-container-lowest)",
          overflow: "hidden",
        }}
      >
        <HtmlSandbox
          src={src}
          goToStep={goToStep}
          playback={playback}
          params={params}
          onReady={setTotalSteps}
          onStepChange={(index) => {
            setCurrentStep(index);
            setGoToStep(null);
          }}
          onCapabilities={handleCapabilities}
        />

        {/* Floating Subtitle Overlay */}
        {currentCirStep && (
          <div
            style={{
              position: "absolute",
              bottom: "16px",
              left: "50%",
              transform: "translateX(-50%)",
              background: "rgba(10, 12, 16, 0.85)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              color: "#fff",
              padding: "12px 20px",
              borderRadius: "var(--radius-full)",
              textAlign: "center",
              maxWidth: "min(80%, 600px)",
              boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
              border: "1px solid rgba(255,255,255,0.1)",
              zIndex: 10,
            }}
          >
            <div style={{ fontWeight: 600, fontSize: "0.95rem", marginBottom: "4px" }}>
              {currentCirStep.title}
            </div>
            <div style={{ fontSize: "0.85rem", opacity: 0.9, lineHeight: 1.5 }}>
              {currentCirStep.narration}
            </div>
          </div>
        )}
      </div>

      {/* Controls Area */}
      <div
        style={{
          padding: "0 16px 16px 16px",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        <HtmlPlaybackControls
          currentStep={currentStep}
          totalSteps={totalSteps}
          playback={playback}
          onPlaybackChange={setPlayback}
          onPrev={handlePrev}
          onNext={handleNext}
          onSeek={seekToStep}
        />

        {executionMap?.parameter_controls && executionMap.parameter_controls.length > 0 && (
          <HtmlParameterPanel
            controls={executionMap.parameter_controls}
            values={params}
            onChange={updateParam}
          />
        )}
      </div>
    </div>
  );
}
