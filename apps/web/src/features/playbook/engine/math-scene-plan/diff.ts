import type { MathSceneSnapshot } from "../types";
import { collectObjectKeySet } from "./identity";

export interface MathSceneObjectDiff {
  persisted: Set<string>;
  added: Set<string>;
  removed: Set<string>;
}

export function diffMathSceneObjects(
  previous: MathSceneSnapshot | null | undefined,
  current: MathSceneSnapshot,
): MathSceneObjectDiff {
  const previousKeys = previous ? collectObjectKeySet(previous) : new Set<string>();
  const currentKeys = collectObjectKeySet(current);
  const persisted = new Set<string>();
  const added = new Set<string>();
  const removed = new Set<string>();

  for (const key of currentKeys) {
    if (previousKeys.has(key)) {
      persisted.add(key);
    } else {
      added.add(key);
    }
  }

  for (const key of previousKeys) {
    if (!currentKeys.has(key)) {
      removed.add(key);
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
