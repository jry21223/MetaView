import React, { useCallback, useEffect, useRef, useState } from "react";
import { Player } from "@remotion/player";
import type { PlayerRef } from "@remotion/player";
import type { PlaybookScript } from "../types";
import { usePlaybookController } from "./usePlaybookController";
import { PlaybookComposition } from "../composition/PlaybookComposition";
import { PLAYBOOK_DEFAULTS } from "../../../../shared/config/constants";
import { useTTS } from "./useTTS";
import type { TTSConfig } from "./useTTS";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";
import { resolveNarrationTemplate } from "./resolveNarrationTemplate";

// ── SVG icons ──────────────────────────────────────────────────────────────

const SpeakerOnSVG = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
       stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
    <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
  </svg>
);

const SpeakerOffSVG = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
       stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
    <line x1="23" y1="9" x2="17" y2="15"/>
    <line x1="17" y1="9" x2="23" y2="15"/>
  </svg>
);

const SettingsSVG = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
       stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06
             a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09
             A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83
             l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09
             A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83
             l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09
             a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83
             l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09
             a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
);

// ── TTS Config Popover ─────────────────────────────────────────────────────

interface TTSPopoverProps {
  config: TTSConfig;
  onUpdate: (patch: Partial<TTSConfig>) => void;
  onClose: () => void;
  isDark: boolean;
}

const TTSConfigPopover: React.FC<TTSPopoverProps> = ({ config, onUpdate, onClose, isDark }) => {
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
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
      className="tts-popover"
      style={{
        position: "absolute",
        bottom: "calc(100% + 8px)",
        right: 0,
        width: 260,
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: 8,
        padding: "12px 14px",
        boxShadow: isDark ? "0 8px 24px rgba(0,0,0,0.5)" : "0 8px 24px rgba(0,0,0,0.12)",
        zIndex: 100,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        fontFamily: "system-ui, sans-serif",
        fontSize: 13,
        color: text,
      }}
    >
      {/* Backend toggle */}
      <div>
        <div style={{ fontSize: 11, color: muted, marginBottom: 6 }}>语音后端</div>
        <div style={{ display: "flex", gap: 8 }}>
          {(["system", "openai"] as const).map((b) => (
            <button
              key={b}
              onClick={() => onUpdate({ backend: b })}
              style={{
                flex: 1,
                padding: "4px 0",
                borderRadius: 5,
                border: `1px solid ${config.backend === b ? accent : border}`,
                background: config.backend === b ? `${accent}18` : "transparent",
                color: config.backend === b ? accent : muted,
                cursor: "pointer",
                fontSize: 12,
                fontWeight: config.backend === b ? 600 : 400,
              }}
            >
              {b === "system" ? "系统语音" : "OpenAI API"}
            </button>
          ))}
        </div>
      </div>

      {/* OpenAI-specific fields */}
      {config.backend === "openai" && (
        <>
          {(
            [
              { key: "apiKey", label: "API Key", type: "password", placeholder: "sk-…" },
              { key: "baseUrl", label: "Base URL", type: "text", placeholder: "https://api.openai.com/v1" },
              { key: "model", label: "Model", type: "text", placeholder: "tts-1" },
              { key: "voice", label: "Voice", type: "text", placeholder: "alloy" },
            ] as const
          ).map(({ key, label, type, placeholder }) => (
            <div key={key}>
              <div style={{ fontSize: 11, color: muted, marginBottom: 3 }}>{label}</div>
              <input
                type={type}
                value={config[key]}
                onChange={(e) => onUpdate({ [key]: e.target.value } as Partial<TTSConfig>)}
                placeholder={placeholder}
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
          ))}
        </>
      )}

      {/* Rate slider */}
      <div>
        <div style={{ fontSize: 11, color: muted, marginBottom: 3 }}>
          语速 <span style={{ color: text }}>{config.rate.toFixed(1)}×</span>
        </div>
        <input
          type="range"
          min="0.5"
          max="2.0"
          step="0.1"
          value={config.rate}
          onChange={(e) => onUpdate({ rate: parseFloat(e.target.value) })}
          style={{ width: "100%", accentColor: accent }}
        />
      </div>

      <div style={{ fontSize: 10, color: muted, textAlign: "center", marginTop: 2 }}>
        设置存储在本地浏览器中
      </div>
    </div>
  );
};

// ── Main component ─────────────────────────────────────────────────────────

interface PlaybookPlayerProps {
  script: PlaybookScript;
  theme?: "dark" | "light";
}

