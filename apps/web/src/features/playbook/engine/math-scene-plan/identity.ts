import type {
  MathSceneAnnotation,
  MathSceneCurve,
  MathScenePoint,
  MathSceneRegion,
  MathSceneSegment,
  MathSceneSnapshot,
  MathSceneVectorField,
} from "../types";

export type MathSceneObjectKind =
  | "point"
  | "segment"
  | "region"
  | "curve"
  | "annotation"
  | "vector_field";

export interface MathSceneObjectRef {
  kind: MathSceneObjectKind;
  key: string;
}

export type MathSceneIdentitySets = Record<MathSceneObjectKind, Set<string>>;

type ObjectWithExplicitId = {
  id?: unknown;
};

function emptyIdentitySets(): MathSceneIdentitySets {
  return {
    point: new Set(),
    segment: new Set(),
    region: new Set(),
    curve: new Set(),
    annotation: new Set(),
    vector_field: new Set(),
  };
}

function n(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "";
  return Number(value).toFixed(3);
}

function explicitIdKey(
  kind: MathSceneObjectKind,
  object: ObjectWithExplicitId,
): string | null {
  const id = object.id;
  if (typeof id === "string") {
    const trimmed = id.trim();
    return trimmed ? [kind, "id", trimmed].join(":") : null;
  }
  if (typeof id === "number" && Number.isFinite(id)) {
    return [kind, "id", String(id)].join(":");
  }
  return null;
}

export function pointKey(point: MathScenePoint): string {
  const explicit = explicitIdKey("point", point as ObjectWithExplicitId);
  if (explicit) return explicit;

  return ["point", point.label ?? "", n(point.x), n(point.y)].join(":");
}

export function segmentKey(segment: MathSceneSegment): string {
  const explicit = explicitIdKey("segment", segment as ObjectWithExplicitId);
  if (explicit) return explicit;

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
  const explicit = explicitIdKey("region", region as ObjectWithExplicitId);
  if (explicit) return explicit;

  return [
    "region",
    region.label ?? "",
    (region.vertices ?? []).map(([x, y]) => `${n(x)},${n(y)}`).join("|"),
  ].join(":");
}

export function curveKey(curve: MathSceneCurve): string {
  const explicit = explicitIdKey("curve", curve as ObjectWithExplicitId);
  if (explicit) return explicit;

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
  const explicit = explicitIdKey("annotation", annotation as ObjectWithExplicitId);
  if (explicit) return explicit;

  return [
    "annotation",
    annotation.text ?? "",
    n(annotation.x),
    n(annotation.y),
    annotation.align ?? "",
  ].join(":");
}

export function vectorFieldKey(field: MathSceneVectorField): string {
  const explicit = explicitIdKey("vector_field", field as ObjectWithExplicitId);
  if (explicit) return explicit;

  return [
    "vector_field",
    field.expression_px ?? "",
    field.expression_py ?? "",
    n(field.step),
    field.label ?? "",
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
    ...(snapshot.vector_field
      ? [
          {
            kind: "vector_field" as const,
            key: vectorFieldKey(snapshot.vector_field),
          },
        ]
      : []),
  ];
}

export function collectIdentitySets(snapshot: MathSceneSnapshot): MathSceneIdentitySets {
  const sets = emptyIdentitySets();
  for (const ref of collectObjectRefs(snapshot)) {
    sets[ref.kind].add(ref.key);
  }
  return sets;
}

export function collectObjectKeySet(snapshot: MathSceneSnapshot): Set<string> {
  return new Set(collectObjectRefs(snapshot).map((ref) => ref.key));
}
