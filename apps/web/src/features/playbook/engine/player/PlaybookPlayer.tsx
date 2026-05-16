import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Player } from "@remotion/player";
import type { PlayerRef } from "@remotion/player";
import type { PlaybookScript } from "../types";
import { usePlaybookController } from "./usePlaybookController";
import { PlaybookComposition } from "../composition/PlaybookComposition";
import { PLAYBOOK_DEFAULTS } from "../../../../shared/config/constants";
import { useTTS, OPENAI_VOICES, AUTO_VOICE, resolveVoice } from "./useTTS";
import type { TTSConfig } from "./useTTS";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";
import { resolveNarrationTemplate } from "./resolveNarrationTemplate";
import { useResolvedScript, type ScriptOverrides } from "./useResolvedScript";
import { resolveCodePanelOverlay } from "./resolveCodePanelOverlay";
import { CodeHighlightRenderer } from "../renderers/CodeHighlightRenderer";
import { getParamPanel } from "../param-panels/registry";
import type { ParamPanelProps } from "../param-panels/types";

// ── ParamPanelSlot (static component — resolves domain panel from registry) ──

function ParamPanelSlot({ domain, ...props }: ParamPanelProps & { domain: string }) {
  const Panel = getParamPanel(domain);
  if (!Panel) return null;
  return React.createElement(Panel, props);
}

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
  onPreview: (voice: string, sampleText: string) => void;
}

const SAMPLE_TEXT_DEFAULT = "你好，这是一段试听文字。Hello, this is a preview.";
const SPEED_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2];

