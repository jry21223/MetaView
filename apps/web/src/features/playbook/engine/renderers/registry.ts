import type { SnapshotKind } from "../types";
import type { RendererComponent } from "./types";
import { AlgorithmRenderer } from "./AlgorithmRenderer";
import { BinaryTreeRenderer } from "./BinaryTreeRenderer";

const registry = new Map<SnapshotKind, RendererComponent>([
  ["algorithm_array", AlgorithmRenderer],
  ["algorithm_tree", BinaryTreeRenderer],
]);

export const rendererRegistry = registry;
