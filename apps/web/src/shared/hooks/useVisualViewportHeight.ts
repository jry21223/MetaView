import { useEffect } from "react";

const VIEWPORT_HEIGHT_VAR = "--mv-vvh";

function resolveViewportHeight(): number {
  if (typeof window === "undefined") return 0;
  return Math.round(window.visualViewport?.height ?? window.innerHeight);
}

function writeViewportHeight() {
  if (typeof document === "undefined") return;
  const height = resolveViewportHeight();
  if (height <= 0) return;
  document.documentElement.style.setProperty(VIEWPORT_HEIGHT_VAR, `${height}px`);
}

export function useVisualViewportHeight(): void {
  useEffect(() => {
    writeViewportHeight();

    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", writeViewportHeight);
    viewport?.addEventListener("scroll", writeViewportHeight);
    window.addEventListener("resize", writeViewportHeight);

    return () => {
      viewport?.removeEventListener("resize", writeViewportHeight);
      viewport?.removeEventListener("scroll", writeViewportHeight);
      window.removeEventListener("resize", writeViewportHeight);
    };
  }, []);
}

