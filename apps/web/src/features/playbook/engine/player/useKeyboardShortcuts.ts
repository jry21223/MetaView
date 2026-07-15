import { useEffect, useLayoutEffect, useRef } from "react";

interface ShortcutHandlers {
  onPlayPause?: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onReset?: () => void;
  onToggleTTS?: () => void;
  onToggleSubtitles?: () => void;
  onSpeedUp?: () => void;
  onSpeedDown?: () => void;
  onOpenExport?: () => void;
  onEscape?: () => void;
}

function isInputFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if ((el as HTMLElement).isContentEditable) return true;
  return el instanceof Element && el.closest('[role="slider"], [contenteditable="true"]') != null;
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers): void {
  // Keep a ref so the listener never needs to be re-registered when callbacks change identity.
  const handlersRef = useRef(handlers);
  useLayoutEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Escape is always handled regardless of input focus
      if (e.key === "Escape") {
        handlersRef.current.onEscape?.();
        return;
      }

      if (isInputFocused()) return;

      switch (e.key) {
        case " ":
          e.preventDefault();
          handlersRef.current.onPlayPause?.();
          break;
        case "ArrowLeft":
          e.preventDefault();
          handlersRef.current.onPrev?.();
          break;
        case "ArrowRight":
          e.preventDefault();
          handlersRef.current.onNext?.();
          break;
        case "r":
        case "R":
          handlersRef.current.onReset?.();
          break;
        case "t":
        case "T":
          handlersRef.current.onToggleTTS?.();
          break;
        case "s":
        case "S":
          handlersRef.current.onToggleSubtitles?.();
          break;
        case "+":
        case "=": // = is the unshifted + on most keyboards
          e.preventDefault();
          handlersRef.current.onSpeedUp?.();
          break;
        case "-":
          e.preventDefault();
          handlersRef.current.onSpeedDown?.();
          break;
        case "e":
        case "E":
          handlersRef.current.onOpenExport?.();
          break;
      }
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []); // registered once; handlersRef always holds the latest callbacks
}
