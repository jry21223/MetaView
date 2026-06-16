import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useVisualViewportHeight } from "./useVisualViewportHeight";

function setVisualViewport(value: Partial<VisualViewport> | null) {
  Object.defineProperty(window, "visualViewport", {
    configurable: true,
    value,
  });
}

describe("useVisualViewportHeight", () => {
  afterEach(() => {
    cleanup();
    document.documentElement.style.removeProperty("--mv-vvh");
    setVisualViewport(null);
  });

  it("writes the current visual viewport height to a CSS variable", () => {
    const viewport = new EventTarget() as EventTarget & { height: number };
    viewport.height = 640;
    setVisualViewport(viewport as Partial<VisualViewport>);

    renderHook(() => useVisualViewportHeight());

    expect(document.documentElement.style.getPropertyValue("--mv-vvh")).toBe(
      "640px",
    );
  });

  it("updates the CSS variable when the visual viewport changes", () => {
    const viewport = new EventTarget() as EventTarget & { height: number };
    viewport.height = 640;
    setVisualViewport(viewport as Partial<VisualViewport>);
    renderHook(() => useVisualViewportHeight());

    act(() => {
      viewport.height = 512;
      viewport.dispatchEvent(new Event("resize"));
    });

    expect(document.documentElement.style.getPropertyValue("--mv-vvh")).toBe(
      "512px",
    );
  });

  it("falls back to window.innerHeight when visualViewport is unavailable", () => {
    setVisualViewport(null);
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 720,
    });

    renderHook(() => useVisualViewportHeight());

    expect(document.documentElement.style.getPropertyValue("--mv-vvh")).toBe(
      "720px",
    );
  });
});

