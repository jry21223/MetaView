import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Player } from "@remotion/player";
import type { PlayerRef } from "@remotion/player";
import type { CodeHighlightOverlay, DirectorScript, PlaybookScript } from "../types";
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
import { hasReplayableAlgorithmParams } from "../param-panels/AlgorithmParamPanel";
import { resolveDirectorVoiceover } from "../director";
import { emitNativeEvent } from "../../../../shared/native/emitNativeEvent";

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

const ExportSVG = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
       stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
       aria-hidden="true">
    <path d="M12 3v12" />
    <path d="m7 10 5 5 5-5" />
    <path d="M5 21h14" />
  </svg>
);

const MoreSVG = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
       stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
       aria-hidden="true">
    <circle cx="5" cy="12" r="1" />
    <circle cx="12" cy="12" r="1" />
    <circle cx="19" cy="12" r="1" />
  </svg>
);

const CloseSVG = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
       stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
       aria-hidden="true">
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);

function TopbarFoldIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      className="playbook-player__chrome-toggle-icon"
      data-testid={
        collapsed ? "topbar-toggle-icon-expand" : "topbar-toggle-icon-collapse"
      }
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.55"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path className="playbook-player__chrome-toggle-bar" d="M7 7.5h10" />
      {collapsed ? (
        <path className="playbook-player__chrome-toggle-chevron" d="m7.5 11 4.5 4.5 4.5-4.5" />
      ) : (
        <path className="playbook-player__chrome-toggle-chevron" d="m7.5 14 4.5-4.5 4.5 4.5" />
      )}
    </svg>
  );
}

export type PlaybookLayoutMode = "desktop" | "portrait";

type MobileTabKey = "narration" | "code" | "params" | "followup" | "more";

const PORTRAIT_QUERY = "(max-width: 680px) and (orientation: portrait)";
const CODE_CONTEXT_LINES = 2;

const MOBILE_TABS: Array<{ key: MobileTabKey; label: string }> = [
  { key: "narration", label: "讲解" },
  { key: "code", label: "代码" },
  { key: "params", label: "参数" },
  { key: "followup", label: "追问" },
  { key: "more", label: "更多" },
];

function resolveAutoLayoutMode(): PlaybookLayoutMode {
  if (typeof window === "undefined" || !window.matchMedia) return "desktop";
  return window.matchMedia(PORTRAIT_QUERY).matches ? "portrait" : "desktop";
}

