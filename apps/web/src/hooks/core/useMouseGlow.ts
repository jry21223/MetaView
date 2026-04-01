import { useEffect, useRef } from "react";

/**
 * Tracks mouse position within bento-card elements and updates
 * CSS custom properties (--mouse-x, --mouse-y) so the radial-gradient
 * glow follows the cursor.
 */
export function useMouseGlow() {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    function handleMouseMove(e: MouseEvent) {
      const cards = container!.querySelectorAll<HTMLElement>(".bento-card");
      for (const card of cards) {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        card.style.setProperty("--mouse-x", `${x}px`);
        card.style.setProperty("--mouse-y", `${y}px`);
      }
    }

    container.addEventListener("mousemove", handleMouseMove);
    return () => container.removeEventListener("mousemove", handleMouseMove);
  }, []);

  return containerRef;
}
