import type {
  MathSceneAnnotation,
  MathScenePoint,
  MathSceneRegion,
  MathSceneSegment,
  MathSceneSnapshot,
} from "../types";
import type { PlannedObject } from "./plan";

export interface Bounds {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export function emptyBounds(): Bounds | null {
  return null;
}

function isFiniteBounds(bounds: Bounds): boolean {
  return (
    Number.isFinite(bounds.xMin) &&
    Number.isFinite(bounds.xMax) &&
    Number.isFinite(bounds.yMin) &&
    Number.isFinite(bounds.yMax)
  );
}

function normalizeBounds(bounds: Bounds): Bounds | null {
  if (!isFiniteBounds(bounds)) return null;
  return {
    xMin: Math.min(bounds.xMin, bounds.xMax),
    xMax: Math.max(bounds.xMin, bounds.xMax),
    yMin: Math.min(bounds.yMin, bounds.yMax),
    yMax: Math.max(bounds.yMin, bounds.yMax),
  };
}

function snapshotBounds(snapshot: MathSceneSnapshot): Bounds {
  return {
    xMin: Math.min(snapshot.x_min, snapshot.x_max),
    xMax: Math.max(snapshot.x_min, snapshot.x_max),
    yMin: Math.min(snapshot.y_min, snapshot.y_max),
    yMax: Math.max(snapshot.y_min, snapshot.y_max),
  };
}

export function boundsOfPoint(point: MathScenePoint): Bounds {
  return {
    xMin: point.x,
    xMax: point.x,
    yMin: point.y,
    yMax: point.y,
  };
}

export function boundsOfSegment(segment: MathSceneSegment): Bounds {
  return {
    xMin: Math.min(segment.x0, segment.x1),
    xMax: Math.max(segment.x0, segment.x1),
    yMin: Math.min(segment.y0, segment.y1),
    yMax: Math.max(segment.y0, segment.y1),
  };
}

export function boundsOfRegion(region: MathSceneRegion): Bounds | null {
  if (region.vertices.length === 0) return null;

  let result: Bounds | null = null;
  for (const [x, y] of region.vertices) {
    result = mergeBounds(result, { xMin: x, xMax: x, yMin: y, yMax: y });
  }
  return result;
}

export function boundsOfAnnotation(annotation: MathSceneAnnotation): Bounds {
  return {
    xMin: annotation.x,
    xMax: annotation.x,
    yMin: annotation.y,
    yMax: annotation.y,
  };
}

export function mergeBounds(a: Bounds | null, b: Bounds | null): Bounds | null {
  const left = a ? normalizeBounds(a) : null;
  const right = b ? normalizeBounds(b) : null;
  if (!left) return right;
  if (!right) return left;

  return {
    xMin: Math.min(left.xMin, right.xMin),
    xMax: Math.max(left.xMax, right.xMax),
    yMin: Math.min(left.yMin, right.yMin),
    yMax: Math.max(left.yMax, right.yMax),
  };
}

export function boundsOfScene(snapshot: MathSceneSnapshot): Bounds | null {
  let result = emptyBounds();

  for (const point of snapshot.points ?? []) {
    result = mergeBounds(result, boundsOfPoint(point));
  }
  for (const segment of snapshot.segments ?? []) {
    result = mergeBounds(result, boundsOfSegment(segment));
  }
  for (const region of snapshot.regions ?? []) {
    result = mergeBounds(result, boundsOfRegion(region));
  }
  for (const annotation of snapshot.annotations ?? []) {
    result = mergeBounds(result, boundsOfAnnotation(annotation));
  }

  const hasCurve = (snapshot.curves?.length ?? 0) > 0;
  const hasVectorField = snapshot.vector_field != null;
  if (!result || hasCurve || hasVectorField) {
    result = mergeBounds(result, snapshotBounds(snapshot));
  }

  return result;
}

export function padBounds(bounds: Bounds, paddingRatio: number): Bounds {
  const normalized = normalizeBounds(bounds) ?? {
    xMin: 0,
    xMax: 0,
    yMin: 0,
    yMax: 0,
  };
  const ratio = Math.max(0, Number.isFinite(paddingRatio) ? paddingRatio : 0);
  const xSpan = Math.max(normalized.xMax - normalized.xMin, 1);
  const ySpan = Math.max(normalized.yMax - normalized.yMin, 1);
  const xPad = xSpan * ratio;
  const yPad = ySpan * ratio;

  return {
    xMin: normalized.xMin - xPad,
    xMax: normalized.xMax + xPad,
    yMin: normalized.yMin - yPad,
    yMax: normalized.yMax + yPad,
  };
}

export function boundsOfPlannedObjects(args: {
  points?: PlannedObject<MathScenePoint>[];
  segments?: PlannedObject<MathSceneSegment>[];
  regions?: PlannedObject<MathSceneRegion>[];
  annotations?: PlannedObject<MathSceneAnnotation>[];
  onlyAdded?: boolean;
}): Bounds | null {
  const { points = [], segments = [], regions = [], annotations = [], onlyAdded = false } = args;
  const include = <T>(object: PlannedObject<T>): boolean => !onlyAdded || object.added;
  let result = emptyBounds();

  for (const point of points) {
    if (include(point)) result = mergeBounds(result, boundsOfPoint(point.object));
  }
  for (const segment of segments) {
    if (include(segment)) result = mergeBounds(result, boundsOfSegment(segment.object));
  }
  for (const region of regions) {
    if (include(region)) result = mergeBounds(result, boundsOfRegion(region.object));
  }
  for (const annotation of annotations) {
    if (include(annotation)) {
      result = mergeBounds(result, boundsOfAnnotation(annotation.object));
    }
  }

  return result;
}