function useAutoLayoutMode(layoutMode?: PlaybookLayoutMode): PlaybookLayoutMode {
  const [autoLayoutMode, setAutoLayoutMode] = useState<PlaybookLayoutMode>(
    resolveAutoLayoutMode,
  );

  useEffect(() => {
    if (layoutMode || typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia(PORTRAIT_QUERY);
    const update = () => {
      setAutoLayoutMode(query.matches ? "portrait" : "desktop");
    };
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, [layoutMode]);

  return layoutMode ?? autoLayoutMode;
}

interface ClippedCodeOverlay {
  overlay: CodeHighlightOverlay;
  lineNumberOffset: number;
  fromLine: number;
  toLine: number;
  totalLines: number;
}

function clipCodeOverlay(
  overlay: CodeHighlightOverlay | null,
  contextLines = CODE_CONTEXT_LINES,
): ClippedCodeOverlay | null {
  if (!overlay || overlay.lines.length === 0) return null;
  const anchor = Math.max(
    0,
    Math.min(
      overlay.lines.length - 1,
      overlay.active_line >= 0 ? overlay.active_line : overlay.active_lines[0] ?? 0,
    ),
  );
  const from = Math.max(0, anchor - contextLines);
  const to = Math.min(overlay.lines.length - 1, anchor + contextLines);
  const activeLines = overlay.active_lines
    .filter((line) => line >= from && line <= to)
    .map((line) => line - from);

  return {
    overlay: {
      ...overlay,
      lines: overlay.lines.slice(from, to + 1),
      active_line: anchor - from,
      active_lines: activeLines.length ? activeLines : [anchor - from],
    },
    lineNumberOffset: from,
    fromLine: from + 1,
    toLine: to + 1,
    totalLines: overlay.lines.length,
  };
}

function MobileSheet({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="playbook-player__mobile-sheet" role="dialog" aria-modal="true" aria-label={title}>
      <button
        type="button"
        className="playbook-player__mobile-sheet-backdrop"
        aria-label="关闭面板"
        onClick={onClose}
      />
      <div className="playbook-player__mobile-sheet-panel">
        <div className="playbook-player__mobile-sheet-head">
          <strong>{title}</strong>
          <button type="button" className="playbook-player__mobile-icon-btn" onClick={onClose} aria-label="关闭面板">
            <CloseSVG />
          </button>
        </div>
        <div className="playbook-player__mobile-sheet-body">{children}</div>
      </div>
    </div>
  );
}

// ── Player Settings Popover ────────────────────────────────────────────────

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
const SPEED_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2];

const PlayerSettingsPopover: React.FC<PlayerSettingsPopoverProps> = ({
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

// ── Main component ─────────────────────────────────────────────────────────

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
  showLearningConsole?: boolean;
  topbarCollapsed?: boolean;
  onToggleTopbar?: () => void;
  layoutMode?: PlaybookLayoutMode;
}

export const PlaybookPlayer: React.FC<PlaybookPlayerProps> = ({
  script: baseScript,
  director = null,
  theme = "dark",
  swapDurationFrames = 24,
  onOpenExport,
  followupSlot,
  relatedSlot,
  showLearningConsole = true,
  topbarCollapsed = false,
  onToggleTopbar,
  layoutMode,
}) => {
  const playerRef = useRef<PlayerRef | null>(null);
  const resolvedLayoutMode = useAutoLayoutMode(layoutMode);
  const isPortraitLayout = resolvedLayoutMode === "portrait";

  // ── Tweak state (frontend-only hot reload) ─────────────────────────────
  const [overrides, setOverrides] = useState<ScriptOverrides>({});
  const [playbackRate, setPlaybackRate] = useState(1);
  const [mobileTab, setMobileTab] = useState<MobileTabKey>("narration");
  const [mobileSheet, setMobileSheet] = useState<MobileTabKey | null>(null);
  const script = useResolvedScript(baseScript, overrides);
  const capability = useMemo(() => domainCapability(script.domain), [script.domain]);
  const hasDomainPanel = useMemo(() => {
    if (getParamPanel(baseScript.domain) === null) return false;
    if (baseScript.domain === "algorithm") {
      return hasReplayableAlgorithmParams(baseScript);
    }
    return true;
  }, [baseScript]);
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
  const mobileCodeOverlay = useMemo(
    () => clipCodeOverlay(codeOverlay),
    [codeOverlay],
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
    onSpeedUp: handleSpeedUp,
    onSpeedDown: handleSpeedDown,
    onOpenExport: onOpenExport,
    onEscape: () => {
      setShowPlayerSettings(false);
    },
  });

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
  const showMobileConsole = isPortraitLayout && showLearningConsole;
  const mobileSheetTitle =
    mobileSheet === "code"
      ? "全部代码"
      : mobileSheet === "params"
        ? "参数"
        : mobileSheet === "followup"
          ? "追问"
          : "更多";
  const selectMobileTab = (tab: MobileTabKey) => {
    setMobileTab(tab);
    emitNativeEvent("playbook.mobileTabSelected", { tab });
  };
  const openMobileSheet = (sheet: MobileTabKey) => {
    setMobileSheet(sheet);
    emitNativeEvent("playbook.mobileSheetOpened", { sheet });
  };
  const mobileTabPanel =
    mobileTab === "code" ? (
      <div className="playbook-player__mobile-panel playbook-player__mobile-code-panel">
        {mobileCodeOverlay ? (
          <>
            <div className="playbook-player__mobile-panel-head">
              <span>
                Lines {mobileCodeOverlay.fromLine}-{mobileCodeOverlay.toLine} / {mobileCodeOverlay.totalLines}
              </span>
              <button type="button" onClick={() => openMobileSheet("code")}>
                查看全部代码
              </button>
            </div>
            <div className="playbook-player__mobile-code-snippet">
              <CodeHighlightRenderer
                overlay={mobileCodeOverlay.overlay}
                theme={theme}
                lineNumberOffset={mobileCodeOverlay.lineNumberOffset}
              />
            </div>
          </>
        ) : (
          <div className="playbook-player__mobile-empty">当前步骤没有代码同步片段。</div>
        )}
      </div>
    ) : mobileTab === "params" ? (
      <div className="playbook-player__mobile-panel">
        {hasDomainPanel ? (
          <div className="playbook-player__mobile-param-panel">
            <ParamPanelSlot
              domain={baseScript.domain}
              script={baseScript}
              overrides={overrides}
              onOverridesChange={setOverrides}
              isDark={theme === "dark"}
            />
          </div>
        ) : (
          <div className="playbook-player__mobile-empty">当前步骤没有可调参数。</div>
        )}
      </div>
    ) : mobileTab === "followup" ? (
      <div className="playbook-player__mobile-panel">
        <button
          type="button"
          className="playbook-player__mobile-open-sheet"
          onClick={() => openMobileSheet("followup")}
        >
          打开追问面板
        </button>
      </div>
    ) : mobileTab === "more" ? (
      <div className="playbook-player__mobile-panel">
        <button
          type="button"
          className="playbook-player__mobile-open-sheet"
          onClick={() => openMobileSheet("more")}
        >
          打开更多操作
        </button>
      </div>
    ) : (
      <div className="playbook-player__mobile-panel playbook-player__mobile-narration">
        <span>步骤 {safeStepIndex + 1} / {script.steps.length}</span>
        <p>{currentNarration || currentStep.title}</p>
      </div>
    );
  const playerClassName = [
    "playbook-player",
    "playbook-player--minimal",
    isPortraitLayout ? "playbook-player--portrait" : "",
    showLearningConsole ? "" : "playbook-player--no-console",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={playerClassName} data-theme={theme}>
      {!isPortraitLayout && (
      <aside className="playbook-player__rail" aria-label="Lesson steps">
        {onToggleTopbar ? (
          <button
            type="button"
            className={`playbook-player__rail-mark playbook-player__chrome-toggle${
              topbarCollapsed ? " is-collapsed" : " is-expanded"
            }`}
            aria-label={topbarCollapsed ? "显示顶部栏" : "隐藏顶部栏"}
            aria-pressed={topbarCollapsed}
            onClick={onToggleTopbar}
          >
            <TopbarFoldIcon collapsed={topbarCollapsed} />
          </button>
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
      )}

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
            {isPortraitLayout && onToggleTopbar && (
              <button
                type="button"
                className="playbook-player__ghost-btn playbook-player__mobile-topbar-btn"
                onClick={onToggleTopbar}
                title={topbarCollapsed ? "显示顶部栏" : "返回导航"}
                aria-label={topbarCollapsed ? "显示顶部栏" : "返回导航"}
                aria-pressed={topbarCollapsed}
              >
                <TopbarFoldIcon collapsed={topbarCollapsed} />
              </button>
            )}
            {onOpenExport && (
              <button
                type="button"
                className="playbook-player__ghost-btn playbook-player__export-btn"
                onClick={onOpenExport}
                title="导出 MP4"
                aria-label="导出 MP4"
              >
                <ExportSVG />
              </button>
            )}
            {isPortraitLayout && showLearningConsole && (
              <button
                type="button"
                className="playbook-player__ghost-btn playbook-player__mobile-more-btn"
                onClick={() => openMobileSheet("more")}
                title="更多"
                aria-label="更多"
              >
                <MoreSVG />
              </button>
            )}
          </div>
        </header>

        {isPortraitLayout && (
          <div className="playbook-player__mobile-step">
            <span>步骤 {safeStepIndex + 1} / {script.steps.length}</span>
            <strong>{currentStep.title}</strong>
          </div>
        )}

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
              inputProps={{
                script,
                director,
                theme,
                showSubtitles: false,
                swapDurationFrames,
              }}
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

        {!isPortraitLayout && (
          <div className="playbook-player__caption">
            <span aria-hidden="true" />
            <p>{currentNarration || currentStep.title}</p>
          </div>
        )}

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

        {isPortraitLayout && (
          <div className="playbook-player__caption playbook-player__caption--mobile">
            <span aria-hidden="true" />
            <p>{currentNarration || currentStep.title}</p>
          </div>
        )}

        {showMobileConsole && (
          <section className="playbook-player__mobile-console" aria-label="移动学习面板">
            <div className="playbook-player__mobile-tabs" role="tablist" aria-label="移动学习面板">
              {MOBILE_TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={mobileTab === tab.key}
                  className={mobileTab === tab.key ? "is-active" : ""}
                  onClick={() => {
                    selectMobileTab(tab.key);
                    if (tab.key === "followup" || tab.key === "more") {
                      openMobileSheet(tab.key);
                    }
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            {mobileTabPanel}
          </section>
        )}
      </div>

      {showLearningConsole && !isPortraitLayout && (
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
      )}

      {showMobileConsole && mobileSheet && (
        <MobileSheet title={mobileSheetTitle} onClose={() => setMobileSheet(null)}>
          {mobileSheet === "code" && (
            <div className="playbook-player__mobile-sheet-code">
              {codeOverlay ? (
                <CodeHighlightRenderer overlay={codeOverlay} theme={theme} />
              ) : (
                <div className="playbook-player__mobile-empty">当前讲解没有代码内容。</div>
              )}
            </div>
          )}
          {mobileSheet === "params" && (
            <div className="playbook-player__mobile-sheet-section">
              {hasDomainPanel ? (
                <ParamPanelSlot
                  domain={baseScript.domain}
                  script={baseScript}
                  overrides={overrides}
                  onOverridesChange={setOverrides}
                  isDark={theme === "dark"}
                />
              ) : (
                <div className="playbook-player__mobile-empty">当前步骤没有可调参数。</div>
              )}
            </div>
          )}
          {mobileSheet === "followup" && (
            <div className="playbook-player__mobile-followup-sheet">
              {followupSlot ?? (
                <div className="playbook-player__mobile-empty">当前讲解暂不能继续追问。</div>
              )}
            </div>
          )}
          {mobileSheet === "more" && (
            <div className="playbook-player__mobile-more-sheet">
              <div className="playbook-player__mobile-sheet-actions">
                {onOpenExport && (
                  <button
                    type="button"
                    className="playbook-player__mobile-action"
                    onClick={() => {
                      setMobileSheet(null);
                      onOpenExport();
                    }}
                  >
                    <ExportSVG />
                    导出 MP4
                  </button>
                )}
                <button
                  type="button"
                  className="playbook-player__mobile-action"
                  onClick={() => setMobileSheet("followup")}
                  disabled={!followupSlot}
                >
                  继续追问
                </button>
              </div>
              <div className="playbook-player__mobile-setting">
                <span>播放速度</span>
                <div className="playbook-player__mobile-speed-row">
                  {SPEED_STEPS.map((speed) => (
                    <button
                      key={speed}
                      type="button"
                      className={playbackRate === speed ? "is-active" : ""}
                      onClick={() => setPlaybackRate(speed)}
                    >
                      {speed}x
                    </button>
                  ))}
                </div>
              </div>
              <div className="playbook-player__mobile-setting-row">
                <span>步进播放</span>
                <button
                  type="button"
                  className={stepThrough ? "is-active" : ""}
                  onClick={() => setStepThrough(!stepThrough)}
                >
                  {stepThrough ? "开启" : "关闭"}
                </button>
              </div>
              <div className="playbook-player__mobile-setting-row">
                <span>语音朗读</span>
                <button
                  type="button"
                  className={tts.enabled ? "is-active" : ""}
                  onClick={tts.toggle}
                  disabled={!tts.supported}
                >
                  {tts.enabled ? "开启" : "关闭"}
                </button>
              </div>
              <div className="playbook-player__mobile-related">
                <span>版本与相关</span>
                {relatedSlot ?? (
                  <div className="playbook-player__mobile-empty">
                    暂无历史版本或相关讲解。
                  </div>
                )}
              </div>
            </div>
          )}
        </MobileSheet>
      )}
    </div>
  );
};
