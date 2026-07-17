import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Player } from "@remotion/player";
import type { PlayerRef } from "@remotion/player";
import type { DirectorScript, PlaybookScript } from "../types";
import { usePlaybookController } from "./usePlaybookController";
import { PlaybookComposition } from "../composition/PlaybookComposition";
import { PLAYBOOK_DEFAULTS } from "../../../../shared/config/constants";
import { useTTS, resolveVoice } from "./useTTS";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";
import { resolveNarrationTemplate } from "./resolveNarrationTemplate";
import { useResolvedScript, type ScriptOverrides } from "./useResolvedScript";
import { resolveCodePanelOverlay } from "./resolveCodePanelOverlay";
import { resolveInitialPreviewFrame, resolvePlayerTimelineKey } from "./previewFrame";
import { CodeHighlightRenderer } from "../renderers/CodeHighlightRenderer";
import { domainCapability } from "../domainCapabilities";
import { getParamPanel } from "../param-panels/registry";
import { hasReplayableAlgorithmParams } from "../param-panels/AlgorithmParamPanel";
import { hasEditableMathParams } from "../param-panels/mathParams";
import { resolveDirectorVoiceover } from "../director";
import { emitNativeEvent } from "../../../../shared/native/emitNativeEvent";
import { MobileSheet } from "./MobileSheet";
import { ParamPanelSlot } from "./ParamPanelSlot";
import { PlaybookLearningConsole } from "./PlaybookLearningConsole";
import { PlayerSettingsPopover } from "./PlayerSettingsPopover";
import { ExportSVG, MoreSVG, SettingsSVG, TopbarFoldIcon } from "./PlaybookPlayerIcons";
import { PlaybookPortraitShell, type MobileTabKey } from "./PlaybookPortraitShell";
import { clipCodeOverlay } from "./mobileCodeOverlay";
import { SPEED_STEPS } from "./playbackRates";
import { DirectorInspector } from "../director/DirectorInspector";
import { InteractionSandboxPanel } from "../../interaction/InteractionSandboxPanel";
import { useInteractionSandbox } from "../../interaction/useInteractionSandbox";
import type {
  DerivativeInteractionBinding,
  InteractionManifest,
} from "../../interaction/types";

export type PlaybookLayoutMode = "desktop" | "portrait";

const PORTRAIT_QUERY = "(max-width: 680px) and (orientation: portrait)";

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

function derivativeInteractionManifest(
  manifest: InteractionManifest,
): InteractionManifest {
  return {
    version: manifest.version,
    adapters: manifest.adapters.flatMap((adapter) => {
      const bindings = adapter.bindings.filter(
        (binding): binding is DerivativeInteractionBinding =>
          binding.target_role === "marker-x",
      );
      return bindings.length > 0 ? [{ ...adapter, bindings }] : [];
    }),
  };
}

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
  /** Opts this player instance into the experimental, ephemeral interaction sandbox. */
  enableInteractionSandbox?: boolean;
  topbarCollapsed?: boolean;
  onToggleTopbar?: () => void;
  layoutMode?: PlaybookLayoutMode;
}

