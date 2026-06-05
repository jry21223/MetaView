import type {
  Layer,
  MathPlotCurve,
  MathPlotSnapshot,
  MathSceneSnapshot,
  MetaStep,
  PlaybookScript,
} from "../types";
import { normaliseTiming } from "../foundation/useTimeline";

const DEFAULT_LAYER: Pick<Layer, "timing"> = {
  timing: { enter_at: 0, exit_at: 1, appear_anim: "none", z_order: 0 },
};

export interface VisualLayerState {
  layer: Layer;
  visualKey: string;
  visualStartFrame: number;
  visualEndFrame: number;
  isVisualContinuation: boolean;
}

export interface VisualStepState {
  stepIndex: number;
  stepStartFrame: number;
  stepEndFrame: number;
  visualKey: string;
  visualStartFrame: number;
  isVisualContinuation: boolean;
  layers: VisualLayerState[];
}

export interface VisualTimeline {
  steps: VisualStepState[];
}

function stableNormalize(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (Array.isArray(value)) return value.map((item) => stableNormalize(item));
  if (typeof value !== "object") return value;

  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    const next = stableNormalize((value as Record<string, unknown>)[key]);
    if (next !== undefined) out[key] = next;
  }
  return out;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(stableNormalize(value));
}

function timingKey(layer: Layer): string {
  const timing = normaliseTiming(layer.timing);
  return `${timing.enter_at}|${timing.exit_at}|${layer.timing.z_order}`;
}

function curveKey(curve: MathPlotCurve): string {
  return `${curve.expression}\u0000${curve.label ?? ""}\u0000${curve.emphasis ?? ""}`;
}

function mergeCurves(a: MathPlotCurve[], b: MathPlotCurve[]): MathPlotCurve[] {
  const seen = new Set<string>();
  const out: MathPlotCurve[] = [];
  for (const curve of [...a, ...b]) {
    const key = curveKey(curve);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(curve);
  }
  return out;
}

function mergeOptionalRange(
  aMin: number | null | undefined,
  aMax: number | null | undefined,
  bMin: number | null | undefined,
  bMax: number | null | undefined,
): [number | null, number | null] {
  if (aMin == null || aMax == null) return [bMin ?? null, bMax ?? null];
  if (bMin == null || bMax == null) return [aMin, aMax];
  return [Math.min(aMin, bMin), Math.max(aMax, bMax)];
}

function mergeMathPlotSnapshots(a: MathPlotSnapshot, b: MathPlotSnapshot): MathPlotSnapshot {
  const [yMin, yMax] = mergeOptionalRange(a.y_min, a.y_max, b.y_min, b.y_max);
  const hasBShade = b.shade_from != null && b.shade_to != null;
  const hasAShade = a.shade_from != null && a.shade_to != null;

  return {
    ...a,
    ...b,
    curves: mergeCurves(a.curves ?? [], b.curves ?? []),
    x_min: Math.min(a.x_min, b.x_min),
    x_max: Math.max(a.x_max, b.x_max),
    y_min: yMin,
    y_max: yMax,
    marker_x: b.marker_x ?? a.marker_x,
    shade_from: hasBShade ? b.shade_from : hasAShade ? a.shade_from : null,
    shade_to: hasBShade ? b.shade_to : hasAShade ? a.shade_to : null,
    x_label: b.x_label || a.x_label,
    y_label: b.y_label || a.y_label,
    formula_latex: b.formula_latex ?? a.formula_latex,
  };
}

function mergeMathSceneSnapshots(a: MathSceneSnapshot, b: MathSceneSnapshot): MathSceneSnapshot {
  return {
    ...a,
    ...b,
    points: [...(a.points ?? []), ...(b.points ?? [])],
    segments: [...(a.segments ?? []), ...(b.segments ?? [])],
    regions: [...(a.regions ?? []), ...(b.regions ?? [])],
    curves: [...(a.curves ?? []), ...(b.curves ?? [])],
    annotations: [...(a.annotations ?? []), ...(b.annotations ?? [])],
    vector_field: b.vector_field ?? a.vector_field,
    formula_latex: b.formula_latex ?? a.formula_latex,
    caption: b.caption ?? a.caption,
    x_min: Math.min(a.x_min, b.x_min),
    x_max: Math.max(a.x_max, b.x_max),
    y_min: Math.min(a.y_min, b.y_min),
    y_max: Math.max(a.y_max, b.y_max),
    x_label: b.x_label || a.x_label,
    y_label: b.y_label || a.y_label,
    params: a.params || b.params ? { ...(a.params ?? {}), ...(b.params ?? {}) } : undefined,
  };
}

/**
 * Return the exact layer stack the compositor should render. Legacy scripts
 * with only `snapshot` become a one-layer visual stack, and simultaneous
 * math_plot / math_scene layers with identical timing are merged so the
 * renderer keeps one coordinate system.
 */
