import { describe, expect, it } from "vitest";

import { PHYSICS_VISUAL_PALETTE, physicsVisualColor } from "./physicsVisualPalette";

describe("physicsVisualPalette", () => {
  it("keeps the light physics semantics stable", () => {
    expect(PHYSICS_VISUAL_PALETTE.light).toEqual({
      trajectory: "#2f3431",
      velocity: "#356b5c",
      acceleration: "#8a5a00",
      force: "#2f3431",
    });
  });

  it("publishes subject-local CSS variables with deterministic fallbacks", () => {
    expect(physicsVisualColor("trajectory", "light")).toBe(
      "var(--physics-trajectory, #2f3431)",
    );
    expect(physicsVisualColor("velocity", "dark")).toBe(
      "var(--physics-velocity, #8fc5b1)",
    );
  });
});
