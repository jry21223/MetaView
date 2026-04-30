import { useEffect, useLayoutEffect, useRef } from "react";

interface ShortcutHandlers {
  onPlayPause?: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onToggleTTS?: () => void;
}

function isInputFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  return (el as HTMLElement).isContentEditable;
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers): void {
  // Keep a ref so the listener never needs to be re-registered when callbacks change identity.
  const handlersRef = useRef(handlers);
  useLayoutEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
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
        case "t":
        case "T":
          handlersRef.current.onToggleTTS?.();
          break;
      }
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []); // registered once; handlersRef always holds the latest callbacks
}
