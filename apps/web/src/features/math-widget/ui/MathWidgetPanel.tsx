import React, { useMemo, useState } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import {
  compileExpr,
  sampleExpr,
  type CompiledExpr,
} from "../../../shared/lib/mathExpr";
import {
  MATH_WIDGET_PRESETS,
  initialParams,
  type CurveEmphasis,
  type MathWidgetPreset,
} from "../lib/presets";
import { FunctionPlot, type PlotMarker, type PlotSeries } from "./FunctionPlot";

interface MathWidgetPanelProps {
  isDark: boolean;
}

const SAMPLES = 280;

const CURVE_COLORS: Record<"dark" | "light", Record<CurveEmphasis, string>> = {
  dark: { primary: "#4de8b0", secondary: "#c8a8f8", accent: "#ff9e8a" },
  light: { primary: "#0a8f6e", secondary: "#6030c0", accent: "#c05030" },
};

interface CompiledPreset {
  preset: MathWidgetPreset;
  curves: Array<{ fn: CompiledExpr | null; label: string; emphasis: CurveEmphasis }>;
  markerFn: CompiledExpr | null;
}

function compilePreset(preset: MathWidgetPreset): CompiledPreset {
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

export function MathWidgetPanel({ isDark }: MathWidgetPanelProps): React.JSX.Element {
  const theme = isDark ? "dark" : "light";
  const [presetId, setPresetId] = useState<string>(MATH_WIDGET_PRESETS[0].id);
  const [params, setParams] = useState<Record<string, number>>(() => initialParams(MATH_WIDGET_PRESETS[0]));

  const compiled = useMemo<CompiledPreset>(() => {
    const preset = MATH_WIDGET_PRESETS.find((p) => p.id === presetId) ?? MATH_WIDGET_PRESETS[0];
    return compilePreset(preset);
  }, [presetId]);
  const { preset } = compiled;

  const selectPreset = (id: string): void => {
    const next = MATH_WIDGET_PRESETS.find((p) => p.id === id);
    if (!next) return;
    setPresetId(id);
    setParams(initialParams(next));
  };

  const setParam = (key: string, value: number): void => {
    setParams((prev) => ({ ...prev, [key]: value }));
  };

  const series: PlotSeries[] = compiled.curves.map((c) => ({
    points: c.fn ? sampleExpr(c.fn, preset.xRange[0], preset.xRange[1], SAMPLES, params) : [],
    color: CURVE_COLORS[theme][c.emphasis],
    label: c.label,
    dashed: c.emphasis === "secondary" || c.emphasis === "accent",
  }));

  let marker: PlotMarker | null = null;
  const leadFn = compiled.curves.find((c) => c.fn)?.fn ?? null;
  if (compiled.markerFn && leadFn) {
    const mx = compiled.markerFn(params);
    const my = Number.isFinite(mx) ? leadFn({ ...params, x: mx }) : NaN;
    if (Number.isFinite(mx) && Number.isFinite(my)) {
      marker = { x: mx, y: my, color: CURVE_COLORS[theme].primary };
    }
  }

  const readouts = preset.readouts?.(params) ?? [];

  const c = isDark
    ? {
        bg: "#0e1513",
        panel: "rgba(255,255,255,0.04)",
        border: "rgba(255,255,255,0.12)",
        text: "#e8ecf4",
        muted: "rgba(232,236,244,0.6)",
        chipBg: "rgba(255,255,255,0.06)",
        chipActive: "#4de8b0",
        chipActiveText: "#06120d",
        accent: "#4de8b0",
      }
    : {
        bg: "#ffffff",
        panel: "rgba(0,0,0,0.03)",
        border: "#d0d7de",
        text: "#24292f",
        muted: "#6e7781",
        chipBg: "#f0f2f5",
        chipActive: "#00896e",
        chipActiveText: "#ffffff",
        accent: "#00896e",
      };

  return (
    <div
      style={{
        padding: "14px 16px 18px",
        background: c.bg,
        color: c.text,
        display: "flex",
        flexDirection: "column",
        gap: 14,
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <strong style={{ fontSize: 14 }}>📐 数学画板</strong>

      {/* Preset chips */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {MATH_WIDGET_PRESETS.map((p) => {
          const active = p.id === presetId;
          return (
            <button
              key={p.id}
              onClick={() => selectPreset(p.id)}
              style={{
                border: `1px solid ${active ? c.chipActive : c.border}`,
                background: active ? c.chipActive : c.chipBg,
                color: active ? c.chipActiveText : c.text,
                borderRadius: 999,
                padding: "4px 12px",
                fontSize: 12,
                fontWeight: active ? 700 : 500,
                cursor: "pointer",
              }}
            >
              {p.name}
            </button>
          );
        })}
      </div>

      <p style={{ margin: 0, fontSize: 12, lineHeight: 1.55, color: c.muted }}>{preset.description}</p>

      {/* Live formula */}
      <div
        style={{
          background: c.panel,
          border: `1px solid ${c.border}`,
          borderRadius: 8,
          padding: "10px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 6,
          alignItems: "center",
        }}
      >
        <div
          style={{ fontSize: 17, color: c.text }}
          dangerouslySetInnerHTML={{ __html: renderKatex(preset.formula(params), true) }}
        />
        {readouts.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 14px", justifyContent: "center" }}>
            {readouts.map((r) => (
              <span key={r} style={{ fontSize: 11.5, color: c.muted }}>
                {r}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Plot */}
      <div style={{ maxWidth: 720, width: "100%", margin: "0 auto" }}>
        <div
          style={{
            width: "100%",
            aspectRatio: "760 / 460",
            background: c.panel,
            border: `1px solid ${c.border}`,
            borderRadius: 8,
            overflow: "hidden",
          }}
        >
          <FunctionPlot series={series} xRange={preset.xRange} yRange={preset.yRange} theme={theme} marker={marker} />
        </div>
      </div>

      {/* Parameter sliders */}
      <div style={{ display: "grid", gap: 10 }}>
        {preset.params.map((p) => (
          <div key={p.key} style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <label htmlFor={`mvw-${p.key}`} style={{ fontSize: 12, width: 92, flexShrink: 0, color: c.text }}>
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
              style={{ flex: 1, accentColor: c.accent }}
            />
            <span style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 12, width: 56, textAlign: "right", color: c.text }}>
              {(params[p.key] ?? p.initial).toFixed(2)}
            </span>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button
          onClick={() => setParams(initialParams(preset))}
          style={{
            border: `1px solid ${c.border}`,
            background: "transparent",
            color: c.text,
            borderRadius: 6,
            padding: "6px 14px",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          重置参数
        </button>
      </div>
    </div>
  );
}
