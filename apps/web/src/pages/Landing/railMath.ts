export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Offset percent of the story track for a given position (0-based panel index). */
export function railOffsetPercent(position: number, panelCount: number): number {
  return (-position * 100) / panelCount;
}

/** Panel index for a raw position, clamped to the valid range. */
export function railPanelIndex(position: number, panelCount: number): number {
  return Math.min(panelCount - 1, Math.max(0, Math.round(position)));
}

/** Position (0-based panel index) for a scroll progress in [0, 1]. */
export function railTargetPosition(progress: number, panelCount: number): number {
  return clamp01(progress) * (panelCount - 1);
}

/** Scroll progress in [0, 1] between the section top and the end of travel. */
export function railProgressFromScroll(
  scrollY: number,
  sectionTop: number,
  travel: number,
): number {
  return clamp01((scrollY - sectionTop) / travel);
}
