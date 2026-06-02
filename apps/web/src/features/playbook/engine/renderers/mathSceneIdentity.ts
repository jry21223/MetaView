import type {
  MathSceneAnnotation,
  MathSceneCurve,
  MathScenePoint,
  MathSceneRegion,
  MathSceneSegment,
  MathSceneSnapshot,
  MetaStep,
} from "../types";

function n(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "";
  return Number(value).toFixed(3);
}

export function mathScenePointKey(p: MathScenePoint): string {
  return ["point", p.label ?? "", n(p.x), n(p.y)].join(":");
}

export function mathSceneSegmentKey(s: MathSceneSegment): string {
  return [
    "segment",
    s.label ?? "",
    n(s.x0),
    n(s.y0),
    n(s.x1),
    n(s.y1),
    s.arrow ? "arrow" : "line",
  ].join(":");
}

export function mathSceneRegionKey(r: MathSceneRegion): string {
  return [
    "region",
    r.label ?? "",
    (r.vertices ?? []).map(([x, y]) => `${n(x)},${n(y)}`).join("|"),
  ].join(":");
}

export function mathSceneCurveKey(c: MathSceneCurve): string {
  return [
    "curve",
    c.label ?? "",
    c.expression_x ?? "",
    c.expression_y ?? "",
    n(c.t_min),
    n(c.t_max),
  ].join(":");
}

export function mathSceneAnnotationKey(a: MathSceneAnnotation): string {
  return ["annotation", a.text ?? "", n(a.x), n(a.y), a.align ?? ""].join(":");
}

export interface MathSceneIdentitySets {
  points: Set<string>;
  segments: Set<string>;
  regions: Set<string>;
  curves: Set<string>;
  annotations: Set<string>;
}

export function emptyMathSceneIdentitySets(): MathSceneIdentitySets {
  return {
    points: new Set(),
    segments: new Set(),
    regions: new Set(),
    curves: new Set(),
    annotations: new Set(),
  };
}

export function collectMathSceneIdentitySets(
  snapshot: MathSceneSnapshot | null | undefined,
): MathSceneIdentitySets {
  const sets = emptyMathSceneIdentitySets();
  if (!snapshot) return sets;

  for (const point of snapshot.points ?? []) {
    sets.points.add(mathScenePointKey(point));
  }
  for (const segment of snapshot.segments ?? []) {
    sets.segments.add(mathSceneSegmentKey(segment));
  }
  for (const region of snapshot.regions ?? []) {
    sets.regions.add(mathSceneRegionKey(region));
  }
  for (const curve of snapshot.curves ?? []) {
    sets.curves.add(mathSceneCurveKey(curve));
  }
  for (const annotation of snapshot.annotations ?? []) {
    sets.annotations.add(mathSceneAnnotationKey(annotation));
  }
  return sets;
}

export function previousMathSceneIdentitySets(
  prevStep: MetaStep | null | undefined,
): MathSceneIdentitySets {
  if (!prevStep || prevStep.snapshot.kind !== "math_scene") {
    return emptyMathSceneIdentitySets();
  }
  return collectMathSceneIdentitySets(prevStep.snapshot as MathSceneSnapshot);
}

export function progressForIdentity(
  key: string,
  previousKeys: Set<string>,
  stepProgress: number,
): number {
  return previousKeys.has(key) ? 1 : stepProgress;
}
