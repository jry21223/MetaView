export function shouldCollapseWorkbenchTopbarByDefault(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) {
    return true;
  }
  return !window.matchMedia("(max-width: 680px)").matches;
}
