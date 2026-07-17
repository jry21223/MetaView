import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PipelineSkeleton } from "./PipelineSkeleton";
import { PIPELINE_STAGE_HINTS } from "./pipelineStageHints";

function mockMatchMedia(matches: (query: string) => boolean) {
  vi.spyOn(window, "matchMedia").mockImplementation((query: string) => ({
    matches: matches(query),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

describe("PipelineSkeleton", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("marks earlier stages done and the current stage active", () => {
    const { container } = render(<PipelineSkeleton status="reviewing" />);

    const stages = Array.from(container.querySelectorAll(".mv-stage"));
    expect(stages).toHaveLength(4);
    expect(stages[0].className).toContain("is-done");
    expect(stages[1].className).toContain("is-done");
    expect(stages[2].className).toContain("is-active");
    expect(stages[3].className).not.toContain("is-active");
    expect(stages[3].className).not.toContain("is-done");
  });

  it("keeps the polite live region for the loader label", () => {
    const { getByRole } = render(<PipelineSkeleton status="running" />);

    const statusNode = getByRole("status");
    expect(statusNode.getAttribute("aria-live")).toBe("polite");
    expect(statusNode.textContent).toContain("正在生成脚本");
  });

  it("shows elapsed time derived from createdAt and keeps ticking", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-02T00:00:05.000Z"));

    const { getByText } = render(
      <PipelineSkeleton
        status="running"
        createdAt="2026-06-02T00:00:00.000Z"
      />,
    );

    expect(getByText(/已用时 0:05/)).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(getByText(/已用时 1:05/)).toBeTruthy();
  });

  it("rotates stage hints over time", () => {
    vi.useFakeTimers();
    const hints = PIPELINE_STAGE_HINTS.running;
    const { getByText } = render(<PipelineSkeleton status="running" />);

    expect(getByText(hints[0])).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(4_000);
    });
    expect(getByText(hints[1 % hints.length])).toBeTruthy();
  });

  it("pins the first hint when the user prefers reduced motion", () => {
    mockMatchMedia((query) => query.includes("prefers-reduced-motion"));
    vi.useFakeTimers();
    const hints = PIPELINE_STAGE_HINTS.running;
    const { getByText, queryByText } = render(
      <PipelineSkeleton status="running" />,
    );

    act(() => {
      vi.advanceTimersByTime(12_000);
    });
    expect(getByText(hints[0])).toBeTruthy();
    if (hints.length > 1) {
      expect(queryByText(hints[1])).toBeNull();
    }
  });

  it("renders segmented connector fills between stages", () => {
    const { container } = render(<PipelineSkeleton status="running" />);

    const lines = Array.from(container.querySelectorAll(".mv-stage-line"));
    expect(lines).toHaveLength(3);
    expect(lines[0].className).toContain("is-done");
    expect(lines[1].className).toContain("is-active");
    expect(lines[2].className).not.toContain("is-done");
  });
});
