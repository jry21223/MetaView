import type { MetaStep } from "../../types";
import { MathSceneDirectorAdapter } from "./mathSceneAdapter";
import { StageDirectorAdapter } from "./stageAdapter";
import type { DirectorAdapter } from "./types";

const adapters: DirectorAdapter[] = [
  MathSceneDirectorAdapter,
  StageDirectorAdapter,
];

export function selectDirectorAdapter(step: MetaStep): DirectorAdapter {
  return adapters.find((adapter) => adapter.supports(step)) ?? StageDirectorAdapter;
}
