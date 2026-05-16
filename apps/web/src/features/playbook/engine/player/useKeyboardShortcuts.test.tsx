import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, cleanup } from "@testing-library/react";
import React from "react";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";

function Harness(props: Parameters<typeof useKeyboardShortcuts>[0]): React.ReactElement {
  useKeyboardShortcuts(props);
  return <input data-testid="focus-target" />;
}

function press(key: string, target: EventTarget | null = document) {
  act(() => {
    const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
    (target ?? document).dispatchEvent(event);
  });
}

describe("useKeyboardShortcuts", () => {
  afterEach(() => {
    cleanup();
  });

  it("fires onPlayPause on space", () => {
    const onPlayPause = vi.fn();
    render(<Harness onPlayPause={onPlayPause} />);
    press(" ");
    expect(onPlayPause).toHaveBeenCalledTimes(1);
  });

  it("fires onPrev / onNext on arrow keys", () => {
    const onPrev = vi.fn();
    const onNext = vi.fn();
    render(<Harness onPrev={onPrev} onNext={onNext} />);
    press("ArrowLeft");
    press("ArrowRight");
    expect(onPrev).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("supports speed up / down via +/-", () => {
    const onSpeedUp = vi.fn();
    const onSpeedDown = vi.fn();
    render(<Harness onSpeedUp={onSpeedUp} onSpeedDown={onSpeedDown} />);
    press("+");
    press("-");
    expect(onSpeedUp).toHaveBeenCalledTimes(1);
    expect(onSpeedDown).toHaveBeenCalledTimes(1);
  });

  it("treats '=' as alias of '+' for speed up", () => {
    const onSpeedUp = vi.fn();
    render(<Harness onSpeedUp={onSpeedUp} />);
    press("=");
    expect(onSpeedUp).toHaveBeenCalledTimes(1);
  });

  it("invokes onEscape even when focus is in an input", () => {
    const onEscape = vi.fn();
    const onPlayPause = vi.fn();
    const { getByTestId } = render(
      <Harness onEscape={onEscape} onPlayPause={onPlayPause} />,
    );
    const input = getByTestId("focus-target");
    input.focus();
    press("Escape", input);
    press(" ", input);
    expect(onEscape).toHaveBeenCalledTimes(1);
    expect(onPlayPause).not.toHaveBeenCalled(); // suppressed while input focused
  });

  it("toggles TTS / subtitles via t / s", () => {
    const onToggleTTS = vi.fn();
    const onToggleSubtitles = vi.fn();
    render(
      <Harness onToggleTTS={onToggleTTS} onToggleSubtitles={onToggleSubtitles} />,
    );
    press("t");
    press("s");
    expect(onToggleTTS).toHaveBeenCalledTimes(1);
    expect(onToggleSubtitles).toHaveBeenCalledTimes(1);
  });

  it("opens export via e", () => {
    const onOpenExport = vi.fn();
    render(<Harness onOpenExport={onOpenExport} />);
    press("e");
    expect(onOpenExport).toHaveBeenCalledTimes(1);
  });

  it("uses latest handler when component re-renders with new callbacks", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<Harness onPlayPause={first} />);
    press(" ");
    rerender(<Harness onPlayPause={second} />);
    press(" ");
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });
});
