import React, { useMemo, useState } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import {
  compileExpr,
  sampleExpr,
  type CompiledExpr,
} from "../../../../shared/lib/mathExpr";
import {
  MATH_PRESETS,
  initialParams,
  type CurveEmphasis,
  type MathPreset,
} from "../../../../features/math-widget/lib/presets";
import { FunctionPlot, type PlotMarker, type PlotSeries } from "../../../../features/math-widget/ui/FunctionPlot";
import type { ParamPanelProps } from "./types";

const SAMPLES = 280;
const PARAM_ID_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

const CURVE_COLORS: Record<"dark" | "light", Record<CurveEmphasis, string>> = {
  dark: { primary: "#4de8b0", secondary: "#c8a8f8", accent: "#ff9e8a" },
  light: { primary: "#0a8f6e", secondary: "#6030c0", accent: "#c05030" },
};

interface CompiledPreset {
  preset: MathPreset;
  curves: Array<{ fn: CompiledExpr | null; label: string; emphasis: CurveEmphasis }>;
  markerFn: CompiledExpr | null;
}

interface NumericControl {
  control: ParamPanelProps["script"]["parameter_controls"][number];
  initial: number;
}

function compilePreset(preset: MathPreset): CompiledPreset {
  const curves = preset.curves.map((c) => {
    let fn: CompiledExpr | null = null;
    try {
      fn = compileExpr(c.expression);
    } catch {
      fn = null;
    }
    return { fn, label: c.label, emphasis: (c.emphasis ?? "primary") as CurveEmphasis };
  });
  let markerFn: CompiledExpr | null = null;
  if (preset.markerX) {
    try {
      markerFn = compileExpr(preset.markerX);
    } catch {
      markerFn = null;
    }
  }
  return { preset, curves, markerFn };
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
  const numericControls = useMemo<NumericControl[]>(() => {
    const controls: NumericControl[] = [];
    for (const control of script.parameter_controls) {
      const initial = parseNumber(control.value);
      if (initial == null || !PARAM_ID_RE.test(control.id)) continue;
      controls.push({ control, initial });
    }
    return controls;
  }, [script.parameter_controls]);

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

  const [presetId, setPresetId] = useState<string>(MATH_PRESETS[0].id);
  const [params, setParams] = useState<Record<string, number>>(() => initialParams(MATH_PRESETS[0]));

  const compiled = useMemo<CompiledPreset>(() => {
    const preset = MATH_PRESETS.find((p) => p.id === presetId) ?? MATH_PRESETS[0];
    return compilePreset(preset);
  }, [presetId]);
  const { preset } = compiled;

  const selectPreset = (id: string): void => {
    const next = MATH_PRESETS.find((p) => p.id === id);
    if (!next) return;
    setPresetId(id);
    setParams(initialParams(next));
  };

  const setParam = (key: string, value: number): void => {
    setParams((prev) => ({ ...prev, [key]: value }));
  };

  const series: PlotSeries[] = compiled.curves.map((curve) => ({
    points: curve.fn ? sampleExpr(curve.fn, preset.xRange[0], preset.xRange[1], SAMPLES, params) : [],
    color: CURVE_COLORS[theme][curve.emphasis],
    label: curve.label,
    dashed: curve.emphasis === "secondary" || curve.emphasis === "accent",
  }));

  let marker: PlotMarker | null = null;
  const leadFn = compiled.curves.find((curve) => curve.fn)?.fn ?? null;
  if (compiled.markerFn && leadFn) {
    const mx = compiled.markerFn(params);
    const my = Number.isFinite(mx) ? leadFn({ ...params, x: mx }) : NaN;
    if (Number.isFinite(mx) && Number.isFinite(my)) {
      marker = { x: mx, y: my, color: CURVE_COLORS[theme].primary };
    }
  }

  const readouts = preset.readouts?.(params) ?? [];

  if (numericControls.length > 0) {
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

      {/* Live formula */}
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

      {/* Plot */}
      <div className="math-param-panel__plot-wrap">
        <div className="math-param-panel__plot">
          <FunctionPlot series={series} xRange={preset.xRange} yRange={preset.yRange} theme={theme} marker={marker} />
        </div>
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
        <button onClick={() => setParams(initialParams(preset))} className="math-param-panel__reset">
          重置参数
        </button>
      </div>
    </div>
  );
}
