import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PlayerRef } from "@remotion/player";
import type { MetaStep, PlaybookScript } from "../types";

export interface PlaybookController {
  currentStepIndex: number;
  canGoPrev: boolean;
  canGoNext: boolean;
  goToStep: (index: number) => void;
  prev: () => void;
  next: () => void;
}

export function usePlaybookController(
  script: PlaybookScript,
  playerRef: React.RefObject<PlayerRef | null>,
): PlaybookController {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  const currentStepIndexRef = useRef(currentStepIndex);
  useLayoutEffect(() => {
    currentStepIndexRef.current = currentStepIndex;
  });

  const stepStartFrame = useCallback(
    (index: number): number => {
      if (index <= 0) return 0;
      return script.steps[index - 1]?.end_frame ?? 0;
    },
    [script.steps]
  );

  const goToStep = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(index, script.steps.length - 1));
      setCurrentStepIndex(clamped);
      const startFrame = stepStartFrame(clamped);
      playerRef.current?.seekTo(startFrame);
      playerRef.current?.play();
    },
    [script.steps.length, stepStartFrame, playerRef]
  );

  const prev = useCallback(() => {
    goToStep(currentStepIndex - 1);
  }, [currentStepIndex, goToStep]);

  const next = useCallback(() => {
    goToStep(currentStepIndex + 1);
  }, [currentStepIndex, goToStep]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    const handler = ({ detail }: { detail: { frame: number } }) => {
      const idx = currentStepIndexRef.current;
      const step = script.steps[idx] as MetaStep | undefined;
      if (!step) return;
      if (detail.frame >= step.end_frame) {
        player.pause();
        if (idx < script.steps.length - 1) {
          setCurrentStepIndex(idx + 1);
        }
      }
    };
    player.addEventListener("timeupdate", handler);
    return () => {
      player.removeEventListener("timeupdate", handler);
    };
  });

  return {
    currentStepIndex,
    canGoPrev: currentStepIndex > 0,
    canGoNext: currentStepIndex < script.steps.length - 1,
    goToStep,
    prev,
    next,
  };
}
