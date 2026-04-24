import React from "react";
import { useCurrentFrame } from "remotion";
import type { PlaybookScript } from "../types";
import { rendererRegistry } from "../renderers/registry";
import { useStepProgress } from "./useInterpolatedState";

interface PlaybookCompositionProps {
  script: PlaybookScript;
  theme?: "dark" | "light";
}

export const PlaybookComposition: React.FC<PlaybookCompositionProps> = ({
  script,
  theme = "dark",
}) => {
  const frame = useCurrentFrame();

  const stepIndex = script.steps.findIndex((s) => frame <= s.end_frame);
  const activeIndex = stepIndex === -1 ? script.steps.length - 1 : stepIndex;
  const step = script.steps[activeIndex];
  const prevStep = activeIndex > 0 ? script.steps[activeIndex - 1] : null;

  const stepStartFrame = prevStep?.end_frame ?? 0;
  const stepEndFrame = step?.end_frame ?? script.total_frames;
  const progress = useStepProgress(stepStartFrame, stepEndFrame);

  if (!step) return null;

  const Renderer = rendererRegistry.get(step.snapshot.kind);
  if (!Renderer) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: theme === "dark" ? "#0a0c10" : "#f5f7fa",
          color: theme === "dark" ? "#e8ecf4" : "#141820",
          fontFamily: "system-ui, sans-serif",
          fontSize: 18,
        }}
      >
        No renderer for: {step.snapshot.kind}
      </div>
    );
  }

  return (
    <Renderer
      step={step}
      prevStep={prevStep}
      frame={frame}
      stepStartFrame={stepStartFrame}
      stepEndFrame={stepEndFrame}
      progress={progress}
      theme={theme}
    />
  );
};
