import { useMemo } from "react";
import type {
  AlgorithmArraySnapshot,
  AlgorithmBarsSnapshot,
  MathPlotCurve,
  MathPlotSnapshot,
  MetaStep,
  PlaybookScript,
} from "../types";
import { getReplay } from "../replay/registry";
import type { ReplayedStep } from "../replay/types";

/**
 * Partial override applied on top of every math step's MathPlotSnapshot when
 * the user picks a preset / drags a slider in the math param panel. Only the
 * fields the user can change are listed here — everything else is inherited
 * from the script step.
 */
export interface MathPlotOverride {
  curves?: MathPlotCurve[];
  params?: Record<string, number>;
  x_min?: number;
  x_max?: number;
  y_min?: number | null;
  y_max?: number | null;
  marker_x?: number | null;
  formula_latex?: string | null;
}

export interface ScriptOverrides {
  array?: string[];
  mathParams?: Record<string, number>;
  /** Live preset/slider state from MathParamPanel; drives the main viewport. */
  mathPlot?: MathPlotOverride;
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

/**
 * Apply a preset/slider-driven plot override onto every math step. The
 * override is *additive* — only the fields the user changed are merged onto
 * each existing ``MathPlotSnapshot``; non-math snapshots pass through.
 *
 * Exported so it can be unit-tested in isolation; the production path goes
 * through {@link resolveScript}.
 */
export function applyMathPlotOverride(
  base: PlaybookScript,
  override: MathPlotOverride | undefined,
): PlaybookScript {
  if (!override) return base;
  const hasField = (key: keyof MathPlotOverride): boolean =>
    Object.prototype.hasOwnProperty.call(override, key);
  // Skip work when the override is an empty object (no user change yet).
  if (
    !hasField("curves") &&
    !hasField("params") &&
    !hasField("x_min") &&
    !hasField("x_max") &&
    !hasField("y_min") &&
    !hasField("y_max") &&
    !hasField("marker_x") &&
    !hasField("formula_latex")
  ) {
    return base;
  }

  let changed = false;
  const steps = base.steps.map((step) => {
    if (step.snapshot.kind !== "math_plot") return step;
    const next: MathPlotSnapshot = { ...step.snapshot };
    if (hasField("curves") && override.curves) {
      next.curves = override.curves;
      changed = true;
    }
    if (hasField("params") && override.params) {
      next.params = { ...(next.params ?? {}), ...override.params };
      changed = true;
    }
    if (hasField("x_min") && typeof override.x_min === "number") {
      next.x_min = override.x_min;
      changed = true;
    }
    if (hasField("x_max") && typeof override.x_max === "number") {
      next.x_max = override.x_max;
      changed = true;
    }
    if (hasField("y_min")) {
      next.y_min = override.y_min ?? null;
      changed = true;
    }
    if (hasField("y_max")) {
      next.y_max = override.y_max ?? null;
      changed = true;
    }
    if (hasField("marker_x")) {
      next.marker_x = override.marker_x ?? null;
      changed = true;
    }
    if (hasField("formula_latex")) {
      next.formula_latex = override.formula_latex ?? null;
      changed = true;
    }
    return { ...step, snapshot: next };
  });
  return changed ? { ...base, steps } : base;
}

export function resolveScript(base: PlaybookScript, overrides: ScriptOverrides): PlaybookScript {
  const withAlgorithm = applyAlgorithmArrayOverride(base, overrides.array);
  const withMathParams = applyMathParamOverride(withAlgorithm, overrides.mathParams);
  return applyMathPlotOverride(withMathParams, overrides.mathPlot);
}

export function useResolvedScript(base: PlaybookScript, overrides: ScriptOverrides): PlaybookScript {
  return useMemo(() => resolveScript(base, overrides), [base, overrides]);
}
