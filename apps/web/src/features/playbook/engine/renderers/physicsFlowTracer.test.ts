import { describe, expect, it } from "vitest";

import {
  CRUISE_HOLD_FRAMES as hold,
  CRUISE_MAX_PASSES as maxPasses,
  CRUISE_START_FRAMES as start,
  CRUISE_TRAVEL_FRAMES as travel,
  cruiseFraction,
} from "./physicsFlowTracer";

const cycle = travel + hold;

describe("flow tracer cruise clock", () => {
  it("stays hidden until the trajectory has finished drawing", () => {
    expect(cruiseFraction(0)).toBeNull();
    expect(cruiseFraction(start - 1)).toBeNull();
    expect(cruiseFraction(start)).toBe(0);
  });

  it("traverses the path once, then rests at the end", () => {
    expect(cruiseFraction(start + travel / 2)).toBeCloseTo(0.5, 6);
    expect(cruiseFraction(start + travel)).toBe(1);
    expect(cruiseFraction(start + travel + hold - 1)).toBe(1);
  });

  it("replays exactly once for anyone who missed the first pass", () => {
    expect(cruiseFraction(start + cycle)).toBe(0);
    expect(cruiseFraction(start + cycle + travel / 2)).toBeCloseTo(0.5, 6);
  });

  it("parks at the end of the path instead of replaying forever", () => {
    // The shipped defect: a 44-second step sent the same ball round the same
    // arc ten times, and the projectile lesson replayed fifty times end to
    // end — a metronome, not motion.
    for (const seconds of [10, 20, 30, 44, 120]) {
      expect(cruiseFraction(start + seconds * 30)).toBe(1);
    }
    expect(cruiseFraction(start + cycle * maxPasses)).toBe(1);
  });

  it("never leaves the path", () => {
    for (let f = 0; f < start + cycle * (maxPasses + 3); f += 7) {
      const v = cruiseFraction(f);
      if (v === null) continue;
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});
