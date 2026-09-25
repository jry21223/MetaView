import { describe, expect, it } from "vitest";

import { boxesOverlapArea, placeLabels, type Obstacle } from "./labelLayout";

const STAGE = { x: 0, y: 0, w: 400, h: 200 };

describe("chemistry label placement", () => {
  it("moves a label off its preferred side when a shape sits there", () => {
    const obstacles: Obstacle[] = [
      { kind: "circle", id: "atom", cx: 200, cy: 100, r: 20 },
      { kind: "rect", id: "wall", box: { x: 150, y: 20, w: 100, h: 50 } },
    ];
    const [label] = placeLabels(
      [{ id: "o18", anchor: { x: 200, y: 100 }, w: 60, h: 20, prefer: "above", clearance: 20 }],
      obstacles,
      STAGE,
    );
    expect(label.overlap).toBe(0);
    expect(label.side).not.toBe("above");
  });

  it("keeps two labels on the same anchor from stacking on each other", () => {
    const placed = placeLabels(
      [
        { id: "a", anchor: { x: 100, y: 100 }, w: 70, h: 20, prefer: "right" },
        { id: "b", anchor: { x: 100, y: 100 }, w: 70, h: 20, prefer: "right" },
      ],
      [],
      STAGE,
    );
    expect(placed.every((label) => label.overlap === 0)).toBe(true);
    expect(boxesOverlapArea(placed[0].box, placed[1].box)).toBe(0);
  });

  it("never leaves the bounds, even when that costs an overlap", () => {
    const [label] = placeLabels(
      [{ id: "edge", anchor: { x: 395, y: 195 }, w: 80, h: 24, prefer: "right" }],
      [],
      STAGE,
    );
    expect(label.box.x).toBeGreaterThanOrEqual(0);
    expect(label.box.x + label.box.w).toBeLessThanOrEqual(400);
    expect(label.box.y + label.box.h).toBeLessThanOrEqual(200);
  });

  it("reports an unavoidable overlap instead of hiding it", () => {
    const [label] = placeLabels(
      [{ id: "crowded", anchor: { x: 200, y: 100 }, w: 60, h: 20 }],
      [{ kind: "rect", id: "everything", box: { x: 0, y: 0, w: 400, h: 200 } }],
      STAGE,
    );
    expect(label.overlap).toBeGreaterThan(0);
  });
});
