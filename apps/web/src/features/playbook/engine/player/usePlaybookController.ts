import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PlayerRef } from "@remotion/player";
import type { MetaStep, PlaybookScript } from "../types";

export interface PlaybackGate {
  isSpeaking: boolean;
  ttsEnabled: boolean;
}

export interface PlaybookController {
  currentStepIndex: number;
  canGoPrev: boolean;
  canGoNext: boolean;
  stepThrough: boolean;
  setStepThrough: (v: boolean) => void;
  goToStep: (index: number) => void;
  prev: () => void;
  next: () => void;
}

function frameToStepIndex(frame: number, steps: MetaStep[]): number {
  if (steps.length === 0) return 0;
  // Binary search for smallest i with frame < steps[i].end_frame.
  let lo = 0;
  let hi = steps.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (frame < steps[mid].end_frame) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

function deferFrame(fn: () => void): void {
  if (typeof window === "undefined") {
    fn();
    return;
  }
  window.requestAnimationFrame(fn);
}

function clampStepIndex(index: number, stepCount: number): number {
  if (stepCount <= 0) return 0;
  return Math.max(0, Math.min(index, stepCount - 1));
}

export function usePlaybookController(
  script: PlaybookScript,
  playerRef: React.RefObject<PlayerRef | null>,
  gate?: PlaybackGate,
): PlaybookController {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [stepThrough, setStepThrough] = useState(false);

  const stepThroughRef = useRef(stepThrough);
  const prevFrameRef = useRef(0);
  // True when the player paused at a step boundary waiting for TTS to finish.
  // Cleared when the audio ends and we resume playback.
  const awaitingAudioRef = useRef(false);
  const gateRef = useRef<PlaybackGate | undefined>(gate);
  useLayoutEffect(() => {
    stepThroughRef.current = stepThrough;
    gateRef.current = gate;
  });

  useEffect(() => {
    const id = setTimeout(() => {
      setCurrentStepIndex((current) => clampStepIndex(current, script.steps.length));
    }, 0);
    return () => clearTimeout(id);
  }, [script.steps.length]);

  const stepStartFrame = useCallback(
    (index: number): number => {
      if (index <= 0) return 0;
      return script.steps[index - 1]?.end_frame ?? 0;
    },
    [script.steps]
  );

  const goToStep = useCallback(
    (index: number) => {
      const clamped = clampStepIndex(index, script.steps.length);
      const startFrame = stepStartFrame(clamped);
      const player = playerRef.current;

      awaitingAudioRef.current = false;
      prevFrameRef.current = startFrame;
      // Manual step jumps should be a stable seek, not a new autoplay cycle.
      // Pausing before seek avoids the brief blank frame users saw when the
      // Remotion Player had to repaint while playback was still advancing.
      player?.pause();
      player?.seekTo(startFrame);
      deferFrame(() => setCurrentStepIndex((current) => (current === clamped ? current : clamped)));
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
      const frame = detail.frame;
      const idx = frameToStepIndex(frame, script.steps);

      // Detect crossing into a new step boundary (forward direction only).
      const prevFrame = prevFrameRef.current;
      const prevIdx = frameToStepIndex(prevFrame, script.steps);
      const crossedForward = frame > prevFrame && idx > prevIdx;
      prevFrameRef.current = frame;

      setCurrentStepIndex((current) => (current === idx ? current : idx));

      if (crossedForward) {
        if (stepThroughRef.current) {
          // Pause exactly at the start of the new step for step-through behavior.
          player.pause();
        } else if (gateRef.current?.ttsEnabled && gateRef.current.isSpeaking) {
          // Continuous mode: video must wait for the previous step's voiceover
          // to finish before advancing into the next step's animation.
          player.pause();
          awaitingAudioRef.current = true;
        }
      }
    };
    player.addEventListener("timeupdate", handler);
    return () => {
      player.removeEventListener("timeupdate", handler);
    };
    // Only re-register when the script timeline changes — previous/step/gate
    // state already flows through refs (see useLayoutEffect above), so the
    // handler closure stays valid across re-renders. Without these deps the
    // effect re-fired every frame, churning addEventListener at 30+ fps.
    // (Issue #50.)
  }, [script.steps, playerRef]);

  // Resume playback when TTS finishes the previous step's voiceover.
  // Skipped in step-through mode (each step always pauses) and when there is
  // no gate / TTS is disabled.
  useEffect(() => {
    if (!awaitingAudioRef.current) return;
    if (stepThroughRef.current) return;
    if (!gate || !gate.ttsEnabled) return;
    if (gate.isSpeaking) return;
    awaitingAudioRef.current = false;
    playerRef.current?.play();
  }, [gate?.isSpeaking, gate?.ttsEnabled, gate, playerRef]);

  return {
    currentStepIndex,
    canGoPrev: currentStepIndex > 0,
    canGoNext: currentStepIndex < script.steps.length - 1,
    stepThrough,
    setStepThrough,
    goToStep,
    prev,
    next,
  };
}