export const PlaybookPlayer: React.FC<PlaybookPlayerProps> = ({
  script: baseScript,
  director = null,
  theme = "light",
  swapDurationFrames = 24,
  onOpenExport,
  followupSlot,
  relatedSlot,
  showLearningConsole = true,
  enableInteractionSandbox = false,
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
  const interactionSandbox = useInteractionSandbox(script);
  const interactionEnabled = enableInteractionSandbox && showLearningConsole;
  const displayScript = interactionEnabled
    ? interactionSandbox.previewScript
    : script;
  const interactionManifest = useMemo(
    () => derivativeInteractionManifest(interactionSandbox.manifest),
    [interactionSandbox.manifest],
  );
  const capability = useMemo(() => domainCapability(script.domain), [script.domain]);
  const hasDomainPanel = useMemo(() => {
    if (getParamPanel(baseScript.domain) === null) return false;
    if (baseScript.domain === "algorithm") {
      return hasReplayableAlgorithmParams(baseScript);
    }
    if (baseScript.domain === "math") {
      return hasEditableMathParams(baseScript.parameter_controls);
    }
    return true;
  }, [baseScript]);
  const initialPreviewFrame = useMemo(() => resolveInitialPreviewFrame(script), [script]);
  const playerTimelineKey = useMemo(() => resolvePlayerTimelineKey(baseScript), [baseScript]);

  useEffect(() => {
    const id = setTimeout(() => {
      setOverrides((current) => (Object.keys(current).length > 0 ? {} : current));
      setMobileTab((current) =>
        current === "params" && !hasDomainPanel ? "narration" : current,
      );
      setMobileSheet((current) =>
        current === "params" && !hasDomainPanel ? null : current,
      );
    }, 0);
    return () => clearTimeout(id);
  }, [baseScript, hasDomainPanel]);

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
    () => resolveCodePanelOverlay(displayScript, safeStepIndex),
    [displayScript, safeStepIndex],
  );
  const mobileCodeOverlay = useMemo(
    () => clipCodeOverlay(codeOverlay),
    [codeOverlay],
  );

  // Show the code slot for algorithm lessons, explicit code tracks, or a
  // legacy snapshot that can be projected into the right-side console.
  const isAlgorithmDomain = displayScript.domain === "algorithm";
  const hasAnyCode = useMemo(
    () => displayScript.steps.some((s) => s.code_highlight != null),
    [displayScript.steps],
  );
  const showCodePanelSlot = isAlgorithmDomain || hasAnyCode || codeOverlay != null;

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
  const hasCurrentInteraction = interactionManifest.adapters.some((adapter) =>
    adapter.bindings.some((binding) => binding.step_id === currentStep.step_id)
  );
  const showInteractionSlot = interactionEnabled && (
    hasCurrentInteraction ||
    interactionSandbox.dirty ||
    interactionSandbox.lastError !== null
  );
  const interactionSlot = showInteractionSlot ? (
    <InteractionSandboxPanel
      manifest={interactionManifest}
      currentStepId={currentStep.step_id}
      events={interactionSandbox.events}
      dirty={interactionSandbox.dirty}
      canUndo={interactionSandbox.canUndo}
      lastError={interactionSandbox.lastError}
      onApply={interactionSandbox.apply}
      onUndo={interactionSandbox.undo}
      onReset={interactionSandbox.reset}
    />
  ) : undefined;
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
  const effectiveMobileTab =
    mobileTab === "params" && !hasDomainPanel ? "narration" : mobileTab;
  const effectiveMobileSheet =
    mobileSheet === "params" && !hasDomainPanel ? null : mobileSheet;
  const showStageSubtitles = !(showMobileConsole && effectiveMobileTab === "narration");
  const mobileSheetTitle =
    effectiveMobileSheet === "code"
      ? "全部代码"
      : effectiveMobileSheet === "params"
        ? "参数"
        : effectiveMobileSheet === "followup"
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
  const mobileParamsContent = (
    <ParamPanelSlot
      domain={baseScript.domain}
      script={baseScript}
      overrides={overrides}
      onOverridesChange={setOverrides}
      isDark={theme === "dark"}
    />
  );
  const topbarAction =
    isPortraitLayout && onToggleTopbar ? (
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
    ) : null;
  const exportAction = onOpenExport ? (
    <button
      type="button"
      className="playbook-player__ghost-btn playbook-player__export-btn"
      onClick={onOpenExport}
      title="导出 MP4"
      aria-label="导出 MP4"
    >
      <ExportSVG />
    </button>
  ) : null;
  const moreAction =
    isPortraitLayout && showLearningConsole ? (
      <button
        type="button"
        className="playbook-player__ghost-btn playbook-player__mobile-more-btn"
        onClick={() => openMobileSheet("more")}
        title="更多"
        aria-label="更多"
      >
        <MoreSVG />
      </button>
    ) : null;
  const stageSlot = (
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
            script: displayScript,
            director,
            theme,
            showSubtitles: showStageSubtitles,
            showInlineCode: false,
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
  );
  const controlsSlot = (
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
      {isPortraitLayout && (
        <PlaybookPortraitShell
          domain={script.domain}
          title={script.title}
          currentStepTitle={currentStep.title}
          currentNarration={currentNarration}
          safeStepIndex={safeStepIndex}
          stepCount={script.steps.length}
          theme={theme}
          topbarAction={topbarAction}
          exportAction={exportAction}
          moreAction={moreAction}
          stageSlot={stageSlot}
          controlsSlot={controlsSlot}
          showMobileConsole={showMobileConsole}
          activeTab={effectiveMobileTab}
          onSelectTab={selectMobileTab}
          onOpenSheet={openMobileSheet}
          mobileCodeOverlay={mobileCodeOverlay}
          hasDomainPanel={hasDomainPanel}
          paramsContent={mobileParamsContent}
        />
      )}
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

      {!isPortraitLayout && (
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
            {exportAction}
          </div>
        </header>

        {stageSlot}

        {controlsSlot}
      </div>
      )}

      {showLearningConsole && !isPortraitLayout && (
        <PlaybookLearningConsole
          showCodePanelSlot={showCodePanelSlot}
          codeOverlay={codeOverlay}
          theme={theme}
          hasDomainPanel={hasDomainPanel}
          baseScript={baseScript}
          overrides={overrides}
          onOverridesChange={setOverrides}
          interactionSlot={interactionSlot}
          followupSlot={followupSlot}
          relatedSlot={relatedSlot}
          relatedAlgorithmId={script.algorithm_id}
          director={director}
          currentStepId={currentStep.step_id}
        />
      )}

      {showMobileConsole && effectiveMobileSheet && (
        <MobileSheet title={mobileSheetTitle} onClose={() => setMobileSheet(null)}>
          {effectiveMobileSheet === "code" && (
            <div className="playbook-player__mobile-sheet-code">
              {codeOverlay ? (
                <CodeHighlightRenderer overlay={codeOverlay} theme={theme} />
              ) : (
                <div className="playbook-player__mobile-empty">当前讲解没有代码内容。</div>
              )}
            </div>
          )}
          {effectiveMobileSheet === "params" && (
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
          {effectiveMobileSheet === "followup" && (
            <div className="playbook-player__mobile-followup-sheet">
              {followupSlot ?? (
                <div className="playbook-player__mobile-empty">当前讲解暂不能继续追问。</div>
              )}
            </div>
          )}
          {effectiveMobileSheet === "more" && (
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
              <div className="playbook-player__mobile-director">
                <span>Director</span>
                <DirectorInspector
                  director={director}
                  currentStepId={currentStep.step_id}
                />
              </div>
            </div>
          )}
        </MobileSheet>
      )}
    </div>
  );
};