const TTSConfigPopover: React.FC<TTSPopoverProps> = ({ config, onUpdate, onClose, isDark, onPreview }) => {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [sampleText, setSampleText] = useState(SAMPLE_TEXT_DEFAULT);

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

      {/* OpenAI backend now routes through the server-side proxy
         (POST /api/v1/tts/speech) so the player never stores an API key.
         The Base URL / Model / Key inputs that used to live here are gone
         on purpose — issue #40. */}
      {config.backend === "openai" && (
        <div
          style={{
            fontSize: 11,
            color: muted,
            padding: "6px 8px",
            border: `1px dashed ${border}`,
            borderRadius: 5,
            lineHeight: 1.45,
          }}
        >
          通过服务端代理调用，API Key 由管理员在后端配置（METAVIEW_TTS_API_KEY）。
        </div>
      )}

      {/* Voice picker (OpenAI only) */}
      {config.backend === "openai" && (
        <div>
          <div style={{ fontSize: 11, color: muted, marginBottom: 6 }}>
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
  /**
   * Total frames for the bar-swap animation. Sourced from
   * `TweakValues.swapFrames` so the design-tweaks panel controls it live.
   * Defaults to 24 to match `TWEAK_DEFAULTS.swapFrames` /
   * `DEFAULT_SWAP_FRAMES` when the prop is omitted.
   */
  swapDurationFrames?: number;
  onOpenExport?: () => void;
}

export const PlaybookPlayer: React.FC<PlaybookPlayerProps> = ({
  script: baseScript,
  theme = "dark",
  swapDurationFrames = 24,
  onOpenExport,
}) => {
  const playerRef = useRef<PlayerRef | null>(null);

  // ── Tweak state (frontend-only hot reload) ─────────────────────────────
  const [overrides, setOverrides] = useState<ScriptOverrides>({});
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showSubtitles, setShowSubtitles] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [codePanelOpen, setCodePanelOpen] = useState(true);
  const [paramPanelOpen, setParamPanelOpen] = useState(false);
  const script = useResolvedScript(baseScript, overrides);
  const hasDomainPanel = getParamPanel(baseScript.domain) !== null;

  const tts = useTTS();
  // Push the playbook domain into useTTS so AUTO-voice resolution still
  // works when callers omit options.voice. See issue #52.
  useEffect(() => {
    tts.setDomain(script.domain);
  }, [tts, script.domain]);

  const {
    currentStepIndex,
    canGoPrev,
    canGoNext,
    stepThrough,
    setStepThrough,
    goToStep,
    prev,
    next,
  } = usePlaybookController(script, playerRef, {
    isSpeaking: tts.speaking,
    ttsEnabled: tts.enabled,
  });

  const codeOverlay = useMemo(
    () => resolveCodePanelOverlay(script, currentStepIndex),
    [script, currentStepIndex],
  );

  // Show code panel slot for algorithm domain, or any script that has code highlights.
  const isAlgorithmDomain = script.domain === "algorithm";
  const hasAnyCode = useMemo(
    () => script.steps.some((s) => s.code_highlight != null),
    [script.steps],
  );
  const showCodePanelSlot = isAlgorithmDomain || hasAnyCode;

  const [isPlaying, setIsPlaying] = useState(false);
  const [showTTSConfig, setShowTTSConfig] = useState(false);
  // Ref so auto-narrate effect always calls the latest speak function without re-registering.
  const ttsRef = useRef(tts);
  useLayoutEffect(() => { ttsRef.current = tts; });

  // Keep isPlaying in sync with actual player state (controller may pause mid-step).
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    player.addEventListener("play", onPlay);
    player.addEventListener("pause", onPause);
    return () => {
      player.removeEventListener("play", onPlay);
      player.removeEventListener("pause", onPause);
    };
  });

  const handlePlayPause = useCallback(() => {
    if (isPlaying) {
      playerRef.current?.pause();
    } else {
      playerRef.current?.play();
    }
  }, [isPlaying]);

  const handleReset = useCallback(() => {
    playerRef.current?.seekTo(0);
    goToStep(0);
    setIsPlaying(false);
  }, [goToStep]);

  const handleSpeedUp = useCallback(() => {
    setPlaybackRate((r) => {
      const idx = SPEED_STEPS.indexOf(r);
      return idx < SPEED_STEPS.length - 1 ? SPEED_STEPS[idx + 1] : r;
    });
  }, []);
  const handleSpeedDown = useCallback(() => {
    setPlaybackRate((r) => {
      const idx = SPEED_STEPS.indexOf(r);
      return idx > 0 ? SPEED_STEPS[idx - 1] : r;
    });
  }, []);

  useKeyboardShortcuts({
    onPlayPause: handlePlayPause,
    onPrev: prev,
    onNext: next,
    onReset: handleReset,
    onToggleTTS: tts.toggle,
    onToggleSubtitles: () => setShowSubtitles((v) => !v),
    onSpeedUp: handleSpeedUp,
    onSpeedDown: handleSpeedDown,
    onOpenExport: onOpenExport,
    onEscape: () => setShowTTSConfig(false),
  });

  // Auto-narrate on step change.
  // ttsRef always holds the latest tts object, so no stale-closure risk on speak/backend changes.
  useEffect(() => {
    if (!ttsRef.current.enabled) return;
    const step = script.steps[currentStepIndex];
    if (!step) return;
    const text =
      step.narration_template && step.tokens.length > 0
        ? resolveNarrationTemplate(step.narration_template, step.tokens)
        : step.voiceover_text;
    if (!text.trim()) return;
    const voice = resolveVoice(ttsRef.current.config.voice, script.domain);
    const rate = step.tts_rate ?? ttsRef.current.config.rate;
    ttsRef.current.speak(text, { voice, rate });
  }, [currentStepIndex, script]); // script included so step data is never stale

  const handleVoicePreview = useCallback(
    (voice: string, sampleText: string) => {
      tts.speak(sampleText, { voice });
    },
    [tts],
  );

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
      {/* Step list sidebar (collapsible) */}
      <aside
        style={{
          width: sidebarOpen ? 220 : 36,
          flexShrink: 0,
          background: sidebarBg,
          borderRight: `1px solid ${isDark ? "#21262d" : "#d0d7de"}`,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          transition: "width 0.2s",
          position: "relative",
        }}
      >
        <button
          onClick={() => setSidebarOpen((v) => !v)}
          title={sidebarOpen ? "折叠步骤栏" : "展开步骤栏"}
          style={{
            position: "absolute",
            top: 8,
            right: 4,
            zIndex: 2,
            border: "none",
            background: "transparent",
            color: sidebarMuted,
            cursor: "pointer",
            fontSize: 14,
            padding: "2px 6px",
            borderRadius: 4,
          }}
        >
          {sidebarOpen ? "‹" : "›"}
        </button>
        {!sidebarOpen && (
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              fontFamily: "IBM Plex Mono, monospace",
              fontSize: 11,
              color: activeItemBorder,
            }}
          >
            <span style={{ fontWeight: 700, fontSize: 14 }}>
              {String(currentStepIndex + 1).padStart(2, "0")}
            </span>
            <span style={{ color: sidebarMuted, fontSize: 10 }}>
              / {script.steps.length}
            </span>
          </div>
        )}
        {sidebarOpen && (
        <>
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
        </>
        )}
      </aside>

      {/* Main content: stage + code panel + controls + tweaks */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
          <div className="playbook-player__stage" style={{ flex: 1, minWidth: 0 }}>
            <Player
              ref={playerRef}
              component={PlaybookComposition}
              inputProps={{ script, theme, showSubtitles, swapDurationFrames }}
              durationInFrames={script.total_frames}
              fps={script.fps}
              compositionWidth={PLAYBOOK_DEFAULTS.COMPOSITION_WIDTH}
              compositionHeight={PLAYBOOK_DEFAULTS.COMPOSITION_HEIGHT}
              style={{ width: "100%", aspectRatio: "16/9" }}
              playbackRate={playbackRate}
              clickToPlay={false}
            />
          </div>
          {showCodePanelSlot && codePanelOpen && (
            <div
              style={{
                width: 320,
                flexShrink: 0,
                borderLeft: `1px solid ${isDark ? "#21262d" : "#d0d7de"}`,
                position: "relative",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <button
                onClick={() => setCodePanelOpen(false)}
                title="折叠代码面板"
                style={{
                  position: "absolute",
                  top: 4,
                  left: 4,
                  zIndex: 2,
                  border: "none",
                  background: "transparent",
                  color: sidebarMuted,
                  cursor: "pointer",
                  fontSize: 14,
                  padding: "2px 6px",
                }}
              >
                ›
              </button>
              {codeOverlay ? (
                <CodeHighlightRenderer overlay={codeOverlay} theme={theme} />
              ) : (
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexDirection: "column",
                    gap: 8,
                    color: sidebarMuted,
                    fontSize: 12,
                    fontFamily: "system-ui, sans-serif",
                    padding: 16,
                    textAlign: "center",
                  }}
                >
                  <span style={{ fontSize: 24 }}>{"</>"}</span>
                  <span>上传代码文件后此处显示同步高亮</span>
                </div>
              )}
            </div>
          )}
          {showCodePanelSlot && !codePanelOpen && (
            <button
              onClick={() => setCodePanelOpen(true)}
              title="展开代码面板"
              style={{
                width: 24,
                flexShrink: 0,
                borderLeft: `1px solid ${isDark ? "#21262d" : "#d0d7de"}`,
                background: "transparent",
                color: sidebarMuted,
                cursor: "pointer",
                fontSize: 14,
                writingMode: "vertical-rl",
                padding: "8px 0",
              }}
            >
              ‹ 代码
            </button>
          )}
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
                onPreview={handleVoicePreview}
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

        {/* Player toolbar — speed + subtitles (shared across all domains) */}
        <div
          className="playbook-tweakstrip"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            padding: "8px 14px",
            borderTop: `1px solid ${isDark ? "#21262d" : "#d0d7de"}`,
            background: isDark ? "rgba(15,17,22,0.7)" : "rgba(247,249,252,0.85)",
            fontSize: 12,
            color: isDark ? "#c9d1d9" : "#24292f",
          }}
        >
          <div style={{ flex: 1 }} />
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 11, color: isDark ? "#8b949e" : "#6e7781" }}>速度</span>
            {SPEED_STEPS.map((s) => (
              <button
                key={s}
                onClick={() => setPlaybackRate(s)}
                style={{
                  border: `1px solid ${playbackRate === s ? (isDark ? "#4de8b0" : "#00896e") : (isDark ? "#30363d" : "#d0d7de")}`,
                  background: playbackRate === s ? `${isDark ? "#4de8b0" : "#00896e"}1a` : "transparent",
                  color: playbackRate === s ? (isDark ? "#4de8b0" : "#00896e") : (isDark ? "#8b949e" : "#6e7781"),
                  borderRadius: 5,
                  padding: "2px 8px",
                  cursor: "pointer",
                  fontSize: 11,
                  fontWeight: playbackRate === s ? 600 : 400,
                }}
              >
                {s}×
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowSubtitles((v) => !v)}
            style={{
              border: `1px solid ${showSubtitles ? (isDark ? "#4de8b0" : "#00896e") : (isDark ? "#30363d" : "#d0d7de")}`,
              background: showSubtitles ? `${isDark ? "#4de8b0" : "#00896e"}1a` : "transparent",
              color: showSubtitles ? (isDark ? "#4de8b0" : "#00896e") : (isDark ? "#8b949e" : "#6e7781"),
              borderRadius: 5,
              padding: "2px 10px",
              cursor: "pointer",
              fontSize: 11,
            }}
          >
            {showSubtitles ? "字幕开" : "字幕关"}
          </button>
        </div>

        {/* Domain-specific param panel — looked up from registry */}
        {hasDomainPanel && (
          <div
            className="playbook-parampanel"
            style={{
              flexShrink: 0,
              borderTop: `1px solid ${isDark ? "#21262d" : "#d0d7de"}`,
              background: isDark ? "#0f1117" : "#f7f9fc",
            }}
          >
            <button
              onClick={() => setParamPanelOpen((v) => !v)}
              aria-expanded={paramPanelOpen}
              style={{
                width: "100%",
                textAlign: "left",
                padding: "7px 16px",
                border: "none",
                background: "transparent",
                color: isDark ? "#c9d1d9" : "#24292f",
                cursor: "pointer",
                fontSize: 12,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span>参数面板</span>
              <span style={{ marginLeft: "auto", opacity: 0.7 }}>{paramPanelOpen ? "▾" : "▸"}</span>
            </button>
            {paramPanelOpen && (
              <div style={{ maxHeight: "min(420px, 46vh)", overflowY: "auto" }}>
                <ParamPanelSlot
                  domain={baseScript.domain}
                  script={baseScript}
                  overrides={overrides}
                  onOverridesChange={setOverrides}
                  isDark={isDark}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
