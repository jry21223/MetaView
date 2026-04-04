import { useState, useCallback, useMemo } from "react";
import type { CirDocument, ExecutionMap, ExecutionParameterControl, ExecutionCheckpoint } from "../types";

export interface PlaybackState {
  autoplay: boolean;
  paused: boolean;
  speed: number;
}

export interface SandboxCapabilities {
  playback?: boolean;
  params?: boolean;
  theme?: boolean;
  reducedMotionAware?: boolean;
}

export interface UseHtmlPreviewSyncReturn {
  // State
  totalSteps: number;
  currentStep: number;
  goToStep: number | null;
  playback: PlaybackState;
  params: Record<string, string>;
  capabilities: SandboxCapabilities | null;

  // Actions
  setTotalSteps: (steps: number) => void;
  setCurrentStep: (step: number) => void;
  setGoToStep: (step: number | null) => void;
  setPlayback: (state: PlaybackState | ((prev: PlaybackState) => PlaybackState)) => void;
  setParams: (state: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) => void;
  setCapabilities: (caps: SandboxCapabilities) => void;
  handlePrev: () => void;
  handleNext: () => void;
  seekToStep: (step: number) => void;
  updateParam: (key: string, value: string) => void;

  // Derived
  activeCheckpoint: ExecutionCheckpoint | undefined;
  highlightedLines: number[];
  jumpToCodeLine: (line: number) => void;
  canGoPrev: boolean;
  canGoNext: boolean;
}

export function useHtmlPreviewSync(
  cir: CirDocument,
  executionMap?: ExecutionMap | null,
): UseHtmlPreviewSyncReturn {
  const [totalSteps, setTotalSteps] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);
  const [goToStep, setGoToStep] = useState<number | null>(null);
  const [capabilities, setCapabilities] = useState<SandboxCapabilities | null>(null);

  const [playback, setPlaybackState] = useState<PlaybackState>({
    autoplay: false,
    paused: true,
    speed: 1,
  });

  const [params, setParamsState] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    if (executionMap?.parameter_controls) {
      executionMap.parameter_controls.forEach((ctrl: ExecutionParameterControl) => {
        initial[ctrl.id] = ctrl.value;
      });
    }
    return initial;
  });

  const setPlayback = useCallback((
    state: PlaybackState | ((prev: PlaybackState) => PlaybackState)
  ) => {
    setPlaybackState((prev) => {
      const next = typeof state === "function" ? state(prev) : state;
      // Clamp speed to valid range
      return {
        ...next,
        speed: Math.max(0.5, Math.min(2, next.speed)),
      };
    });
  }, []);

  const setParams = useCallback((
    state: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)
  ) => {
    setParamsState((prev) => (typeof state === "function" ? state(prev) : state));
  }, []);

  const handlePrev = useCallback(() => {
    if (currentStep > 0) {
      setGoToStep(currentStep - 1);
    }
  }, [currentStep]);

  const handleNext = useCallback(() => {
    if (currentStep < totalSteps - 1) {
      setGoToStep(currentStep + 1);
    }
  }, [currentStep, totalSteps]);

  const seekToStep = useCallback((step: number) => {
    const clamped = Math.max(0, Math.min(totalSteps - 1, step));
    setGoToStep(clamped);
  }, [totalSteps]);

  const updateParam = useCallback((key: string, value: string) => {
    setParamsState((prev) => ({ ...prev, [key]: value }));
  }, []);

  // Derived: active checkpoint
  const activeCheckpoint = useMemo(() => {
    if (!executionMap?.checkpoints?.length) return undefined;
    const currentStepId = cir.steps[currentStep]?.id;
    if (!currentStepId) return undefined;
    return executionMap.checkpoints.find((cp) => cp.step_id === currentStepId);
  }, [executionMap, cir, currentStep]);

  // Derived: highlighted lines for code view
  const highlightedLines = useMemo(() => {
    return activeCheckpoint?.code_lines || [];
  }, [activeCheckpoint]);

  // Action: jump to code line (find corresponding step)
  const jumpToCodeLine = useCallback((line: number) => {
    if (!executionMap?.checkpoints?.length) return;

    // Find checkpoint containing this line
    const checkpoint = executionMap.checkpoints.find((cp) =>
      cp.code_lines.includes(line)
    );
    if (checkpoint) {
      const stepIndex = cir.steps.findIndex((s) => s.id === checkpoint.step_id);
      if (stepIndex !== -1) {
        setGoToStep(stepIndex);
      }
    }
  }, [executionMap, cir]);

  const canGoPrev = currentStep > 0;
  const canGoNext = currentStep < totalSteps - 1;

  return {
    totalSteps,
    currentStep,
    goToStep,
    playback,
    params,
    capabilities,
    setTotalSteps,
    setCurrentStep,
    setGoToStep,
    setPlayback,
    setParams,
    setCapabilities,
    handlePrev,
    handleNext,
    seekToStep,
    updateParam,
    activeCheckpoint,
    highlightedLines,
    jumpToCodeLine,
    canGoPrev,
    canGoNext,
  };
}
