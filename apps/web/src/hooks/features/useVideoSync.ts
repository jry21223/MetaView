import { useState, useRef } from "react";
import type { PipelineResponse } from "../../types";

export function useVideoSync(result: PipelineResponse | null) {
  const [activeStepIndex, setActiveStepIndex] = useState<number | null>(null);
  const [seekToTime, setSeekToTime] = useState<number | null>(null);

  const lastVideoUpdateTimeRef = useRef<number>(0);

  const stepTiming = result?.step_timing ?? [];

  const handleVideoTimeUpdate = (currentTime: number) => {
    if (stepTiming.length === 0) return;

    const now = Date.now();
    const throttleMs = typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches
      ? 66
      : 33;
    if (now - lastVideoUpdateTimeRef.current < throttleMs) {
      return;
    }
    lastVideoUpdateTimeRef.current = now;

    for (let i = 0; i < stepTiming.length; i++) {
      const step = stepTiming[i];
      if (currentTime >= step.start_time && currentTime < step.end_time) {
        if (activeStepIndex !== i) {
          setActiveStepIndex(i);
        }
        return;
      }
    }
    if (activeStepIndex !== null) {
      setActiveStepIndex(null);
    }
  };

  const handleSourceLineClick = (lineIndex: number) => {
    const lineNumber = lineIndex + 1;
    const match = stepTiming.find(
      (s) => s.start_line != null && s.end_line != null
        && lineNumber >= s.start_line && lineNumber <= s.end_line,
    );
    if (match) {
      setSeekToTime(match.start_time);
      setTimeout(() => setSeekToTime(null), 100);
    }
  };

  const highlightedSourceLines =
    activeStepIndex !== null && stepTiming[activeStepIndex]
      && stepTiming[activeStepIndex].start_line != null
      && stepTiming[activeStepIndex].end_line != null
      ? Array.from(
          {
            length:
              stepTiming[activeStepIndex].end_line! -
              stepTiming[activeStepIndex].start_line! +
              1,
          },
          (_, i) => stepTiming[activeStepIndex].start_line! + i - 1,
        )
      : [];

  return {
    activeStepIndex,
    setActiveStepIndex,
    seekToTime,
    setSeekToTime,
    handleVideoTimeUpdate,
    handleSourceLineClick,
    highlightedSourceLines,
  };
}
