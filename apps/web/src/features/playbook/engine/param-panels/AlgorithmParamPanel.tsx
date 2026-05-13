import { useCallback, useEffect, useState } from "react";
import type { ParamPanelProps } from "./types";
import { isReplaySupported } from "../replay/registry";

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function AlgorithmParamPanel({
  script,
  overrides,
  onOverridesChange,
  isDark,
}: ParamPanelProps) {
  const initialArray = script.initial_data?.array;
  const replaySupported = isReplaySupported(script.algorithm_id);
  const dataDisabled = !replaySupported || !initialArray;

  const effective = overrides.array ?? initialArray ?? [];
  const dirty = !!overrides.array && !arraysEqual(overrides.array, initialArray ?? []);

  const [draft, setDraft] = useState<string[]>(effective);
  useEffect(() => {
    const id = setTimeout(() => setDraft(effective), 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overrides.array, initialArray]);

  const commit = useCallback(
    (next: string[]) => {
      setDraft(next);
      const cleaned = next.map((v) => v.trim()).filter((v) => v.length > 0);
      if (cleaned.length === 0) return;
      onOverridesChange({ ...overrides, array: cleaned });
    },
    [onOverridesChange, overrides],
  );

  const updateAt = (index: number, value: string) => {
    const next = [...draft];
    next[index] = value;
    commit(next);
  };

  const removeAt = (index: number) => {
    if (draft.length <= 2) return;
    commit(draft.filter((_, i) => i !== index));
  };

  const append = () => commit([...draft, "0"]);

  const handleReset = () => onOverridesChange({ ...overrides, array: undefined });

  const c = isDark
    ? {
        text: "#c9d1d9",
        muted: "#8b949e",
        chipBg: "#161b22",
        chipBorder: "#30363d",
        accent: "#4de8b0",
      }
    : {
        text: "#24292f",
        muted: "#6e7781",
        chipBg: "#ffffff",
        chipBorder: "#d0d7de",
        accent: "#00896e",
      };

  if (dataDisabled) {
    return (
      <div style={{ padding: "10px 16px", fontSize: 12, color: c.muted }}>
        {script.algorithm_id
          ? `「${script.algorithm_id}」暂不支持热加载`
          : "未识别算法，热加载不可用"}
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        flexWrap: "wrap",
        padding: "10px 16px",
      }}
    >
      <span style={{ fontSize: 11, color: c.muted, letterSpacing: "0.04em" }}>
        演示数据
      </span>
      {draft.map((v, i) => (
        <span
          key={i}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 2,
            padding: "2px 4px 2px 6px",
            borderRadius: 6,
            border: `1px solid ${c.chipBorder}`,
            background: c.chipBg,
          }}
        >
          <input
            value={v}
            onChange={(e) => updateAt(i, e.target.value)}
            style={{
              width: `${Math.max(2, v.length + 1)}ch`,
              minWidth: 24,
              border: "none",
              outline: "none",
              background: "transparent",
              color: c.text,
              fontFamily: "IBM Plex Mono, monospace",
              fontSize: 13,
              textAlign: "center",
              padding: 0,
            }}
          />
          <button
            onClick={() => removeAt(i)}
            disabled={draft.length <= 2}
            title="删除该元素"
            style={{
              border: "none",
              background: "transparent",
              color: c.muted,
              cursor: draft.length <= 2 ? "not-allowed" : "pointer",
              padding: "0 2px",
              fontSize: 12,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </span>
      ))}
      <button
        onClick={append}
        style={{
          border: `1px dashed ${c.chipBorder}`,
          background: "transparent",
          color: c.muted,
          borderRadius: 6,
          padding: "2px 8px",
          cursor: "pointer",
          fontSize: 12,
        }}
      >
        +
      </button>
      {dirty && (
        <button
          onClick={handleReset}
          title="恢复初始数据"
          style={{
            border: `1px solid ${c.chipBorder}`,
            background: "transparent",
            color: c.accent,
            borderRadius: 6,
            padding: "2px 10px",
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          重置
        </button>
      )}
    </div>
  );
}
