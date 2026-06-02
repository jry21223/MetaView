import type {
  MathSceneAnnotation,
  MathSceneCurve,
  MathScenePoint,
  MathSceneRegion,
  MathSceneSegment,
  MathSceneSnapshot,
  MathSceneVectorField,
  MetaStep,
} from "../types";
import { viewBoxFromSnapshot, type CameraViewBox } from "./camera";
import {
  diagnoseMathScenePlan,
  type MathScenePlanDiagnostics,
} from "./diagnostics";
import { diffMathSceneObjects, isAdded, isPersisted } from "./diff";
import {
  curveKey,
  annotationKey,
  pointKey,
  regionKey,
  segmentKey,
  vectorFieldKey,
} from "./identity";
import { objectProgress, shouldRenderObject } from "./progress";

export interface PlannedObject<T> {
  key: string;
  object: T;
  progress: number;
  persisted: boolean;
  added: boolean;
}

export interface MathSceneRenderPlan {
  points: PlannedObject<MathScenePoint>[];
  segments: PlannedObject<MathSceneSegment>[];
  regions: PlannedObject<MathSceneRegion>[];
  curves: PlannedObject<MathSceneCurve>[];
  annotations: PlannedObject<MathSceneAnnotation>[];
  vectorField: PlannedObject<MathSceneVectorField> | null;
  camera: CameraViewBox;
  diagnostics: MathScenePlanDiagnostics;
}

function previousMathSceneSnapshot(
  previousStep: MetaStep | null | undefined,
): MathSceneSnapshot | null {
  if (!previousStep || previousStep.snapshot.kind !== "math_scene") return null;
  return previousStep.snapshot as MathSceneSnapshot;
}

function planObjects<T>(
  objects: T[],
  keyForObject: (object: T) => string,
  diff: ReturnType<typeof diffMathSceneObjects>,
  stepProgress: number,
): PlannedObject<T>[] {
  return objects.flatMap((object) => {
    const key = keyForObject(object);
    if (!shouldRenderObject(key, diff)) return [];

    return [
      {
        key,
        object,
        progress: objectProgress(key, diff, stepProgress),
        persisted: isPersisted(key, diff),
        added: isAdded(key, diff),
      },
    ];
  });
}

function planObject<T>(
  object: T | null | undefined,
  keyForObject: (object: T) => string,
  diff: ReturnType<typeof diffMathSceneObjects>,
  stepProgress: number,
): PlannedObject<T> | null {
  if (!object) return null;
  return planObjects([object], keyForObject, diff, stepProgress)[0] ?? null;
}

export function buildMathSceneRenderPlan(args: {
  previousStep?: MetaStep | null;
  currentSnapshot: MathSceneSnapshot;
  stepProgress: number;
}): MathSceneRenderPlan {
  const { previousStep, currentSnapshot, stepProgress } = args;
  const diff = diffMathSceneObjects(
    previousMathSceneSnapshot(previousStep),
    currentSnapshot,
  );

  return {
    points: planObjects(currentSnapshot.points ?? [], pointKey, diff, stepProgress),
    segments: planObjects(currentSnapshot.segments ?? [], segmentKey, diff, stepProgress),
    regions: planObjects(currentSnapshot.regions ?? [], regionKey, diff, stepProgress),
    curves: planObjects(currentSnapshot.curves ?? [], curveKey, diff, stepProgress),
    annotations: planObjects(
      currentSnapshot.annotations ?? [],
      annotationKey,
      diff,
      stepProgress,
    ),
    vectorField: planObject(
      currentSnapshot.vector_field,
      vectorFieldKey,
      diff,
      stepProgress,
    ),
    camera: viewBoxFromSnapshot(currentSnapshot),
    diagnostics: diagnoseMathScenePlan(currentSnapshot),
  };
}
