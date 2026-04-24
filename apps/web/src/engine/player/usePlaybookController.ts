import { useCallback, useEffect, useRef, useState } from "react";
import type { PlayerRef } from "@remotion/player";
import type { MetaStep, PlaybookScript } from "../types";

export interface PlaybookController {
  playerRef: React.RefObject<PlayerRef | null>;
  currentStepIndex: number;
  isPlaying: boolean;
  canGoPrev: boolean;
  canGoNext: boolean;
  goToStep: (index: number) => void;
  prev: () => void;
  next: () => void;
  onFrameUpdate: (frame: number) => void;
}

export function usePlaybookController(script: PlaybookScript): PlaybookController {
  const playerRef = useRef<PlayerRef | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

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
      setIsPlaying(true);
    },
    [script.steps.length, stepStartFrame]
  );

  const prev = useCallback(() => {
    goToStep(currentStepIndex - 1);
  }, [currentStepIndex, goToStep]);

  const next = useCallback(() => {
    goToStep(currentStepIndex + 1);
  }, [currentStepIndex, goToStep]);

  const currentStepIndexRef = useRef(currentStepIndex);
  currentStepIndexRef.current = currentStepIndex;

  const onFrameUpdate = useCallback(
    (frame: number) => {
      const idx = currentStepIndexRef.current;
      const step = script.steps[idx] as MetaStep | undefined;
      if (!step) return;
      if (frame >= step.end_frame) {
        playerRef.current?.pause();
        setIsPlaying(false);
        if (idx < script.steps.length - 1) {
          setCurrentStepIndex(idx + 1);
        }
      }
    },
    [script.steps]
  );

  // Wire frame-update interception via playerRef event listener
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    const handler = ({ detail }: { detail: { frame: number } }) => {
      onFrameUpdate(detail.frame);
    };
    player.addEventListener("timeupdate", handler);
    return () => {
      player.removeEventListener("timeupdate", handler);
    };
  });

  return {
    playerRef,
    currentStepIndex,
    isPlaying,
    canGoPrev: currentStepIndex > 0,
    canGoNext: currentStepIndex < script.steps.length - 1,
    goToStep,
    prev,
    next,
    onFrameUpdate,
  };
}
