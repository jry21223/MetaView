export type FollowupCameraShot = "wide" | "prompt" | "response";

export interface FollowupAnimationState {
  prompt: string;
  response: string;
  cameraShot: FollowupCameraShot;
  promptVisible: boolean;
  promptTyping: boolean;
  responseVisible: boolean;
  responseTyping: boolean;
  complete: boolean;
}

export interface FollowupDemoText {
  prompt: string;
  response: string;
}

export interface FollowupTiming {
  introDelayMs: number;
  cameraTravelMs: number;
  promptCharacterMs: number;
  promptHoldMs: number;
  responseCharacterMs: number;
  responseHoldMs: number;
}

export const DEFAULT_FOLLOWUP_TIMING: FollowupTiming = {
  introDelayMs: 420,
  cameraTravelMs: 760,
  promptCharacterMs: 44,
  promptHoldMs: 320,
  responseCharacterMs: 32,
  responseHoldMs: 620,
};

export interface FollowupTimeline {
  promptFocusAt: number;
  promptTypingAt: number;
  promptTypedAt: number;
  responseFocusAt: number;
  responseTypingAt: number;
  responseTypedAt: number;
  returnWideAt: number;
  completeAt: number;
}

export function buildFollowupTimeline(
  demo: FollowupDemoText,
  timing: FollowupTiming = DEFAULT_FOLLOWUP_TIMING,
): FollowupTimeline {
  const promptFocusAt = timing.introDelayMs;
  const promptTypingAt = promptFocusAt + timing.cameraTravelMs;
  const promptTypedAt =
    promptTypingAt + demo.prompt.length * timing.promptCharacterMs;
  const responseFocusAt = promptTypedAt + timing.promptHoldMs;
  const responseTypingAt = responseFocusAt + timing.cameraTravelMs;
  const responseTypedAt =
    responseTypingAt + demo.response.length * timing.responseCharacterMs;
  const returnWideAt = responseTypedAt + timing.responseHoldMs;
  const completeAt = returnWideAt + timing.cameraTravelMs;

  return {
    promptFocusAt,
    promptTypingAt,
    promptTypedAt,
    responseFocusAt,
    responseTypingAt,
    responseTypedAt,
    returnWideAt,
    completeAt,
  };
}

export const EMPTY_FOLLOWUP_ANIMATION: FollowupAnimationState = {
  prompt: "",
  response: "",
  cameraShot: "wide",
  promptVisible: false,
  promptTyping: false,
  responseVisible: false,
  responseTyping: false,
  complete: false,
};

export function followupStateAt(
  elapsedMs: number,
  demo: FollowupDemoText,
  timing: FollowupTiming = DEFAULT_FOLLOWUP_TIMING,
): FollowupAnimationState {
  const timeline = buildFollowupTimeline(demo, timing);
  const promptElapsed = Math.max(0, elapsedMs - timeline.promptTypingAt);
  const promptCount = Math.min(
    demo.prompt.length,
    Math.floor(promptElapsed / timing.promptCharacterMs),
  );
  const responseElapsed = Math.max(0, elapsedMs - timeline.responseTypingAt);
  const responseCount = Math.min(
    demo.response.length,
    Math.floor(responseElapsed / timing.responseCharacterMs),
  );
  const cameraShot: FollowupCameraShot =
    elapsedMs >= timeline.returnWideAt
      ? "wide"
      : elapsedMs >= timeline.responseFocusAt
        ? "response"
        : elapsedMs >= timeline.promptFocusAt
          ? "prompt"
          : "wide";

  return {
    prompt: demo.prompt.slice(0, promptCount),
    response: demo.response.slice(0, responseCount),
    cameraShot,
    promptVisible: elapsedMs >= timeline.promptFocusAt,
    promptTyping: elapsedMs >= timeline.promptTypingAt,
    responseVisible: elapsedMs >= timeline.responseFocusAt,
    responseTyping: elapsedMs >= timeline.responseTypingAt,
    complete: elapsedMs >= timeline.completeAt,
  };
}

export function followupCompleteState(
  demo: FollowupDemoText,
): FollowupAnimationState {
  return {
    prompt: demo.prompt,
    response: demo.response,
    cameraShot: "wide",
    promptVisible: true,
    promptTyping: false,
    responseVisible: true,
    responseTyping: false,
    complete: true,
  };
}

export type FollowupAnimationPhase =
  | "focus"
  | "prompt-focus"
  | "prompt"
  | "response-focus"
  | "response"
  | "return"
  | "complete";

export function followupPhase(
  state: FollowupAnimationState,
): FollowupAnimationPhase {
  if (state.complete) return "complete";
  if (state.cameraShot === "wide" && state.responseVisible) return "return";
  if (state.responseTyping) return "response";
  if (state.responseVisible) return "response-focus";
  if (state.promptTyping) return "prompt";
  if (state.promptVisible) return "prompt-focus";
  return "focus";
}