export function normaliseVisualLayers(step: MetaStep): Layer[] {
  const source =
    step.layers && step.layers.length > 0
      ? step.layers
      : [{ ...DEFAULT_LAYER, body: step.snapshot }];

  const out: Layer[] = [];
  const mathPlotIndexByTiming = new Map<string, number>();
  const mathSceneIndexByTiming = new Map<string, number>();
  const sorted = [...source].sort((a, b) => a.timing.z_order - b.timing.z_order);

  for (const layer of sorted) {
    const timing = normaliseTiming(layer.timing);
    const normalisedLayer: Layer = {
      ...layer,
      timing: {
        enter_at: timing.enter_at,
        exit_at: timing.exit_at,
        appear_anim: timing.appear_anim ?? "fade",
        z_order: layer.timing.z_order,
      },
    };

    const key = timingKey(normalisedLayer);

    if (normalisedLayer.body.kind === "math_plot") {
      const existingIndex = mathPlotIndexByTiming.get(key);
      if (existingIndex == null) {
        mathPlotIndexByTiming.set(key, out.length);
        out.push(normalisedLayer);
        continue;
      }

      const existing = out[existingIndex];
      if (existing.body.kind !== "math_plot") {
        out.push(normalisedLayer);
        continue;
      }

      out[existingIndex] = {
        ...existing,
        body: mergeMathPlotSnapshots(existing.body, normalisedLayer.body),
      };
      continue;
    }

    if (normalisedLayer.body.kind === "math_scene") {
      const existingIndex = mathSceneIndexByTiming.get(key);
      if (existingIndex == null) {
        mathSceneIndexByTiming.set(key, out.length);
        out.push(normalisedLayer);
        continue;
      }

      const existing = out[existingIndex];
      if (existing.body.kind !== "math_scene") {
        out.push(normalisedLayer);
        continue;
      }

      out[existingIndex] = {
        ...existing,
        body: mergeMathSceneSnapshots(existing.body, normalisedLayer.body),
      };
      continue;
    }

    out.push(normalisedLayer);
  }

  return out;
}

function layerBaseKey(layer: Layer): string {
  return stableStringify({
    z_order: layer.timing.z_order,
    body: layer.body,
  });
}

function countedLayerKeys(layers: Layer[]): Array<{ layer: Layer; visualKey: string }> {
  const counts = new Map<string, number>();
  return layers.map((layer) => {
    const base = layerBaseKey(layer);
    const count = counts.get(base) ?? 0;
    counts.set(base, count + 1);
    return { layer, visualKey: `${base}#${count}` };
  });
}

export function visualStepKey(step: MetaStep): string {
  return stableStringify(countedLayerKeys(normaliseVisualLayers(step)).map((item) => item.visualKey));
}

function stepStartFrame(script: PlaybookScript, index: number): number {
  return index <= 0 ? 0 : script.steps[index - 1]?.end_frame ?? 0;
}

function layerFrameBounds(layer: Layer, stepStart: number, stepEnd: number): [number, number] {
  const timing = normaliseTiming(layer.timing);
  const duration = Math.max(1, stepEnd - stepStart);
  const start = stepStart + duration * timing.enter_at;
  const end = stepStart + duration * timing.exit_at;
  return [start, Math.max(start + 1, end)];
}

export function compileVisualTimeline(script: PlaybookScript): VisualTimeline {
  const steps: VisualStepState[] = [];
  let previousLayerByKey = new Map<string, VisualLayerState>();

  for (let index = 0; index < script.steps.length; index += 1) {
    const step = script.steps[index];
    const stepStart = stepStartFrame(script, index);
    const stepEnd = step.end_frame;
    const countedLayers = countedLayerKeys(normaliseVisualLayers(step));
    const previousStep = steps[index - 1] ?? null;
    const visualKey = stableStringify(countedLayers.map((item) => item.visualKey));
    const stepContinues = previousStep?.visualKey === visualKey;
    const nextLayerByKey = new Map<string, VisualLayerState>();

    const layers = countedLayers.map(({ layer, visualKey: layerKey }) => {
      const previousLayer = previousLayerByKey.get(layerKey);
      const [layerStart, layerEnd] = layerFrameBounds(layer, stepStart, stepEnd);
      const visualLayer: VisualLayerState = previousLayer
        ? {
            layer,
            visualKey: layerKey,
            visualStartFrame: previousLayer.visualStartFrame,
            visualEndFrame: previousLayer.visualEndFrame,
            isVisualContinuation: true,
          }
        : {
            layer,
            visualKey: layerKey,
            visualStartFrame: layerStart,
            visualEndFrame: layerEnd,
            isVisualContinuation: false,
          };
      nextLayerByKey.set(layerKey, visualLayer);
      return visualLayer;
    });

    steps.push({
      stepIndex: index,
      stepStartFrame: stepStart,
      stepEndFrame: stepEnd,
      visualKey,
      visualStartFrame: stepContinues ? previousStep.visualStartFrame : stepStart,
      isVisualContinuation: stepContinues,
      layers,
    });

    previousLayerByKey = nextLayerByKey;
  }

  return { steps };
}
