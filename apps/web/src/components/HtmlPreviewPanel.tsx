import { useState } from "react";
import { HtmlSandbox } from "./HtmlSandbox";
import type { CirDocument } from "../types";

interface HtmlPreviewPanelProps {
  src: string;
  cir: CirDocument;
  meta?: string;
}

export function HtmlPreviewPanel({ src, cir, meta }: HtmlPreviewPanelProps) {
  const [totalSteps, setTotalSteps] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);
  const [goToStep, setGoToStep] = useState<number | null>(null);

  function handlePrev() {
    const next = Math.max(0, currentStep - 1);
    setGoToStep(next);
  }

  function handleNext() {
    const next = Math.min(totalSteps - 1, currentStep + 1);
    setGoToStep(next);
  }

  const currentCirStep = cir.steps[currentStep];

  return (
    <div className="html-preview-panel">
      {/* Header */}
      <div className="html-preview-header">
        <div>
          <div className="video-preview-title">交互动画预览</div>
          {meta && <div className="video-preview-meta">{meta}</div>}
        </div>
        <div className="html-preview-step-info">
          {totalSteps > 0 && (
            <span className="chip chip-outline">
              {currentStep + 1} / {totalSteps} 步
            </span>
          )}
        </div>
      </div>

      {/* Sandbox iframe */}
      <HtmlSandbox
        src={src}
        goToStep={goToStep}
        onReady={setTotalSteps}
        onStepChange={(index) => {
          setCurrentStep(index);
          setGoToStep(null);
        }}
      />

      {/* Step navigation + narration */}
      <div className="html-preview-controls">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={currentStep <= 0}
          onClick={handlePrev}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>chevron_left</span>
          上一步
        </button>

        <div className="html-preview-narration">
          {currentCirStep && (
            <>
              <strong>{currentCirStep.title}</strong>
              <span>{currentCirStep.narration}</span>
            </>
          )}
        </div>

        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={currentStep >= totalSteps - 1}
          onClick={handleNext}
        >
          下一步
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>chevron_right</span>
        </button>
      </div>
    </div>
  );
}
