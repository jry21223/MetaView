import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Player } from "@remotion/player";
import type { PlayerRef } from "@remotion/player";
import type { DirectorScript, PlaybookScript } from "../types";
import { usePlaybookController } from "./usePlaybookController";
import { PlaybookComposition } from "../composition/PlaybookComposition";
import { PLAYBOOK_DEFAULTS } from "../../../../shared/config/constants";
import { useTTS, OPENAI_VOICES, AUTO_VOICE, resolveVoice } from "./useTTS";
import type { TTSConfig } from "./useTTS";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";
import { resolveNarrationTemplate } from "./resolveNarrationTemplate";
import { useResolvedScript, type ScriptOverrides } from "./useResolvedScript";
import { resolveCodePanelOverlay } from "./resolveCodePanelOverlay";
import { resolveInitialPreviewFrame, resolvePlayerTimelineKey } from "./previewFrame";
import { CodeHighlightRenderer } from "../renderers/CodeHighlightRenderer";
import { domainCapability } from "../domainCapabilities";
import { getParamPanel } from "../param-panels/registry";
import type { ParamPanelProps } from "../param-panels/types";
import { resolveDirectorVoiceover } from "../director";

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

// ── Player Settings Popover ────────────────────────────────────────────────

interface PlayerSettingsPopoverProps {
  playbackRate: number;
  onPlaybackRateChange: (rate: number) => void;
  showSubtitles: boolean;
  onShowSubtitlesChange: (next: boolean) => void;
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
const SPEED_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2];

