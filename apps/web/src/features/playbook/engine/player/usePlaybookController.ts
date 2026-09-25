import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PlayerRef } from "@remotion/player";
import type { MetaStep, PlaybookScript } from "../types";
import { resolveStepSettledFrame, resolveStepStartFrame } from "./previewFrame";

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
  /** Starts playback; a playhead parked on a step's settled frame first rewinds to that step's start. */
  play: () => void;
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

/**
 * The step whose settled (last) frame playback reached moving from
 * `fromFrame` to `toFrame`, or null. The final step has no boundary to stop
 * at. A playhead already resting on a settled frame moves past it without
 * reaching it again, which is what lets playback resume from a hold.
 */
function settledFrameReached(steps: MetaStep[], fromFrame: number, toFrame: number): number | null {
  for (let index = 0; index < steps.length - 1; index += 1) {
    const settledFrame = resolveStepSettledFrame(steps, index);
    if (settledFrame > toFrame) return null;
    if (settledFrame > fromFrame) return index;
  }
  return null;
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
  // The step whose settled frame the playhead is parked on — the opening
  // poster frame (always inside the first step) or a manual step jump — or
  // null once playback has moved on. Playing from a settled frame would cross
  // into the next step almost immediately and skip this step's entrance and
  // narration, so the next play rewinds to the parked step's start instead.
  const parkedStepRef = useRef<number | null>(0);
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

  const goToStep = useCallback(
    (index: number) => {
      const clamped = clampStepIndex(index, script.steps.length);
      const settledFrame = resolveStepSettledFrame(script.steps, clamped);
      const player = playerRef.current;

      awaitingAudioRef.current = false;
      parkedStepRef.current = clamped;
      prevFrameRef.current = settledFrame;
      // Manual step jumps should be a stable seek, not a new autoplay cycle.
      // Pausing before seek avoids the brief blank frame users saw when the
      // Remotion Player had to repaint while playback was still advancing.
      // The paused picture is the step's settled frame: on its first frame the
      // nodes that just changed state are still at zero opacity.
      player?.pause();
      player?.seekTo(settledFrame);
      deferFrame(() => setCurrentStepIndex((current) => (current === clamped ? current : clamped)));
    },
    [script.steps, playerRef]
  );

  const play = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    const parkedStep = parkedStepRef.current;
    if (parkedStep != null) {
      const startFrame = resolveStepStartFrame(
        script.steps,
        clampStepIndex(parkedStep, script.steps.length),
      );
      parkedStepRef.current = null;
      prevFrameRef.current = startFrame;
      player.seekTo(startFrame);
    }
    player.play();
  }, [script.steps, playerRef]);

  const prev = useCallback(() => {
    goToStep(currentStepIndex - 1);
  }, [currentStepIndex, goToStep]);

  const next = useCallback(() => {
    goToStep(currentStepIndex + 1);
  }, [currentStepIndex, goToStep]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    const showStep = (index: number) => {
      setCurrentStepIndex((current) => (current === index ? current : index));
    };
    // Stop on a finished step's settled frame, where every entrance has
    // faded in. Playback resumes from here straight into the next step's
    // first frame, since that move does not reach this settled frame again.
    const holdSettledFrame = (step: number, frame: number) => {
      const settledFrame = resolveStepSettledFrame(script.steps, step);
      prevFrameRef.current = settledFrame;
      player.pause();
      // A dropped frame can carry playback past the boundary.
      if (frame !== settledFrame) player.seekTo(settledFrame);
    };
    // `frameupdate` fires for every frame; `timeupdate` is throttled to one
    // per 250 ms, which left auto-pauses up to 7 frames into the next step
    // with its changed nodes still half faded in.
    const handler = ({ detail }: { detail: { frame: number } }) => {
      const frame = detail.frame;
      const prevFrame = prevFrameRef.current;
      // The controller's own seeks (step jumps, rewinds, holds) already
      // recorded their frame and step.
      if (frame === prevFrame) return;
      prevFrameRef.current = frame;

      const finishedStep = player.isPlaying()
        ? settledFrameReached(script.steps, prevFrame, frame)
        : null;
      if (finishedStep != null) {
        if (stepThroughRef.current) {
          // The finished step stays current, with its narration, until the
          // viewer plays on.
          holdSettledFrame(finishedStep, frame);
          showStep(finishedStep);
          return;
        }
        if (gateRef.current?.ttsEnabled && gateRef.current.isSpeaking) {
          // Continuous mode: video must wait for the voiceover to finish
          // before advancing into the next step's animation. The step index
          // still advances now, so the next step's line starts during the hold.
          holdSettledFrame(finishedStep, frame);
          awaitingAudioRef.current = true;
          showStep(finishedStep + 1);
          return;
        }
      }
      showStep(frameToStepIndex(frame, script.steps));
    };
    // Playback started some other way (e.g. the Remotion space key) has left
    // the parked frame behind, so a later play must not rewind to it.
    const unpark = () => {
      parkedStepRef.current = null;
    };
    player.addEventListener("frameupdate", handler);
    player.addEventListener("play", unpark);
    return () => {
      player.removeEventListener("frameupdate", handler);
      player.removeEventListener("play", unpark);
    };
    // Only re-register when the script timeline changes — previous/step/gate
    // state already flows through refs (see useLayoutEffect above), so the
    // handler closure stays valid across re-renders. Without these deps the
    // effect re-fired every frame, churning addEventListener at 30+ fps.
    // (Issue #50.)
  }, [script.steps, playerRef]);

  // Resume playback from a gate hold once the voiceover finishes.
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
    play,
    prev,
    next,
  };
}
