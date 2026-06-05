import type { SnapshotKind } from "../types";

export type SnapshotSurface = "stage" | "overlay";

export function snapshotSurface(kind: SnapshotKind): SnapshotSurface {
  switch (kind) {
    case "katex_overlay":
    case "narration_card":
      return "overlay";
    case "algorithm_array":
    case "algorithm_bars":
    case "algorithm_tree":
    case "math_plot":
    case "math_formula":
    case "math_scene":
    case "motion_scene":
    default:
      return "stage";
  }
}