const PlayerSettingsPopover: React.FC<PlayerSettingsPopoverProps> = ({
  playbackRate,
  onPlaybackRateChange,
  showSubtitles,
  onShowSubtitlesChange,
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
          <span>字幕</span>
          <button
            type="button"
            className={`playbook-player__settings-toggle${showSubtitles ? " is-active" : ""}`}
            onClick={() => onShowSubtitlesChange(!showSubtitles)}
          >
            {showSubtitles ? "开启" : "关闭"}
          </button>
        </div>
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

// ── Main component ─────────────────────────────────────────────────────────

interface WorkbenchNavItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  active?: boolean;
  onSelect: () => void;
}

interface PlaybookPlayerProps {
  script: PlaybookScript;
  director?: DirectorScript | null;
  theme?: "dark" | "light";
  /**
   * Total frames for the bar-swap animation. Sourced from
   * `TweakValues.swapFrames` so the design-tweaks panel controls it live.
   * Defaults to 24 to match `TWEAK_DEFAULTS.swapFrames` /
   * `DEFAULT_SWAP_FRAMES` when the prop is omitted.
   */
  swapDurationFrames?: number;
  onOpenExport?: () => void;
  followupSlot?: React.ReactNode;
  relatedSlot?: React.ReactNode;
  workbenchNavItems?: WorkbenchNavItem[];
}

export const PlaybookPlayer: React.FC<PlaybookPlayerProps> = ({
  script: baseScript,
  director = null,
  theme = "dark",
  swapDurationFrames = 24,
  onOpenExport,
  followupSlot,
  relatedSlot,
  workbenchNavItems,
}) => {
  const playerRef = useRef<PlayerRef | null>(null);
  const railNavRef = useRef<HTMLDivElement | null>(null);

  // ── Tweak state (frontend-only hot reload) ─────────────────────────────
  const [overrides, setOverrides] = useState<ScriptOverrides>({});
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showSubtitles, setShowSubtitles] = useState(true);
  const [railNavOpen, setRailNavOpen] = useState(false);
  const script = useResolvedScript(baseScript, overrides);
  const capability = useMemo(() => domainCapability(script.domain), [script.domain]);
  const hasDomainPanel = getParamPanel(baseScript.domain) !== null;
  const initialPreviewFrame = useMemo(() => resolveInitialPreviewFrame(script), [script]);
  const playerTimelineKey = useMemo(() => resolvePlayerTimelineKey(baseScript), [baseScript]);

  useEffect(() => {
    const id = setTimeout(() => {
      setOverrides((current) => (Object.keys(current).length > 0 ? {} : current));
    }, 0);
    return () => clearTimeout(id);
  }, [baseScript]);

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

  const safeStepIndex = script.steps.length
    ? Math.min(currentStepIndex, script.steps.length - 1)
    : 0;
  const codeOverlay = useMemo(
    () => resolveCodePanelOverlay(script, safeStepIndex),
    [script, safeStepIndex],
  );

  // Show code panel slot for algorithm domain, or any script that has code highlights.
  const isAlgorithmDomain = script.domain === "algorithm";
  const hasAnyCode = useMemo(
    () => script.steps.some((s) => s.code_highlight != null),
    [script.steps],
  );
  const showCodePanelSlot = isAlgorithmDomain || hasAnyCode;

  const [isPlaying, setIsPlaying] = useState(false);
  const [showPlayerSettings, setShowPlayerSettings] = useState(false);
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
    onEscape: () => {
      setShowPlayerSettings(false);
      setRailNavOpen(false);
    },
  });

  useEffect(() => {
    if (!railNavOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (railNavRef.current?.contains(event.target as Node)) return;
      setRailNavOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setRailNavOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [railNavOpen]);

  // Auto-narrate on step change.
  // ttsRef always holds the latest tts object, so no stale-closure risk on speak/backend changes.
  useEffect(() => {
    if (!ttsRef.current.enabled) return;
    const step = script.steps[safeStepIndex];
    if (!step) return;
    const fallback =
      step.narration_template && step.tokens.length > 0
        ? resolveNarrationTemplate(step.narration_template, step.tokens)
        : step.voiceover_text;
    const text = resolveDirectorVoiceover(director, step, fallback);
    if (!text.trim()) return;
    const voice = resolveVoice(ttsRef.current.config.voice, script.domain);
    const rate = step.tts_rate ?? ttsRef.current.config.rate;
    ttsRef.current.speak(text, { voice, rate });
  }, [safeStepIndex, director, script]); // script included so step data is never stale

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

  const currentStep = script.steps[safeStepIndex];
  const isDark = theme === "dark";
  const currentNarrationFallback =
    currentStep.narration_template && currentStep.tokens.length > 0
      ? resolveNarrationTemplate(currentStep.narration_template, currentStep.tokens)
      : currentStep.voiceover_text;
  const currentNarration = resolveDirectorVoiceover(
    director,
    currentStep,
    currentNarrationFallback,
  );
  const hasWorkbenchNav = !!workbenchNavItems?.length;

  return (
    <div className="playbook-player playbook-player--minimal" data-theme={theme}>
      <aside className="playbook-player__rail" aria-label="Lesson steps">
        {hasWorkbenchNav ? (
          <div className="playbook-player__rail-nav" ref={railNavRef}>
            <button
              type="button"
              className="playbook-player__rail-mark playbook-player__rail-nav-trigger"
              aria-label={railNavOpen ? "关闭任务导航" : "打开任务导航"}
              aria-haspopup="menu"
              aria-expanded={railNavOpen}
              onClick={() => setRailNavOpen((value) => !value)}
            >
              <span />
              <span />
              <span />
            </button>
            {railNavOpen && (
              <div
                className="playbook-player__rail-nav-menu"
                role="menu"
                aria-label="任务导航"
              >
                {workbenchNavItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="menuitem"
                    className={`playbook-player__rail-nav-item${item.active ? " is-active" : ""}`}
                    onClick={() => {
                      item.onSelect();
                      setRailNavOpen(false);
                    }}
                  >
                    {item.icon && (
                      <span className="playbook-player__rail-nav-icon" aria-hidden="true">
                        {item.icon}
                      </span>
                    )}
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="playbook-player__rail-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        )}
        <div className="playbook-player__rail-current" aria-hidden="true">
          <span>{String(safeStepIndex + 1).padStart(2, "0")}</span>
          <small>{String(script.steps.length).padStart(2, "0")}</small>
        </div>
        <div className="playbook-player__rail-panel">
          <div className="playbook-player__rail-head">
            <span>{script.domain}</span>
            <strong>{script.title}</strong>
          </div>
          <div className="playbook-player__rail-steps">
            {script.steps.map((step, i) => (
              <button
                key={step.step_id}
                type="button"
                className={`playbook-player__rail-step${i === safeStepIndex ? " is-active" : ""}`}
                onClick={() => goToStep(i)}
              >
                <span>{String(i + 1).padStart(2, "0")}</span>
                <strong>{step.title}</strong>
              </button>
            ))}
          </div>
        </div>
      </aside>

      <div className="playbook-player__workspace">
        <header className="playbook-player__header">
          <div className="playbook-player__brand">
            <span className="playbook-player__brand-mark" aria-hidden="true" />
            <span>MetaView</span>
          </div>
          <div className="playbook-player__lesson-title">
            <span>{script.domain}</span>
            <strong>{script.title}</strong>
          </div>
          <div className="playbook-player__header-actions">
            {onOpenExport && (
              <button
                type="button"
                className="playbook-player__ghost-btn"
                onClick={onOpenExport}
              >
                Export
              </button>
            )}
          </div>
        </header>

        <section className="playbook-player__stage-shell" aria-label="Lesson animation">
          <div className="playbook-player__stage">
            {capability.message && capability.support !== "full" && (
              <div
                className="playbook-player__capability"
                title={capability.message}
              >
                <span>{capability.domain}</span>
                <span>{capability.support}</span>
              </div>
            )}
            <Player
              key={playerTimelineKey}
              ref={playerRef}
              component={PlaybookComposition}
              inputProps={{ script, director, theme, showSubtitles, swapDurationFrames }}
              durationInFrames={script.total_frames}
              fps={script.fps}
              compositionWidth={PLAYBOOK_DEFAULTS.COMPOSITION_WIDTH}
              compositionHeight={PLAYBOOK_DEFAULTS.COMPOSITION_HEIGHT}
              initialFrame={initialPreviewFrame}
              style={{ width: "100%", height: "100%" }}
              playbackRate={playbackRate}
              clickToPlay={false}
            />
          </div>
        </section>

        <div className="playbook-player__controls">
          <button
            className="playbook-ctrl-btn playbook-ctrl-btn--play"
            onClick={handlePlayPause}
            aria-label={isPlaying ? "暂停" : "播放"}
          >
            {isPlaying ? "⏸" : "▶"}
          </button>

          <div className="playbook-player__progress" role="group" aria-label="Lesson steps">
            {script.steps.map((step, i) => (
              <button
                key={step.step_id}
                type="button"
                className={i === safeStepIndex ? "is-active" : ""}
                onClick={() => goToStep(i)}
                title={step.title}
                aria-label={`Step ${i + 1}: ${step.title}`}
              />
            ))}
          </div>

          <div className="playbook-player__control-actions">
            <div className="playbook-player__settings-anchor">
              <button
                className="playbook-ctrl-btn"
                onClick={() => setShowPlayerSettings((v) => !v)}
                title="播放器设置"
                aria-label="播放器设置"
                type="button"
              >
                <SettingsSVG />
              </button>
              {showPlayerSettings && (
                <PlayerSettingsPopover
                  playbackRate={playbackRate}
                  onPlaybackRateChange={setPlaybackRate}
                  showSubtitles={showSubtitles}
                  onShowSubtitlesChange={setShowSubtitles}
                  stepThrough={stepThrough}
                  onStepThroughChange={setStepThrough}
                  ttsEnabled={tts.enabled}
                  ttsSupported={tts.supported}
                  onToggleTTS={tts.toggle}
                  config={tts.config}
                  onUpdate={tts.updateConfig}
                  onClose={() => setShowPlayerSettings(false)}
                  isDark={isDark}
                  onPreview={handleVoicePreview}
                />
              )}
            </div>

            <button
              className="playbook-ctrl-btn"
              onClick={prev}
              disabled={!canGoPrev}
              aria-label="上一步"
              type="button"
            >
              &#8249;
            </button>

            <button
              className="playbook-ctrl-btn"
              onClick={next}
              disabled={!canGoNext}
              aria-label="下一步"
              type="button"
            >
              &#8250;
            </button>
          </div>
        </div>

        {showSubtitles && (
          <div className="playbook-player__caption">
            <span aria-hidden="true" />
            <p>{currentNarration || currentStep.title}</p>
          </div>
        )}
      </div>

      <aside className="playbook-player__console" aria-label="Learning console">
        {showCodePanelSlot && (
          <section className="playbook-player__console-card playbook-player__code-card">
            <div className="playbook-player__console-head">
              <span>Code Sync</span>
              <small>{codeOverlay?.language ?? "source"}</small>
            </div>
            <div className="playbook-player__code-body">
              {codeOverlay ? (
                <CodeHighlightRenderer overlay={codeOverlay} theme={theme} />
              ) : (
                <div className="playbook-player__code-empty">
                  <span>{"</>"}</span>
                  <p>Code highlights will sync here.</p>
                </div>
              )}
            </div>
          </section>
        )}

        {hasDomainPanel && (
          <section className="playbook-player__console-card playbook-player__params-card">
            <div className="playbook-player__console-head">
              <span>Params</span>
              <small>{baseScript.domain}</small>
            </div>
            <div className="playbook-player__param-body">
              <ParamPanelSlot
                domain={baseScript.domain}
                script={baseScript}
                overrides={overrides}
                onOverridesChange={setOverrides}
                isDark={theme === "dark"}
              />
            </div>
          </section>
        )}

        {followupSlot && (
          <section className="playbook-player__console-card playbook-player__follow-card">
            <div className="playbook-player__console-head">
              <span>Follow-up</span>
              <small>current step</small>
            </div>
            <div className="playbook-player__follow-body">{followupSlot}</div>
          </section>
        )}

        {relatedSlot ? (
          <section className="playbook-player__related-card" aria-label="Related study context">
            {relatedSlot}
          </section>
        ) : (
          <section className="playbook-player__related-row" aria-label="Related study context">
            <span>Related</span>
            <strong>{script.algorithm_id ?? "Study variants"}</strong>
            <small>›</small>
          </section>
        )}
      </aside>
    </div>
  );
};
