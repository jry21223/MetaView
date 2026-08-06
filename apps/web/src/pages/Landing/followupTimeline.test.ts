import { describe, expect, it } from "vitest";

import {
  DEFAULT_FOLLOWUP_TIMING,
  EMPTY_FOLLOWUP_ANIMATION,
  buildFollowupTimeline,
  followupCompleteState,
  followupPhase,
  followupStateAt,
} from "./followupTimeline";

const demo = { prompt: "为什么目标值大于 24？", response: "因为左半区间都不超过 24。" };

describe("followupTimeline", () => {
  it("builds a monotonic timeline from the demo text lengths", () => {
    const timeline = buildFollowupTimeline(demo);
    const { promptFocusAt, promptTypingAt, promptTypedAt, responseFocusAt, responseTypingAt, responseTypedAt, returnWideAt, completeAt } =
      timeline;

    expect(promptFocusAt).toBe(DEFAULT_FOLLOWUP_TIMING.introDelayMs);
    expect(promptTypingAt).toBeGreaterThan(promptFocusAt);
    expect(promptTypedAt).toBeGreaterThan(promptTypingAt);
    expect(responseFocusAt).toBeGreaterThan(promptTypedAt);
    expect(responseTypingAt).toBeGreaterThan(responseFocusAt);
    expect(responseTypedAt).toBeGreaterThan(responseTypingAt);
    expect(returnWideAt).toBeGreaterThan(responseTypedAt);
    expect(completeAt).toBeGreaterThan(returnWideAt);
  });

  it("returns the empty animation state at t=0", () => {
    expect(followupStateAt(0, demo)).toEqual(EMPTY_FOLLOWUP_ANIMATION);
  });

  it("types the prompt character by character once typing starts", () => {
    const timeline = buildFollowupTimeline(demo);

    expect(followupStateAt(timeline.promptTypingAt, demo).prompt).toBe("");
    expect(
      followupStateAt(
        timeline.promptTypingAt + DEFAULT_FOLLOWUP_TIMING.promptCharacterMs * 3,
        demo,
      ).prompt,
    ).toBe(demo.prompt.slice(0, 3));
  });

  it("shows the prompt visible before typing begins", () => {
    const timeline = buildFollowupTimeline(demo);
    const state = followupStateAt(timeline.promptFocusAt, demo);

    expect(state.promptVisible).toBe(true);
    expect(state.promptTyping).toBe(false);
    expect(state.cameraShot).toBe("prompt");
  });

  it("moves the camera to the response shot during response focus", () => {
    const timeline = buildFollowupTimeline(demo);
    const state = followupStateAt(timeline.responseFocusAt, demo);

    expect(state.responseVisible).toBe(true);
    expect(state.cameraShot).toBe("response");
  });

  it("returns to the wide shot after the response hold", () => {
    const timeline = buildFollowupTimeline(demo);
    expect(followupStateAt(timeline.returnWideAt, demo).cameraShot).toBe("wide");
  });

  it("completes exactly at completeAt with full text", () => {
    const timeline = buildFollowupTimeline(demo);
    const state = followupStateAt(timeline.completeAt, demo);

    expect(state.complete).toBe(true);
    expect(state.prompt).toBe(demo.prompt);
    expect(state.response).toBe(demo.response);
    expect(state.cameraShot).toBe("wide");
  });

  it("stays complete and full after the timeline end", () => {
    const timeline = buildFollowupTimeline(demo);
    const state = followupStateAt(timeline.completeAt + 1000, demo);

    expect(state.complete).toBe(true);
    expect(state.prompt).toBe(demo.prompt);
    expect(state.response).toBe(demo.response);
  });

  it("produces the complete state directly for skipped motion", () => {
    expect(followupCompleteState(demo)).toEqual({
      prompt: demo.prompt,
      response: demo.response,
      cameraShot: "wide",
      promptVisible: true,
      promptTyping: false,
      responseVisible: true,
      responseTyping: false,
      complete: true,
    });
  });

  it("maps animation states to phases", () => {
    expect(followupPhase(EMPTY_FOLLOWUP_ANIMATION)).toBe("focus");
    expect(
      followupPhase({ ...EMPTY_FOLLOWUP_ANIMATION, promptVisible: true }),
    ).toBe("prompt-focus");
    expect(
      followupPhase({
        ...EMPTY_FOLLOWUP_ANIMATION,
        promptVisible: true,
        promptTyping: true,
      }),
    ).toBe("prompt");
    expect(
      followupPhase({
        ...EMPTY_FOLLOWUP_ANIMATION,
        promptVisible: true,
        promptTyping: true,
        responseVisible: true,
        cameraShot: "response",
      }),
    ).toBe("response-focus");
    expect(
      followupPhase({
        ...EMPTY_FOLLOWUP_ANIMATION,
        promptVisible: true,
        promptTyping: true,
        responseVisible: true,
        responseTyping: true,
        cameraShot: "response",
      }),
    ).toBe("response");
    expect(
      followupPhase({
        ...EMPTY_FOLLOWUP_ANIMATION,
        promptVisible: true,
        promptTyping: true,
        responseVisible: true,
        responseTyping: true,
        cameraShot: "wide",
      }),
    ).toBe("return");
    expect(
      followupPhase({
        ...EMPTY_FOLLOWUP_ANIMATION,
        complete: true,
      }),
    ).toBe("complete");
  });
});
