import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useStaticNarration } from "./useStaticNarration";
import { RECORDED_NARRATION } from "../../../../pages/Templates/narration/recordedNarration";

// Exercise the hook against the real generated registry: a drifting recording
// should fail this suite, not surface as silence in front of a class.
const CASE = "predator-prey";
const [FIRST, SECOND] = RECORDED_NARRATION[CASE];

beforeEach(() => {
  window.localStorage.clear();
  vi.spyOn(window.HTMLMediaElement.prototype, "play").mockImplementation(
    async () => undefined,
  );
  vi.spyOn(window.HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useStaticNarration", () => {
  it("ships a recording for every ecology case, and none of them is empty", () => {
    for (const caseId of [
      "logistic-growth",
      "rabbit-chaos",
      "predator-prey",
      "competition-exclusion",
      "island-biogeography",
    ]) {
      const entries = RECORDED_NARRATION[caseId] ?? [];
      expect(entries.length).toBeGreaterThanOrEqual(8);
      expect(entries.every((entry) => entry.text.trim().length > 20)).toBe(true);
      expect(entries.every((entry) => entry.file === `${entry.step_id}.mp3`)).toBe(true);
    }
  });

  it("stays idle for a case with no recording, and never reaches the network", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { result } = renderHook(() => useStaticNarration("derivative-tangent"));
    expect(result.current.available).toBe(false);
    expect(result.current.supported).toBe(false);
    act(() => result.current.playStep("anything", "任何文案"));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(window.HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("plays the line recorded for the step", () => {
    const { result } = renderHook(() => useStaticNarration(CASE));
    expect(result.current.available).toBe(true);
    expect(result.current.enabled).toBe(true);

    act(() => result.current.playStep(FIRST.step_id, FIRST.text));
    expect(result.current.speaking).toBe(true);
    expect(window.HTMLMediaElement.prototype.play).toHaveBeenCalled();
  });

  it("stays silent when a parameter edit has rewritten the step's line", () => {
    const { result } = renderHook(() => useStaticNarration(CASE));
    // The slider moved: the live sentence now quotes numbers the recording
    // knows nothing about.
    act(() => result.current.playStep(SECOND.step_id, `${SECOND.text}（参数已改）`));
    expect(window.HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    expect(result.current.speaking).toBe(false);
  });

  it("lets a line finish when a parameter edit rebuilds the script under it", () => {
    const { result } = renderHook(() => useStaticNarration(CASE));
    act(() => result.current.playStep(FIRST.step_id, FIRST.text));
    expect(window.HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
    const pausesWhileStarting = vi.mocked(window.HTMLMediaElement.prototype.pause).mock
      .calls.length;

    // Every slider tick rebuilds the whole script and re-fires the narration
    // effect. Same step: neither restart the sentence nor cut it off — the
    // drag used to clip the line mid-word and leave the step silent.
    act(() => result.current.playStep(FIRST.step_id, `${FIRST.text}（参数已改）`));
    act(() => result.current.playStep(FIRST.step_id, FIRST.text));
    expect(window.HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
    expect(window.HTMLMediaElement.prototype.pause).toHaveBeenCalledTimes(
      pausesWhileStarting,
    );
    expect(result.current.speaking).toBe(true);
  });

  it("still hands the next step its own line, or silence when that one drifted", () => {
    const { result } = renderHook(() => useStaticNarration(CASE));
    act(() => result.current.playStep(FIRST.step_id, FIRST.text));
    expect(window.HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);

    // Moving on is a real step change: the previous line stops, and this one
    // only speaks if the recording still matches what is on screen.
    act(() => result.current.playStep(SECOND.step_id, `${SECOND.text}（参数已改）`));
    expect(window.HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
    expect(result.current.speaking).toBe(false);

    act(() => result.current.playStep(SECOND.step_id, SECOND.text));
    expect(window.HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2);
  });

  it("mutes on request and remembers the choice", () => {
    const first = renderHook(() => useStaticNarration(CASE));
    act(() => first.result.current.toggle());
    expect(first.result.current.enabled).toBe(false);
    act(() => first.result.current.playStep(FIRST.step_id, FIRST.text));
    expect(window.HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    first.unmount();

    const second = renderHook(() => useStaticNarration(CASE));
    expect(second.result.current.enabled).toBe(false);
  });

  it("does not stall the timeline when autoplay policy rejects the sound", async () => {
    vi.spyOn(window.HTMLMediaElement.prototype, "play").mockRejectedValue(
      new DOMException("blocked", "NotAllowedError"),
    );
    const { result } = renderHook(() => useStaticNarration(CASE));
    act(() => result.current.playStep(FIRST.step_id, FIRST.text));
    await act(async () => {});
    expect(result.current.speaking).toBe(false);
  });
});
