import { describe, expect, it } from "vitest";

import { buildPrevIndexMap } from "./prevIndexMap";

/**
 * The copy that used to live inside `AlgorithmRenderer.tsx`, transcribed
 * verbatim. `AlgorithmRenderer` and `BarBlockRenderer` each animated cell
 * migration from their own implementation; this test is the evidence that
 * deleting the private one changed nothing, and it keeps the shared module
 * pinned to that behaviour.
 */
function legacyBuildPrevIndexMap(
  current: readonly string[],
  prev: readonly string[] | null,
): number[] {
  if (!prev) return current.map(() => -1);
  const used = new Array(prev.length).fill(false) as boolean[];
  const result: number[] = [];
  // First pass: prefer matching same index when value unchanged (stable).
  for (let i = 0; i < current.length; i++) {
    if (i < prev.length && !used[i] && prev[i] === current[i]) {
      result.push(i);
      used[i] = true;
    } else {
      result.push(-2); // sentinel: needs second-pass match
    }
  }
  // Second pass: greedy nearest unused match by value.
  for (let i = 0; i < current.length; i++) {
    if (result[i] !== -2) continue;
    let best = -1;
    let bestDist = Infinity;
    for (let j = 0; j < prev.length; j++) {
      if (used[j]) continue;
      if (prev[j] !== current[i]) continue;
      const d = Math.abs(j - i);
      if (d < bestDist) {
        bestDist = d;
        best = j;
      }
    }
    if (best >= 0) {
      result[i] = best;
      used[best] = true;
    } else {
      result[i] = -1; // truly new
    }
  }
  return result;
}

/** Deterministic pseudo-random sequence, so a failure is reproducible. */
function makeRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

describe("buildPrevIndexMap", () => {
  it("keeps unchanged cells at their own index", () => {
    expect(buildPrevIndexMap(["5", "3", "8"], ["5", "3", "8"])).toEqual([0, 1, 2]);
  });

  it("follows a swap so the cells can animate past each other", () => {
    expect(buildPrevIndexMap(["3", "5", "8"], ["5", "3", "8"])).toEqual([1, 0, 2]);
  });

  it("marks values with no remaining match as new", () => {
    expect(buildPrevIndexMap(["1", "2"], ["3", "4"])).toEqual([-1, -1]);
    expect(buildPrevIndexMap(["1", "1"], ["1"])).toEqual([0, -1]);
  });

  it("treats the first step as all-new", () => {
    expect(buildPrevIndexMap(["1", "2", "3"], null)).toEqual([-1, -1, -1]);
    expect(buildPrevIndexMap([], null)).toEqual([]);
  });

  it("picks the nearest unused duplicate", () => {
    // Two 7s move; each cell takes the closest 7 that is still free.
    expect(buildPrevIndexMap(["7", "1", "7"], ["7", "7", "1"])).toEqual([0, 2, 1]);
  });

  it("matches the implementation the renderer used to carry privately", () => {
    const random = makeRandom(20260915);
    const alphabet = ["1", "2", "3", "4", "5", "(", ")", "-1"];
    for (let round = 0; round < 500; round += 1) {
      const prevLength = Math.floor(random() * 9);
      const currentLength = Math.floor(random() * 9);
      const pick = () => alphabet[Math.floor(random() * alphabet.length)]!;
      const prev = round % 7 === 0
        ? null
        : Array.from({ length: prevLength }, pick);
      const current = Array.from({ length: currentLength }, pick);
      expect(
        buildPrevIndexMap(current, prev),
        `round ${round}: current=${JSON.stringify(current)} prev=${JSON.stringify(prev)}`,
      ).toEqual(legacyBuildPrevIndexMap(current, prev));
    }
  });
});
