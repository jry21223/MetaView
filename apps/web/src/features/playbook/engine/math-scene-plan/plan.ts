import type {
  MathSceneCurve,
  MathScenePoint,
  MathSceneRegion,
  MathSceneSegment,
  MathSceneSnapshot,
  MetaStep,
} from "../types";
import { viewBoxFromSnapshot, type CameraViewBox } from "./camera";
import { diffMathSceneObjects, isAdded, isPersisted } from "./diff";
import {
  curveKey,
  pointKey,
  regionKey,
  segmentKey,
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
  camera: CameraViewBox;
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
    camera: viewBoxFromSnapshot(currentSnapshot),
  };
}
