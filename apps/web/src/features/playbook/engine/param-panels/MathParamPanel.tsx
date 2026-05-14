import React, { useEffect, useMemo, useState } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import { compileExpr } from "../../../../shared/lib/mathExpr";
import {
  MATH_PRESETS,
  initialParams,
  type MathPreset,
} from "../../../../features/math-widget/lib/presets";
import type { MathPlotOverride } from "../player/useResolvedScript";
import type { MathPlotCurve } from "../types";
import type { ParamPanelProps } from "./types";

const PARAM_ID_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

interface NumericControl {
  control: ParamPanelProps["script"]["parameter_controls"][number];
  initial: number;
}

/**
 * Convert a preset definition into a {@link MathPlotOverride} that the main
 * viewport's MathPlotRenderer can consume. The preset's curve expressions and
 * marker expression are reused verbatim — we only evaluate the marker x at
 * the current parameter values because MathPlotSnapshot.marker_x is numeric.
 */
function presetToOverride(
  preset: MathPreset,
  params: Record<string, number>,
): MathPlotOverride {
  const curves: MathPlotCurve[] = preset.curves.map((c) => ({
    expression: c.expression,
    label: c.label,
    emphasis: c.emphasis ?? "primary",
  }));
  let markerX: number | null = null;
  if (preset.markerX) {
    try {
      const compiled = compileExpr(preset.markerX);
      const v = compiled(params);
      markerX = Number.isFinite(v) ? v : null;
    } catch {
      markerX = null;
    }
  }
  return {
    curves,
    params: { ...params },
    x_min: preset.xRange[0],
    x_max: preset.xRange[1],
    y_min: preset.yRange ? preset.yRange[0] : null,
    y_max: preset.yRange ? preset.yRange[1] : null,
    marker_x: markerX,
    formula_latex: preset.formula(params),
  };
}

function renderKatex(src: string, displayMode: boolean): string {
  try {
    return katex.renderToString(src, { throwOnError: false, displayMode });
  } catch {
    return src;
  }
}

function parseNumber(value: string): number | null {
  const n = Number(value.trim());
  return Number.isFinite(n) ? n : null;
}

function sliderRange(initial: number): { min: number; max: number; step: number } {
  const span = Math.max(5, Math.abs(initial) * 2);
  const min = initial - span;
  const max = initial + span;
  const step = span <= 5 ? 0.1 : 0.5;
  return { min, max, step };
}

