import React from "react";
import { useCurrentFrame } from "remotion";
import type { PlaybookScript } from "../types";
import { AlgorithmRenderer } from "../renderers/AlgorithmRenderer";
import { BinaryTreeRenderer } from "../renderers/BinaryTreeRenderer";
import { useStepProgress } from "./useInterpolatedState";
import type { RendererProps } from "../renderers/types";

interface PlaybookCompositionProps {
  script: PlaybookScript;
  theme?: "dark" | "light";
}

function SnapshotRenderer(props: RendererProps) {
  switch (props.step.snapshot.kind) {
    case "algorithm_array": return <AlgorithmRenderer {...props} />;
    case "algorithm_tree": return <BinaryTreeRenderer {...props} />;
    default: return (
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

  return (
    <SnapshotRenderer
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
