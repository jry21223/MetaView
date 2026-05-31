import type {
  MathSceneAnnotation,
  MathSceneCurve,
  MathScenePoint,
  MathSceneRegion,
  MathSceneSegment,
  MathSceneSnapshot,
} from "../types";

export type MathSceneObjectKind =
  | "point"
  | "segment"
  | "region"
  | "curve"
  | "annotation";

export interface MathSceneObjectRef {
  kind: MathSceneObjectKind;
  key: string;
}

function n(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "";
  return Number(value).toFixed(3);
}

export function pointKey(point: MathScenePoint): string {
  return ["point", point.label ?? "", n(point.x), n(point.y)].join(":");
}

export function segmentKey(segment: MathSceneSegment): string {
  return [
    "segment",
    segment.label ?? "",
    n(segment.x0),
    n(segment.y0),
    n(segment.x1),
    n(segment.y1),
    segment.arrow ? "arrow" : "line",
  ].join(":");
}

export function regionKey(region: MathSceneRegion): string {
  return [
    "region",
    region.label ?? "",
    (region.vertices ?? []).map(([x, y]) => `${n(x)},${n(y)}`).join("|"),
  ].join(":");
}

export function curveKey(curve: MathSceneCurve): string {
  return [
    "curve",
    curve.label ?? "",
    curve.expression_x ?? "",
    curve.expression_y ?? "",
    n(curve.t_min),
    n(curve.t_max),
  ].join(":");
}

export function annotationKey(annotation: MathSceneAnnotation): string {
  return [
    "annotation",
    annotation.text ?? "",
    n(annotation.x),
    n(annotation.y),
    annotation.align ?? "",
  ].join(":");
}

export function collectObjectRefs(snapshot: MathSceneSnapshot): MathSceneObjectRef[] {
  return [
    ...(snapshot.points ?? []).map((point) => ({
      kind: "point" as const,
      key: pointKey(point),
    })),
    ...(snapshot.segments ?? []).map((segment) => ({
      kind: "segment" as const,
      key: segmentKey(segment),
    })),
    ...(snapshot.regions ?? []).map((region) => ({
      kind: "region" as const,
      key: regionKey(region),
    })),
    ...(snapshot.curves ?? []).map((curve) => ({
      kind: "curve" as const,
      key: curveKey(curve),
    })),
    ...(snapshot.annotations ?? []).map((annotation) => ({
      kind: "annotation" as const,
      key: annotationKey(annotation),
    })),
  ];
}

export function collectObjectKeySet(snapshot: MathSceneSnapshot): Set<string> {
  return new Set(collectObjectRefs(snapshot).map((ref) => ref.key));
}