export function MathParamPanel({
  script,
  overrides,
  onOverridesChange,
  isDark,
}: ParamPanelProps): React.JSX.Element {
  const theme = isDark ? "dark" : "light";

  // ─── All hooks must run unconditionally on every render. ────────────────
  // The component renders one of two UIs (script-driven sliders vs. preset
  // chips) depending on whether the LLM emitted parameter_controls, but the
  // hook list must stay stable. We compute hook state for both modes here and
  // pick the JSX branch at the bottom.
  const numericControls = useMemo<NumericControl[]>(() => {
    const controls: NumericControl[] = [];
    for (const control of script.parameter_controls) {
      const initial = parseNumber(control.value);
      if (initial == null || !PARAM_ID_RE.test(control.id)) continue;
      controls.push({ control, initial });
    }
    return controls;
  }, [script.parameter_controls]);

  // Preset-mode local state. Always declared, only consumed when we land in
  // the preset branch. React state is cheap; conditional hooks are not.
  const [presetId, setPresetId] = useState<string>(MATH_PRESETS[0].id);
  const [params, setParams] = useState<Record<string, number>>(() => initialParams(MATH_PRESETS[0]));

  const preset = useMemo<MathPreset>(
    () => MATH_PRESETS.find((p) => p.id === presetId) ?? MATH_PRESETS[0],
    [presetId],
  );

  const inPresetMode = numericControls.length === 0;

  // Push every (preset, params) change into the script overrides so the main
  // viewport reflects the panel state in real time. The effect is a no-op
  // when the panel is in script-driven mode.
  useEffect(() => {
    if (!inPresetMode) return;
    onOverridesChange({
      ...overrides,
      mathPlot: presetToOverride(preset, params),
    });
    // overrides / onOverridesChange intentionally omitted — including them
    // would re-fire on every parent re-render, clobbering itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inPresetMode, preset, params]);

  const setScriptParam = (key: string, value: number): void => {
    onOverridesChange({
      ...overrides,
      mathParams: { ...(overrides.mathParams ?? {}), [key]: value },
    });
  };

  const resetScriptParams = (): void => {
    const next = { ...overrides };
    delete next.mathParams;
    onOverridesChange(next);
  };

  // ─── Script-driven mode: sliders only, plot lives in the main viewport. ──
  if (!inPresetMode) {
    const dirty = Object.keys(overrides.mathParams ?? {}).length > 0;
    return (
      <div className="math-param-panel" data-theme={theme}>
        <div className="math-param-panel__control-list">
          {numericControls.map(({ control, initial }) => {
            const value = overrides.mathParams?.[control.id] ?? initial;
            const range = sliderRange(initial);
            return (
              <div key={control.id} className="math-param-panel__control">
                <div className="math-param-panel__control-row">
                  <label htmlFor={`mvp-${control.id}`} className="math-param-panel__script-label">
                    {control.label}
                  </label>
                  <input
                    id={`mvp-${control.id}`}
                    type="range"
                    min={range.min}
                    max={range.max}
                    step={range.step}
                    value={value}
                    onChange={(e) => setScriptParam(control.id, Number(e.target.value))}
                    className="math-param-panel__range"
                  />
                  <input
                    type="number"
                    value={Number.isInteger(value) ? value : Number(value.toFixed(3))}
                    step={range.step}
                    onChange={(e) => setScriptParam(control.id, Number(e.target.value))}
                    className="math-param-panel__number"
                  />
                </div>
                {control.description && (
                  <span className="math-param-panel__description">
                    {control.description}
                  </span>
                )}
              </div>
            );
          })}
        </div>
        {dirty && (
          <div className="math-param-panel__actions">
            <button onClick={resetScriptParams} className="math-param-panel__reset">
              重置参数
            </button>
          </div>
        )}
      </div>
    );
  }

  // ─── Preset mode: chips + sliders drive overrides.mathPlot. No canvas here. ──
  // The main viewport's MathPlotRenderer reads overrides.mathPlot and renders
  // the curve. This avoids the duplicated-canvas problem.

  const selectPreset = (id: string): void => {
    const next = MATH_PRESETS.find((p) => p.id === id);
    if (!next) return;
    setPresetId(id);
    setParams(initialParams(next));
  };

  const setParam = (key: string, value: number): void => {
    setParams((prev) => ({ ...prev, [key]: value }));
  };

  const readouts = preset.readouts?.(params) ?? [];

  return (
    <div className="math-param-panel" data-theme={theme}>
      {/* Preset chips */}
      <div className="math-param-panel__chips">
        {MATH_PRESETS.map((p) => {
          const active = p.id === presetId;
          return (
            <button
              key={p.id}
              onClick={() => selectPreset(p.id)}
              className={`math-param-panel__chip${active ? " is-active" : ""}`}
            >
              {p.name}
            </button>
          );
        })}
      </div>

      <p className="math-param-panel__description-text">{preset.description}</p>

      {/* Live formula readout (no canvas — the canvas is the main viewport). */}
      <div className="math-param-panel__formula-card">
        <div
          className="math-param-panel__formula"
          dangerouslySetInnerHTML={{ __html: renderKatex(preset.formula(params), true) }}
        />
        {readouts.length > 0 && (
          <div className="math-param-panel__readouts">
            {readouts.map((r) => (
              <span key={r} className="math-param-panel__readout">
                {r}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Parameter sliders */}
      <div className="math-param-panel__control-list">
        {preset.params.map((p) => (
          <div key={p.key} className="math-param-panel__preset-row">
            <label htmlFor={`mvw-${p.key}`} className="math-param-panel__preset-label">
              {p.label}
            </label>
            <input
              id={`mvw-${p.key}`}
              type="range"
              min={p.min}
              max={p.max}
              step={p.step}
              value={params[p.key] ?? p.initial}
              onChange={(e) => setParam(p.key, Number(e.target.value))}
              className="math-param-panel__range"
            />
            <span className="math-param-panel__value">
              {(params[p.key] ?? p.initial).toFixed(2)}
            </span>
          </div>
        ))}
      </div>

      <div className="math-param-panel__actions">
        <button
          onClick={() => setParams(initialParams(preset))}
          className="math-param-panel__reset"
        >
          重置参数
        </button>
      </div>
    </div>
  );
}
