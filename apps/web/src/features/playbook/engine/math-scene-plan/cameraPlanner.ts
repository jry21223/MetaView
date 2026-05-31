import { boundsOfPlannedObjects } from "./bounds";
import {
  expandViewBoxToMinSize,
  interpolateViewBox,
  viewBoxFromBounds,
  viewBoxHeight,
  viewBoxWidth,
  type CameraViewBox,
} from "./camera";
import type { MathSceneRenderPlan } from "./plan";

export interface CameraPlannerOptions {
  enabled: boolean;
  focusAddedObjects: boolean;
  paddingRatio: number;
  minZoomRatio: number;
}

export const DEFAULT_CAMERA_PLANNER_OPTIONS: CameraPlannerOptions = {
  enabled: true,
  focusAddedObjects: true,
  paddingRatio: 0.35,
  minZoomRatio: 0.45,
};

export function planCameraViewBox(args: {
  plan: MathSceneRenderPlan;
  fallback: CameraViewBox;
  progress: number;
  options?: Partial<CameraPlannerOptions>;
}): CameraViewBox {
  const options = { ...DEFAULT_CAMERA_PLANNER_OPTIONS, ...args.options };
  if (!options.enabled || !options.focusAddedObjects) {
    return args.fallback;
  }

  const addedBounds = boundsOfPlannedObjects({
    points: args.plan.points,
    segments: args.plan.segments,
    regions: args.plan.regions,
    annotations: args.plan.annotations,
    onlyAdded: true,
  });
  if (!addedBounds) return args.fallback;

  const focus = viewBoxFromBounds(addedBounds, args.fallback, options.paddingRatio);
  const minWidth = viewBoxWidth(args.fallback) * options.minZoomRatio;
  const minHeight = viewBoxHeight(args.fallback) * options.minZoomRatio;
  const expandedFocus = expandViewBoxToMinSize(focus, minWidth, minHeight);

  return interpolateViewBox(args.fallback, expandedFocus, args.progress);
}
