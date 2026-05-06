import React, { useCallback, useEffect, useState } from "react";

interface TweakStripProps {
  initialArray: string[] | undefined;
  array: string[] | undefined;
  onArrayChange: (next: string[]) => void;
  onReset: () => void;
  speed: number;
  onSpeedChange: (next: number) => void;
  showSubtitles: boolean;
  onSubtitlesChange: (next: boolean) => void;
  replaySupported: boolean;
  algorithmId: string | null | undefined;
  isDark: boolean;
}

const SPEED_PRESETS = [0.5, 1, 1.5, 2];

export const TweakStrip: React.FC<TweakStripProps> = ({
  initialArray,
  array,
  onArrayChange,
  onReset,
  speed,
  onSpeedChange,
  showSubtitles,
  onSubtitlesChange,
  replaySupported,
  algorithmId,
  isDark,
}) => {
  const effective = array ?? initialArray ?? [];
  const dataDisabled = !replaySupported || !initialArray;
  const dirty = !!array && !arraysEqual(array, initialArray ?? []);

  // Local draft so chip inputs don't lose focus on every keystroke commit.
  const [draft, setDraft] = useState<string[]>(effective);
  useEffect(() => {
    setDraft(effective);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [array, initialArray]);

  const commit = useCallback(
    (next: string[]) => {
      setDraft(next);
      // Filter empty cells before committing to replay engine.
      const cleaned = next.map((v) => v.trim()).filter((v) => v.length > 0);
      if (cleaned.length === 0) return;
      onArrayChange(cleaned);
    },
    [onArrayChange],
  );

  const updateAt = (index: number, value: string) => {
    const next = [...draft];
    next[index] = value;
    commit(next);
  };

  const removeAt = (index: number) => {
    if (draft.length <= 2) return;
    const next = draft.filter((_, i) => i !== index);
    commit(next);
  };

  const append = () => {
    commit([...draft, "0"]);
  };

  const c = isDark
    ? {
        bg: "rgba(15,17,22,0.7)",
        border: "#21262d",
        text: "#c9d1d9",
        muted: "#8b949e",
        chipBg: "#161b22",
        chipBorder: "#30363d",
        accent: "#4de8b0",
        disabled: "#3a3f48",
      }
    : {
        bg: "rgba(247,249,252,0.85)",
        border: "#d0d7de",
        text: "#24292f",
        muted: "#6e7781",
        chipBg: "#ffffff",
        chipBorder: "#d0d7de",
        accent: "#00896e",
        disabled: "#c9d1d9",
      };

  return (
    <div
      className="playbook-tweakstrip"
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 16,
        padding: "8px 14px",
        borderTop: `1px solid ${c.border}`,
        background: c.bg,
        fontSize: 12,
        color: c.text,
      }}
    >
      {/* Demo data */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, color: c.muted, letterSpacing: "0.04em" }}>演示数据</span>
        {dataDisabled && (
          <span style={{ fontSize: 11, color: c.muted, fontStyle: "italic" }}>
            {algorithmId ? `「${algorithmId}」暂不支持热加载` : "未识别算法，热加载不可用"}
          </span>
        )}
        {!dataDisabled &&
          draft.map((v, i) => (
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
                disabled={dataDisabled}
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
                disabled={dataDisabled || draft.length <= 2}
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
        {!dataDisabled && (
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
        )}
        {!dataDisabled && dirty && (
          <button
            onClick={onReset}
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

      <div style={{ flex: 1 }} />

      {/* Speed */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 11, color: c.muted }}>速度</span>
        {SPEED_PRESETS.map((s) => (
          <button
            key={s}
            onClick={() => onSpeedChange(s)}
            style={{
              border: `1px solid ${speed === s ? c.accent : c.chipBorder}`,
              background: speed === s ? `${c.accent}1a` : "transparent",
              color: speed === s ? c.accent : c.muted,
              borderRadius: 5,
              padding: "2px 8px",
              cursor: "pointer",
              fontSize: 11,
              fontWeight: speed === s ? 600 : 400,
            }}
          >
            {s}×
          </button>
        ))}
      </div>

      {/* Subtitles */}
      <button
        onClick={() => onSubtitlesChange(!showSubtitles)}
        style={{
          border: `1px solid ${showSubtitles ? c.accent : c.chipBorder}`,
          background: showSubtitles ? `${c.accent}1a` : "transparent",
          color: showSubtitles ? c.accent : c.muted,
          borderRadius: 5,
          padding: "2px 10px",
          cursor: "pointer",
          fontSize: 11,
        }}
      >
        {showSubtitles ? "字幕开" : "字幕关"}
      </button>
    </div>
  );
};

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
