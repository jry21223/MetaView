import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function resolveInitial(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(QUERY).matches;
}

/** Tracks the user's reduced-motion preference, updating on change. */
export function usePrefersReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(resolveInitial);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia(QUERY);
    const update = () => setPrefersReducedMotion(query.matches);

    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);

  return prefersReducedMotion;
}
