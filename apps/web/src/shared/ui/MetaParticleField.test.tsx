import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { MetaParticleField, MetaParticleFieldVariant } from "./MetaParticleField";

const variants: MetaParticleFieldVariant[] = ["canvas", "singularity", "orbit", "comet"];

describe("MetaParticleField", () => {
  afterEach(() => {
    cleanup();
  });

  it.each(variants)("renders the %s variant with stable markers", (variant) => {
    const { container, getByTestId } = render(<MetaParticleField variant={variant} />);
    const root = getByTestId("meta-particle-field");

    expect(root.getAttribute("data-variant")).toBe(variant);
    expect(root.getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelector(".mv-meta-particle__core")).toBeTruthy();
  });

  it("renders the singularity as an abstract gravity field with restrained particles", () => {
    const { container, queryByText } = render(<MetaParticleField variant="singularity" />);

    expect(container.querySelector(".mv-meta-particle__singularity-core")).toBeTruthy();
    expect(container.querySelector(".mv-meta-particle__event-horizon")).toBeTruthy();
    expect(container.querySelector(".mv-meta-particle__lens-grid")).toBeTruthy();
    expect(container.querySelectorAll(".mv-meta-particle__gravity-contour").length).toBe(3);
    expect(container.querySelectorAll(".mv-meta-particle__particle")).toHaveLength(6);
    expect(container.querySelector("[filter]")).toBeNull();
    expect(queryByText(/meta/i)).toBeNull();
    expect(queryByText("M")).toBeNull();
  });

  it("renders the canvas variant as a restrained distant knowledge graph", () => {
    const { container } = render(<MetaParticleField variant="canvas" />);

    expect(container.querySelector(".mv-meta-particle__canvas-grid")).toBeTruthy();
    expect(container.querySelectorAll(".mv-meta-particle__canvas-node").length).toBeLessThanOrEqual(12);
    expect(container.querySelectorAll(".mv-meta-particle__canvas-link").length).toBeLessThanOrEqual(8);
    expect(container.querySelectorAll(".mv-meta-particle__canvas-path")).toHaveLength(2);
    expect(container.querySelectorAll(".mv-meta-particle__particle")).toHaveLength(2);
  });

  it("keeps orbit and comet variants available as low-key motion variants", () => {
    for (const variant of ["orbit", "comet"] as const) {
      const { container, unmount } = render(<MetaParticleField variant={variant} />);

      expect(container.querySelectorAll(".mv-meta-particle__particle").length).toBeGreaterThan(0);
      expect(container.querySelector("[filter]")).toBeNull();
      unmount();
    }
  });
});
