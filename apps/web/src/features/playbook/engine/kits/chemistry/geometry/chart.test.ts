import { describe, expect, it } from "vitest";

import { stackEndLabels } from "./chart";

describe("line-end label stacking", () => {
  it("keeps labels at their line ends when they are already apart", () => {
    const ys = stackEndLabels([{ id: "a", y: 100 }, { id: "b", y: 160 }], 17, 0, 300);
    expect(Object.fromEntries(ys)).toEqual({ a: 100, b: 160 });
  });

  it("spreads crowded labels downward in line order", () => {
    const ys = stackEndLabels([{ id: "nh3", y: 250 }, { id: "h2", y: 228 }, { id: "n2", y: 243 }], 17, 0, 300);
    expect(Object.fromEntries(ys)).toEqual({ h2: 228, n2: 245, nh3: 262 });
  });

  it("pushes a group back up when it would leave the plot", () => {
    const ys = stackEndLabels([{ id: "a", y: 290 }, { id: "b", y: 292 }], 17, 0, 300);
    expect(Object.fromEntries(ys)).toEqual({ a: 283, b: 300 });
  });
});