export const PlaybookPlayer: React.FC<PlaybookPlayerProps> = ({ script, theme = "dark" }) => {
  const playerRef = useRef<PlayerRef | null>(null);
  const {
    currentStepIndex,
    canGoPrev,
    canGoNext,
    stepThrough,
    setStepThrough,
    goToStep,
    prev,
    next,
  } = usePlaybookController(script, playerRef);

  const [isPlaying, setIsPlaying] = useState(false);
  const [showTTSConfig, setShowTTSConfig] = useState(false);
  const tts = useTTS();

  const handlePlayPause = useCallback(() => {
    if (isPlaying) {
      playerRef.current?.pause();
    } else {
      playerRef.current?.play();
    }
    setIsPlaying((p) => !p);
  }, [isPlaying]);

  useKeyboardShortcuts({
    onPlayPause: handlePlayPause,
    onPrev: prev,
    onNext: next,
    onToggleTTS: tts.toggle,
  });

  // Auto-narrate on step change
  useEffect(() => {
    if (!tts.enabled) return;
    const step = script.steps[currentStepIndex];
    if (!step) return;
    const text =
      step.narration_template && step.tokens.length > 0
        ? resolveNarrationTemplate(step.narration_template, step.tokens)
        : step.voiceover_text;
    if (text.trim()) tts.speak(text);
  }, [currentStepIndex, tts.enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!script.steps.length) {
    return (
      <div className="playbook-player-empty">
        <p>No steps in playbook</p>
      </div>
    );
  }

  const currentStep = script.steps[currentStepIndex];
  const isDark = theme === "dark";
  const sidebarBg = isDark ? "#0f1117" : "#f0f2f5";
  const sidebarText = isDark ? "#c9d1d9" : "#24292f";
  const sidebarMuted = isDark ? "#6e7681" : "#6e7781";
  const activeItemBg = isDark ? "rgba(77,232,176,0.10)" : "rgba(0,120,100,0.08)";
  const activeItemBorder = isDark ? "#4de8b0" : "#00896e";

  return (
    <div className="playbook-player" data-theme={theme} style={{ flexDirection: "row" }}>
      {/* Step list sidebar */}
      <aside
        style={{
          width: 220,
          flexShrink: 0,
          background: sidebarBg,
          borderRight: `1px solid ${isDark ? "#21262d" : "#d0d7de"}`,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "14px 14px 10px",
            borderBottom: `1px solid ${isDark ? "#21262d" : "#d0d7de"}`,
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontFamily: "IBM Plex Mono, monospace",
              color: activeItemBorder,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              marginBottom: 4,
            }}
          >
            {script.domain}
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: sidebarText, lineHeight: 1.3 }}>
            {script.title}
          </div>
        </div>

        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "8px 8px",
            display: "flex",
            flexDirection: "column",
            gap: 3,
          }}
        >
          {script.steps.map((step, i) => {
            const isActive = i === currentStepIndex;
            return (
              <button
                key={step.step_id}
                onClick={() => goToStep(i)}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                  padding: "7px 10px",
                  borderRadius: 6,
                  border: `1px solid ${isActive ? activeItemBorder : "transparent"}`,
                  background: isActive ? activeItemBg : "transparent",
                  cursor: "pointer",
                  textAlign: "left",
                  width: "100%",
                  transition: "background 0.15s, border-color 0.15s",
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    fontFamily: "IBM Plex Mono, monospace",
                    color: isActive ? activeItemBorder : sidebarMuted,
                    minWidth: 16,
                    marginTop: 1,
                    fontWeight: 600,
                  }}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span
                  style={{
                    fontSize: 12,
                    color: isActive ? sidebarText : sidebarMuted,
                    lineHeight: 1.4,
                    fontWeight: isActive ? 600 : 400,
                  }}
                >
                  {step.title}
                </span>
              </button>
            );
          })}
        </div>
      </aside>

      {/* Main content: stage + controls */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div className="playbook-player__stage">
          <Player
            ref={playerRef}
            component={PlaybookComposition}
            inputProps={{ script, theme }}
            durationInFrames={script.total_frames}
            fps={script.fps}
            compositionWidth={PLAYBOOK_DEFAULTS.COMPOSITION_WIDTH}
            compositionHeight={PLAYBOOK_DEFAULTS.COMPOSITION_HEIGHT}
            style={{ width: "100%", aspectRatio: "16/9" }}
            clickToPlay={false}
          />
        </div>

        <div className="playbook-player__controls">
          <button
            className="playbook-ctrl-btn"
            onClick={prev}
            disabled={!canGoPrev}
            aria-label="上一步"
          >
            &#8249;
          </button>

          <span className="playbook-step-indicator">
            {currentStepIndex + 1} / {script.steps.length}
          </span>

          <button
            className="playbook-ctrl-btn playbook-ctrl-btn--play"
            onClick={handlePlayPause}
            aria-label={isPlaying ? "暂停" : "播放"}
          >
            {isPlaying ? "⏸" : "▶"}
          </button>

          <span className="playbook-step-title">{currentStep?.title ?? ""}</span>

          <button
            className={`playbook-ctrl-btn playbook-ctrl-btn--mode ${stepThrough ? "is-active" : ""}`}
            onClick={() => setStepThrough(!stepThrough)}
            title={stepThrough ? "步进模式：每步自动暂停" : "连续播放"}
          >
            {stepThrough ? "步进" : "连播"}
          </button>

          {/* TTS speaker button */}
          <button
            className={`playbook-ctrl-btn${tts.enabled ? " is-active" : ""}${tts.speaking ? " is-speaking" : ""}`}
            onClick={tts.toggle}
            disabled={!tts.supported}
            title="T — 语音朗读"
            aria-label={tts.enabled ? "关闭语音" : "开启语音"}
          >
            {tts.enabled ? <SpeakerOnSVG /> : <SpeakerOffSVG />}
          </button>

          {/* TTS settings button + popover */}
          <div style={{ position: "relative" }}>
            <button
              className="playbook-ctrl-btn"
              onClick={() => setShowTTSConfig((v) => !v)}
              title="TTS 设置"
              aria-label="TTS 设置"
            >
              <SettingsSVG />
            </button>
            {showTTSConfig && (
              <TTSConfigPopover
                config={tts.config}
                onUpdate={tts.updateConfig}
                onClose={() => setShowTTSConfig(false)}
                isDark={isDark}
              />
            )}
          </div>

          <button
            className="playbook-ctrl-btn"
            onClick={next}
            disabled={!canGoNext}
            aria-label="下一步"
          >
            &#8250;
          </button>
        </div>
      </div>
    </div>
  );
};
