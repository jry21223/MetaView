import type { MathSceneSnapshot } from "../types";
import { collectObjectIdentities, type MathSceneObjectIdentity } from "./identity";

export interface MathSceneObjectDiff {
  persisted: Set<string>;
  added: Set<string>;
  removed: Set<string>;
}

interface PreviousObject extends MathSceneObjectIdentity {
  matched: boolean;
}

function indexBy(
  objects: PreviousObject[],
  keyOf: (object: PreviousObject) => string | null,
): Map<string, PreviousObject[]> {
  const index = new Map<string, PreviousObject[]>();
  for (const object of objects) {
    const key = keyOf(object);
    if (!key) continue;
    const bucket = index.get(key);
    if (bucket) bucket.push(object);
    else index.set(key, [object]);
  }
  return index;
}

/** Consume one still-unmatched previous object stored under `key`, if any. */
function claimMatch(
  index: Map<string, PreviousObject[]>,
  key: string | null,
): boolean {
  if (!key) return false;
  const bucket = index.get(key);
  if (!bucket) return false;
  for (let cursor = bucket.shift(); cursor; cursor = bucket.shift()) {
    if (!cursor.matched) {
      cursor.matched = true;
      return true;
    }
  }
  return false;
}

/**
 * Classify the current scene's objects against the previous scene.
 *
 * Matching runs in three passes so an object does not re-run its entrance
 * animation just because its label text or exact coordinates moved between
 * steps (e.g. a segment labelled `PF₁=3.42` becoming `PF₁=3.57`):
 *   1. exact content keys — unchanged objects;
 *   2. semantic_role plus per-role ordinal — moving or re-labelled objects
 *      that keep their semantic identity;
 *   3. label/text-free geometry — unchanged shapes whose label text changed.
 * Current objects left unmatched are `added`; previous objects no pass
 * consumed are `removed`. Sets keep today's exact-key vocabulary.
 */
export function diffMathSceneObjects(
  previous: MathSceneSnapshot | null | undefined,
  current: MathSceneSnapshot,
): MathSceneObjectDiff {
  const previousObjects: PreviousObject[] = (previous ? collectObjectIdentities(previous) : []).map(
    (identity) => ({ ...identity, matched: false }),
  );
  const currentObjects = collectObjectIdentities(current);

  const byExactKey = indexBy(previousObjects, (object) => object.key);
  const byRoleKey = indexBy(previousObjects, (object) => object.roleKey);
  const byGeometryKey = indexBy(previousObjects, (object) => object.geometryKey);

  const persisted = new Set<string>();
  const added = new Set<string>();

  const afterExact: MathSceneObjectIdentity[] = [];
  for (const object of currentObjects) {
    if (claimMatch(byExactKey, object.key)) persisted.add(object.key);
    else afterExact.push(object);
  }
  const afterRole: MathSceneObjectIdentity[] = [];
  for (const object of afterExact) {
    if (claimMatch(byRoleKey, object.roleKey)) persisted.add(object.key);
    else afterRole.push(object);
  }
  for (const object of afterRole) {
    if (claimMatch(byGeometryKey, object.geometryKey)) persisted.add(object.key);
    else added.add(object.key);
  }

  // Duplicate exact keys can land in both buckets; persisted wins so the
  // sets stay disjoint like the previous set-based implementation.
  for (const key of persisted) added.delete(key);

  const removed = new Set<string>();
  for (const object of previousObjects) {
    if (!object.matched && !persisted.has(object.key) && !added.has(object.key)) {
      removed.add(object.key);
    }
  }

  return { persisted, added, removed };
}

export function isPersisted(key: string, diff: MathSceneObjectDiff): boolean {
  return diff.persisted.has(key);
}

export function isAdded(key: string, diff: MathSceneObjectDiff): boolean {
  return diff.added.has(key);
}

export function isRemoved(key: string, diff: MathSceneObjectDiff): boolean {
  return diff.removed.has(key);
}
