import { describe, expect, it } from "vitest";

import {
  BINARY_SEARCH_PREVIEW_CASE,
  BINARY_VALUES,
  binaryTrace,
  buildBinarySearchScript,
  resolveBinaryTarget,
} from "./binarySearchCase";
import { expectDeterministicCase } from "./testing/expectDeterministicCase";

/** Hit, miss inside the array, both ends, and a value past the last element. */
const PARAM_MATRIX = [22, 23, 2, 40, 0].map((target) => ({ target }));

describe("binarySearchCase", () => {
  it("holds the shared preview-case invariants for hits and misses", () => {
    // Known gap: on a hit the result step repeats the last comparison's
    // picture — the interval has already collapsed onto the target.
    expectDeterministicCase(BINARY_SEARCH_PREVIEW_CASE, PARAM_MATRIX, {
      allowedRepeatedSnapshots: 1,
    });
  });

  it("halves the candidate interval on every comparison", () => {
    const trace = binaryTrace(22);
    expect(trace.map((item) => [item.low, item.high, item.mid])).toEqual([
      [0, 9, 4],
      [5, 9, 7],
      [5, 6, 5],
      [6, 6, 6],
    ]);
    expect(trace.at(-1)?.direction).toBe("found");

    const missing = binaryTrace(23);
    expect(missing.every((item) => item.direction !== "found")).toBe(true);
    // A miss still costs at most ⌈log2 n⌉ + 1 comparisons.
    expect(missing.length).toBeLessThanOrEqual(5);
  });

  it("marks everything outside the interval as discarded", () => {
    const script = buildBinarySearchScript({ target: 22 });
    const second = script.steps.find((step) => step.step_id === "binary-compare-2");
    expect(second?.snapshot.kind).toBe("algorithm_bars");
    if (second?.snapshot.kind !== "algorithm_bars") return;
    expect(second.snapshot.sorted_indices).toEqual([0, 1, 2, 3, 4]);
    expect(second.snapshot.pointers).toEqual({ low: 5, high: 9, mid: 7 });
    expect(second.snapshot.ranges?.[0]).toMatchObject({ id: "search-range", start: 5, end: 9 });
  });

  it("rounds the target and keeps the array fixed", () => {
    expect(resolveBinaryTarget({})).toBe(22);
    expect(resolveBinaryTarget({ target: "15" })).toBe(15);
    expect(resolveBinaryTarget({ target: 7.4 })).toBe(7);
    expect(resolveBinaryTarget({ target: "nope" })).toBe(22);
    expect(buildBinarySearchScript({ target: 15 }).initial_data?.array).toEqual(
      BINARY_VALUES.map(String),
    );
  });

  it("exposes a preview case wired to the pure builders", () => {
    expect(BINARY_SEARCH_PREVIEW_CASE.id).toBe("binary-search");
    expect(BINARY_SEARCH_PREVIEW_CASE.controls[0]).toMatchObject({
      id: "target",
      kind: "number",
      min: 0,
      max: 50,
    });
    expect(BINARY_SEARCH_PREVIEW_CASE.buildScript(BINARY_SEARCH_PREVIEW_CASE.defaultParams).algorithm_id)
      .toBe("binary_search");
  });
});
