import { useEffect } from "react";

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
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isInputFocused()) return;

      switch (e.key) {
        case " ":
          e.preventDefault();
          handlers.onPlayPause?.();
          break;
        case "ArrowLeft":
          e.preventDefault();
          handlers.onPrev?.();
          break;
        case "ArrowRight":
          e.preventDefault();
          handlers.onNext?.();
          break;
        case "t":
        case "T":
          handlers.onToggleTTS?.();
          break;
      }
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [handlers]);
}
