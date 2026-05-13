import { useMemo } from "react";
import type {
  AlgorithmArraySnapshot,
  AlgorithmBarsSnapshot,
  MathPlotSnapshot,
  MetaStep,
  PlaybookScript,
} from "../types";
import { getReplay } from "../replay/registry";
import type { ReplayedStep } from "../replay/types";

export interface ScriptOverrides {
  array?: string[];
  mathParams?: Record<string, number>;
}

function arraysEqual(a: string[] | undefined, b: string[] | undefined): boolean {
  if (!a || !b) return a === b;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function pickReplayed(replayed: ReplayedStep[], baseIndex: number, baseLen: number): ReplayedStep {
  if (replayed.length === baseLen) return replayed[baseIndex];
  // Map base step i → replayed step floor(i * replayed.length / baseLen). Last base step gets last replayed.
  if (baseIndex >= baseLen - 1) return replayed[replayed.length - 1];
  const target = Math.min(replayed.length - 1, Math.floor((baseIndex * replayed.length) / baseLen));
  return replayed[target];
}

function cleanMathParams(params: Record<string, number> | undefined): Record<string, number> | null {
  if (!params) return null;
  const entries = Object.entries(params).filter(([, value]) => Number.isFinite(value));
  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

function applyAlgorithmArrayOverride(base: PlaybookScript, newArray: string[] | undefined): PlaybookScript {
  const replay = getReplay(base.algorithm_id);
  if (!replay) return base;

  const initialArray = base.initial_data?.array;
  if (!newArray || newArray.length === 0) return base;
  if (arraysEqual(initialArray, newArray)) return base;

  let replayed: ReplayedStep[];
  try {
    replayed = replay(newArray);
  } catch (err) {
    console.warn("[replay] algorithm execution failed; falling back to base", err);
    return base;
  }
  if (replayed.length === 0) return base;

  const newSteps: MetaStep[] = base.steps.map((step, i) => {
    const r = pickReplayed(replayed, i, base.steps.length);
    const baseSnap = step.snapshot;
    const common = {
      array_values: r.snapshot.array_values,
      active_indices: r.snapshot.active_indices,
      swap_indices: r.snapshot.swap_indices,
      sorted_indices: r.snapshot.sorted_indices,
      pointers: r.snapshot.pointers,
    };
    const stepOverrides: Partial<MetaStep> = {};
    if (r.tts_rate != null) stepOverrides.tts_rate = r.tts_rate;
    if (r.codeHighlight != null) stepOverrides.code_highlight = r.codeHighlight;
    if (r.narrationTemplate != null) stepOverrides.narration_template = r.narrationTemplate;

    if (baseSnap.kind === "algorithm_array") {
      const newSnapshot: AlgorithmArraySnapshot = { ...baseSnap, ...common };
      return { ...step, ...stepOverrides, snapshot: newSnapshot };
    }
    if (baseSnap.kind === "algorithm_bars") {
      const numeric_values =
        r.snapshot.kind === "algorithm_bars"
          ? r.snapshot.numeric_values
          : r.snapshot.array_values.map(Number);
      const newSnapshot: AlgorithmBarsSnapshot = { ...baseSnap, ...common, numeric_values };
      return { ...step, ...stepOverrides, snapshot: newSnapshot };
    }
    return step;
  });

  return {
    ...base,
    steps: newSteps,
    initial_data: { ...(base.initial_data ?? {}), array: [...newArray] },
  };
}

function applyMathParamOverride(base: PlaybookScript, params: Record<string, number> | undefined): PlaybookScript {
  const clean = cleanMathParams(params);
  if (!clean) return base;

  let changed = false;
  const steps = base.steps.map((step) => {
    if (step.snapshot.kind !== "math_plot") return step;
    changed = true;
    const snapshot: MathPlotSnapshot = {
      ...step.snapshot,
      params: { ...(step.snapshot.params ?? {}), ...clean },
    };
    return { ...step, snapshot };
  });

  return changed ? { ...base, steps } : base;
}

export function resolveScript(base: PlaybookScript, overrides: ScriptOverrides): PlaybookScript {
  const withAlgorithm = applyAlgorithmArrayOverride(base, overrides.array);
  return applyMathParamOverride(withAlgorithm, overrides.mathParams);
}

export function useResolvedScript(base: PlaybookScript, overrides: ScriptOverrides): PlaybookScript {
  return useMemo(() => resolveScript(base, overrides), [base, overrides]);
}
