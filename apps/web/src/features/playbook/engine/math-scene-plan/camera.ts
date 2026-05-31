import type { MathSceneSnapshot } from "../types";
import { padBounds, type Bounds } from "./bounds";

export interface CameraViewBox {
  x: [number, number];
  y: [number, number];
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function viewBoxFromSnapshot(snapshot: MathSceneSnapshot): CameraViewBox {
  return {
    x: [snapshot.x_min, snapshot.x_max],
    y: [snapshot.y_min, snapshot.y_max],
  };
}

export function viewBoxFromBounds(
  bounds: Bounds,
  fallback: CameraViewBox,
  paddingRatio = 0.1,
): CameraViewBox {
  if (
    !Number.isFinite(bounds.xMin) ||
    !Number.isFinite(bounds.xMax) ||
    !Number.isFinite(bounds.yMin) ||
    !Number.isFinite(bounds.yMax)
  ) {
    return fallback;
  }

  const padded = padBounds(bounds, paddingRatio);
  return {
    x: [padded.xMin, padded.xMax],
    y: [padded.yMin, padded.yMax],
  };
}

export function viewBoxWidth(viewBox: CameraViewBox): number {
  return viewBox.x[1] - viewBox.x[0];
}

export function viewBoxHeight(viewBox: CameraViewBox): number {
  return viewBox.y[1] - viewBox.y[0];
}

export function expandViewBoxToMinSize(
  viewBox: CameraViewBox,
  minWidth: number,
  minHeight: number,
): CameraViewBox {
  const cx = (viewBox.x[0] + viewBox.x[1]) / 2;
  const cy = (viewBox.y[0] + viewBox.y[1]) / 2;
  const width = Math.max(viewBoxWidth(viewBox), minWidth);
  const height = Math.max(viewBoxHeight(viewBox), minHeight);

  return {
    x: [cx - width / 2, cx + width / 2],
    y: [cy - height / 2, cy + height / 2],
  };
}

export function interpolateViewBox(
  from: CameraViewBox,
  to: CameraViewBox,
  progress: number,
): CameraViewBox {
  const p = clamp01(progress);
  const lerp = (a: number, b: number) => a + (b - a) * p;

  return {
    x: [lerp(from.x[0], to.x[0]), lerp(from.x[1], to.x[1])],
    y: [lerp(from.y[0], to.y[0]), lerp(from.y[1], to.y[1])],
  };
}
