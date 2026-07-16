import React, { useMemo } from "react";
import "katex/dist/katex.min.css";
import type { ParamPanelProps } from "./types";
import { resolveEditableMathControls } from "./mathParams";

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

  const numericControls = useMemo(
    () => resolveEditableMathControls(script.parameter_controls),
    [script.parameter_controls],
  );

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

  if (numericControls.length === 0) {
    return (
      <div className="math-param-panel" data-theme={theme}>
        <p className="math-param-panel__description-text">此步骤无可调参数。</p>
      </div>
    );
  }

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
