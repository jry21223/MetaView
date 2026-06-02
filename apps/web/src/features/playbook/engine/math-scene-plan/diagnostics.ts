import type { MathSceneSnapshot } from "../types";
import {
  collectObjectRefs,
  type MathSceneObjectKind,
  type MathSceneObjectRef,
} from "./identity";

export type MathScenePlanWarningCode = "duplicate_identity_key";

export interface MathScenePlanWarning {
  code: MathScenePlanWarningCode;
  kind: MathSceneObjectKind;
  key: string;
  count: number;
  message: string;
}

export interface MathScenePlanDiagnostics {
  warnings: MathScenePlanWarning[];
}

function duplicateIdentityWarning(
  ref: MathSceneObjectRef,
  count: number,
): MathScenePlanWarning {
  return {
    code: "duplicate_identity_key",
    kind: ref.kind,
    key: ref.key,
    count,
    message: `Duplicate ${ref.kind} identity key "${ref.key}" appears ${count} times.`,
  };
}

export function diagnoseMathScenePlan(
  snapshot: MathSceneSnapshot,
): MathScenePlanDiagnostics {
  const refs = collectObjectRefs(snapshot);
  const counts = new Map<string, { ref: MathSceneObjectRef; count: number }>();

  for (const ref of refs) {
    const existing = counts.get(ref.key);
    if (existing) {
      existing.count += 1;
    } else {
      counts.set(ref.key, { ref, count: 1 });
    }
  }

  return {
    warnings: [...counts.values()]
      .filter(({ count }) => count > 1)
      .map(({ ref, count }) => duplicateIdentityWarning(ref, count)),
  };
}
