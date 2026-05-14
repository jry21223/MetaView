import { describe, expect, it } from "vitest";
import { normaliseTiming, useTimeline } from "./useTimeline";

describe("useTimeline", () => {
  it("default timing covers the whole step", () => {
    const slice = useTimeline(undefined, 0.5);
    expect(slice.visible).toBe(true);
    expect(slice.progress).toBeCloseTo(0.5, 5);
  });

  it("layer outside its window is invisible", () => {
    const slice = useTimeline({ enter_at: 0.3, exit_at: 0.6 }, 0.1);
    expect(slice.visible).toBe(false);
  });

  it("normalises progress within the layer window", () => {
    const slice = useTimeline({ enter_at: 0.2, exit_at: 0.6 }, 0.4);
    expect(slice.visible).toBe(true);
    expect(slice.progress).toBeCloseTo(0.5, 5);
  });

  it("flags entering/exiting at window extremes", () => {
    const inEnter = useTimeline({ enter_at: 0, exit_at: 1 }, 0.05);
    const inMid = useTimeline({ enter_at: 0, exit_at: 1 }, 0.5);
    const inExit = useTimeline({ enter_at: 0, exit_at: 1 }, 0.95);
    expect(inEnter.entering).toBe(true);
    expect(inMid.entering).toBe(false);
    expect(inMid.exiting).toBe(false);
    expect(inExit.exiting).toBe(true);
  });

  it("swaps inverted enter/exit bounds via normaliseTiming", () => {
    const t = normaliseTiming({ enter_at: 0.8, exit_at: 0.2 });
    expect(t.enter_at).toBe(0.2);
    expect(t.exit_at).toBe(0.8);
  });

  it("treats out-of-range bounds defensively", () => {
    const t = normaliseTiming({ enter_at: -1, exit_at: 5 });
    expect(t.enter_at).toBe(0);
    expect(t.exit_at).toBe(1);
  });

  it("zero-width window degrades to a tiny visible region", () => {
    const t = normaliseTiming({ enter_at: 0.5, exit_at: 0.5 });
    expect(t.exit_at).toBeGreaterThan(t.enter_at);
  });

  it("clamps stepProgress beyond [0,1]", () => {
    const past = useTimeline({ enter_at: 0, exit_at: 1 }, 2);
    expect(past.progress).toBe(1);
    const before = useTimeline({ enter_at: 0, exit_at: 1 }, -1);
    expect(before.progress).toBe(0);
  });
});
