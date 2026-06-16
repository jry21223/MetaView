import React, { useEffect, useRef, useState } from "react";

import { AUTO_VOICE, OPENAI_VOICES } from "./useTTS";
import type { TTSConfig } from "./useTTS";
import { SpeakerOffSVG, SpeakerOnSVG } from "./PlaybookPlayerIcons";
import { SPEED_STEPS } from "./playbackRates";

interface PlayerSettingsPopoverProps {
  playbackRate: number;
  onPlaybackRateChange: (rate: number) => void;
  stepThrough: boolean;
  onStepThroughChange: (next: boolean) => void;
  ttsEnabled: boolean;
  ttsSupported: boolean;
  onToggleTTS: () => void;
  config: TTSConfig;
  onUpdate: (patch: Partial<TTSConfig>) => void;
  onClose: () => void;
  isDark: boolean;
  onPreview: (voice: string, sampleText: string) => void;
}

const SAMPLE_TEXT_DEFAULT = "你好，这是一段试听文字。Hello, this is a preview.";

export const PlayerSettingsPopover: React.FC<PlayerSettingsPopoverProps> = ({
  playbackRate,
  onPlaybackRateChange,
  stepThrough,
  onStepThroughChange,
  ttsEnabled,
  ttsSupported,
  onToggleTTS,
  config,
  onUpdate,
  onClose,
  isDark,
  onPreview,
}) => {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [sampleText, setSampleText] = useState(SAMPLE_TEXT_DEFAULT);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (target?.closest(".playbook-player__settings-anchor")) return;
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const bg = isDark ? "#161b22" : "#ffffff";
  const border = isDark ? "#30363d" : "#d0d7de";
  const text = isDark ? "#c9d1d9" : "#24292f";
  const muted = isDark ? "#8b949e" : "#6e7781";
  const inputBg = isDark ? "#0d1117" : "#f6f8fa";
  const accent = isDark ? "#4de8b0" : "#00896e";

  return (
    <div
      ref={popoverRef}
      className="playbook-player__settings-popover"
      style={{
        "--player-settings-bg": bg,
        "--player-settings-border": border,
        "--player-settings-text": text,
        "--player-settings-muted": muted,
        "--player-settings-input": inputBg,
        "--player-settings-accent": accent,
      } as React.CSSProperties}
    >
      <div className="playbook-player__settings-section">
        <div className="playbook-player__settings-label">播放速度</div>
        <div className="playbook-player__settings-speed-row">
          {SPEED_STEPS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onPlaybackRateChange(s)}
              className={playbackRate === s ? "is-active" : ""}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>

      <div className="playbook-player__settings-section">
        <div className="playbook-player__settings-row">
          <span>播放模式</span>
          <button
            type="button"
            className={`playbook-player__settings-toggle${stepThrough ? " is-active" : ""}`}
            onClick={() => onStepThroughChange(!stepThrough)}
          >
            {stepThrough ? "步进" : "连播"}
          </button>
        </div>
        <div className="playbook-player__settings-row">
          <span>语音朗读</span>
          <button
            type="button"
            className={`playbook-player__settings-toggle${ttsEnabled ? " is-active" : ""}`}
            onClick={onToggleTTS}
            disabled={!ttsSupported}
          >
            {ttsEnabled ? <SpeakerOnSVG /> : <SpeakerOffSVG />}
            {ttsEnabled ? "开启" : "关闭"}
          </button>
        </div>
      </div>

      <div className="playbook-player__settings-section">
        <div className="playbook-player__settings-label">语音后端</div>
        <div className="playbook-player__settings-choice-row">
          {(["system", "openai"] as const).map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => onUpdate({ backend: b })}
              className={config.backend === b ? "is-active" : ""}
            >
              {b === "system" ? "系统语音" : "OpenAI API"}
            </button>
          ))}
        </div>
      </div>

      {/* OpenAI backend now routes through the server-side proxy
         (POST /api/v1/tts/speech) so the player never stores an API key.
         The Base URL / Model / Key inputs that used to live here are gone
         on purpose — issue #40. */}
      {config.backend === "openai" && (
        <div
          className="playbook-player__settings-note"
          style={{
            border: `1px dashed ${border}`,
          }}
        >
          通过服务端代理调用，API Key 由管理员在后端配置（METAVIEW_TTS_API_KEY）。
        </div>
      )}

      {/* Voice picker (OpenAI only) */}
      {config.backend === "openai" && (
        <div>
          <div className="playbook-player__settings-label">
            音色 <span style={{ color: text }}>{config.voice === AUTO_VOICE ? "跟随学科" : config.voice}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 180, overflowY: "auto" }}>
            <button
              type="button"
              onClick={() => onUpdate({ voice: AUTO_VOICE })}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "5px 8px",
                borderRadius: 5,
                border: `1px solid ${config.voice === AUTO_VOICE ? accent : border}`,
                background: config.voice === AUTO_VOICE ? `${accent}18` : "transparent",
                color: config.voice === AUTO_VOICE ? accent : text,
                fontSize: 12,
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <span>跟随学科自动推荐</span>
            </button>
            {OPENAI_VOICES.map((v) => (
              <div
                key={v.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "4px 8px",
                  borderRadius: 5,
                  border: `1px solid ${config.voice === v.id ? accent : border}`,
                  background: config.voice === v.id ? `${accent}18` : "transparent",
                }}
              >
                <button
                  type="button"
                  onClick={() => onUpdate({ voice: v.id })}
                  style={{
                    flex: 1,
                    background: "transparent",
                    border: "none",
                    color: config.voice === v.id ? accent : text,
                    fontSize: 12,
                    fontWeight: config.voice === v.id ? 600 : 400,
                    textAlign: "left",
                    cursor: "pointer",
                    padding: 0,
                  }}
                  title={v.description}
                >
                  {v.label}
                  <span style={{ color: muted, fontWeight: 400, marginLeft: 6 }}>{v.description}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onPreview(v.id, sampleText)}
                  style={{
                    background: "transparent",
                    border: `1px solid ${border}`,
                    borderRadius: 4,
                    color: muted,
                    fontSize: 11,
                    padding: "2px 6px",
                    cursor: "pointer",
                  }}
                >
                  ⏵ 试听
                </button>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 6 }}>
            <div style={{ fontSize: 11, color: muted, marginBottom: 3 }}>试听文字</div>
            <input
              type="text"
              value={sampleText}
              onChange={(e) => setSampleText(e.target.value)}
              placeholder={SAMPLE_TEXT_DEFAULT}
              style={{
                width: "100%",
                padding: "5px 8px",
                background: inputBg,
                border: `1px solid ${border}`,
                borderRadius: 5,
                color: text,
                fontSize: 12,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>
        </div>
      )}

      <div className="playbook-player__settings-section">
        <div className="playbook-player__settings-label">
          语速 <span style={{ color: text }}>{config.rate.toFixed(1)}×</span>
        </div>
        <input
          type="range"
          min="0.5"
          max="2.0"
          step="0.1"
          value={config.rate}
          onChange={(e) => onUpdate({ rate: parseFloat(e.target.value) })}
          className="playbook-player__settings-range"
        />
      </div>

      <div className="playbook-player__settings-footnote">
        设置存储在本地浏览器中
      </div>
    </div>
  );
};
