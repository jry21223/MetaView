export const MATH_PLOT_SVG_WIDTH = 1000;
export const MATH_PLOT_SVG_HEIGHT = 560;
export const MATH_PLOT_MARGIN = { top: 20, right: 28, bottom: 40, left: 56 } as const;
export const MATH_PLOT_WIDTH =
  MATH_PLOT_SVG_WIDTH - MATH_PLOT_MARGIN.left - MATH_PLOT_MARGIN.right;

export function pointerDomainX(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
  xMin: number,
  xMax: number,
): number {
  let virtualX: number | null = null;
  try {
    const matrix = svg.getScreenCTM?.();
    if (matrix && typeof svg.createSVGPoint === "function") {
      const point = svg.createSVGPoint();
      point.x = clientX;
      point.y = clientY;
      const transformedX = point.matrixTransform(matrix.inverse()).x;
      if (Number.isFinite(transformedX)) virtualX = transformedX;
    }
  } catch {
    // Detached SVGs and browser zoom transitions can make the matrix non-invertible.
    // Fall through to the preserveAspectRatio-aware bounding-box conversion.
  }
  if (virtualX == null) {
    const rect = svg.getBoundingClientRect();
    const scale = Math.min(
      rect.width / MATH_PLOT_SVG_WIDTH,
      rect.height / MATH_PLOT_SVG_HEIGHT,
    );
    if (Number.isFinite(scale) && scale > 0) {
      const renderedWidth = MATH_PLOT_SVG_WIDTH * scale;
      const offsetX = (rect.width - renderedWidth) / 2;
      virtualX = (clientX - rect.left - offsetX) / scale;
    }
  }
  const plotX = Math.max(
    MATH_PLOT_MARGIN.left,
    Math.min(
      MATH_PLOT_MARGIN.left + MATH_PLOT_WIDTH,
      virtualX ?? MATH_PLOT_MARGIN.left,
    ),
  );
  return xMin +
    ((plotX - MATH_PLOT_MARGIN.left) / MATH_PLOT_WIDTH) * (xMax - xMin);
}
