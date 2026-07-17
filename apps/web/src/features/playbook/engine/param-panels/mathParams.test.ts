import { describe, expect, it } from "vitest";

import { hasEditableMathParams, resolveEditableMathControls } from "./mathParams";

describe("math parameter controls", () => {
  it("rejects empty and whitespace-only numeric values", () => {
    const controls = [
      { id: "a", label: "a", value: "" },
      { id: "b", label: "b", value: "   " },
    ];

    expect(resolveEditableMathControls(controls)).toEqual([]);
    expect(hasEditableMathParams(controls)).toBe(false);
  });

  it("keeps finite numeric values, including explicit zero", () => {
    const controls = [{ id: "a", label: "a", value: "0" }];

    expect(resolveEditableMathControls(controls)).toEqual([
      { control: controls[0], initial: 0 },
    ]);
    expect(hasEditableMathParams(controls)).toBe(true);
  });
});
