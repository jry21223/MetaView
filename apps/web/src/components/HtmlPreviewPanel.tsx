import { useState, useCallback } from "react";
import { HtmlSandbox, type HtmlSandboxLoadState } from "./HtmlSandbox";
import { HtmlPlaybackControls } from "./HtmlPlaybackControls";
import type { PlaybackState } from "../hooks/useHtmlPreviewSync";
import type { UITheme } from "../types";
import type { ReactNode } from "react";

interface HtmlPreviewPanelProps {
  src: string;
  srcDoc?: string;
  meta?: string;
  headerAction?: ReactNode;
  theme?: UITheme;
  expectReadySignal?: boolean;
  onLoadStateChange?: (state: HtmlSandboxLoadState) => void;
}

export function HtmlPreviewPanel({
  src,
  srcDoc,
  meta,
  headerAction,
  theme = "dark",
  expectReadySignal = true,
  onLoadStateChange,
}: HtmlPreviewPanelProps) {
  const [totalSteps, setTotalSteps] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);
  const [goToStep, setGoToStep] = useState<number | null>(null);
  const [playback, setPlayback] = useState<PlaybackState>({
    autoplay: false,
    paused: true,
    speed: 1,
  });

  const handleReady = useCallback((steps: number) => {
    setTotalSteps(steps);
    setCurrentStep(0);
    setGoToStep(null);
  }, []);

  const handleStepChange = useCallback((index: number) => {
    setCurrentStep(index);
    setGoToStep(null);
  }, []);

  const handlePrev = useCallback(() => {
    setCurrentStep((s) => {
      const next = Math.max(0, s - 1);
      setGoToStep(next);
      return s;
    });
  }, []);

  const handleNext = useCallback(() => {
    setCurrentStep((s) => {
      const next = Math.min(totalSteps - 1, s + 1);
      setGoToStep(next);
      return s;
    });
  }, [totalSteps]);

  const handleSeek = useCallback((step: number) => {
    setGoToStep(step);
  }, []);

  return (
    <div className="html-preview-panel">
      <div className="html-preview-header">
        <div>
          <div className="video-preview-title html-preview-title">交互动画预览</div>
          {meta ? <div className="video-preview-meta">{meta}</div> : null}
        </div>

        <div className="html-preview-header-actions">{headerAction}</div>
      </div>

      <div className="html-preview-stage html-preview-stage-browser">
        <HtmlSandbox
          src={src}
          srcDoc={srcDoc}
          theme={theme}
          goToStep={goToStep}
          playback={playback}
          expectReadySignal={expectReadySignal}
          onReady={handleReady}
          onStepChange={handleStepChange}
          onLoadStateChange={onLoadStateChange}
        />
      </div>

      {totalSteps > 1 && (
        <HtmlPlaybackControls
          currentStep={currentStep}
          totalSteps={totalSteps}
          playback={playback}
          onPlaybackChange={setPlayback}
          onPrev={handlePrev}
          onNext={handleNext}
          onSeek={handleSeek}
        />
      )}
    </div>
  );
}
