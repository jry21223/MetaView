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

/**
 * Continuity identity of one object. `key` is the exact content key used for
 * React keys and diff sets; `roleKey` and `geometryKey` are label-independent
 * fallbacks so the diff can keep matching an object whose label text or exact
 * coordinates changed between steps.
 */
export interface MathSceneObjectIdentity extends MathSceneObjectRef {
  /** semantic_role plus per-role ordinal, or null when the object has no role. */
  roleKey: string | null;
  /** Label/text-free content key: geometry, expressions, or sampling only. */
  geometryKey: string;
}

type ObjectWithExplicitId = {
  id?: unknown;
};

type ObjectWithSemanticRole = {
  semantic_role?: unknown;
};

function semanticRoleOf(object: ObjectWithSemanticRole): string | null {
  const role = object.semantic_role;
  if (typeof role !== "string") return null;
  const trimmed = role.trim();
  return trimmed ? trimmed : null;
}

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

/**
 * Collect every object's continuity identity in stable declaration order.
 * `geometryKey` reuses each exact key function with the label/text blanked,
 * and role ordinals count per (kind, semantic_role) so two same-role objects
 * in one snapshot (e.g. both focal-distance segments) stay distinguishable.
 */
export function collectObjectIdentities(snapshot: MathSceneSnapshot): MathSceneObjectIdentity[] {
  const roleOrdinals = new Map<string, number>();
  const identify = (
    kind: MathSceneObjectKind,
    object: ObjectWithSemanticRole,
    key: string,
    geometryKey: string,
  ): MathSceneObjectIdentity => {
    const role = semanticRoleOf(object);
    let roleKey: string | null = null;
    if (role) {
      const bucket = `${kind} ${role}`;
      const ordinal = roleOrdinals.get(bucket) ?? 0;
      roleOrdinals.set(bucket, ordinal + 1);
      roleKey = [kind, "role", role, ordinal].join(":");
    }
    return { kind, key, roleKey, geometryKey };
  };
  const field = snapshot.vector_field;

  return [
    ...(snapshot.points ?? []).map((point) =>
      identify("point", point, pointKey(point), pointKey({ ...point, label: null })),
    ),
    ...(snapshot.segments ?? []).map((segment) =>
      identify("segment", segment, segmentKey(segment), segmentKey({ ...segment, label: null })),
    ),
    ...(snapshot.regions ?? []).map((region) =>
      identify("region", region, regionKey(region), regionKey({ ...region, label: null })),
    ),
    ...(snapshot.curves ?? []).map((curve) =>
      identify("curve", curve, curveKey(curve), curveKey({ ...curve, label: null })),
    ),
    ...(snapshot.annotations ?? []).map((annotation) =>
      identify("annotation", annotation, annotationKey(annotation), annotationKey({ ...annotation, text: "" })),
    ),
    ...(field
      ? [identify("vector_field", field, vectorFieldKey(field), vectorFieldKey({ ...field, label: null }))]
      : []),
  ];
}

export function collectObjectRefs(snapshot: MathSceneSnapshot): MathSceneObjectRef[] {
  return collectObjectIdentities(snapshot).map(({ kind, key }) => ({ kind, key }));
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
