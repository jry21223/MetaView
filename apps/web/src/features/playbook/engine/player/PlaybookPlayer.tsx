import React, { useRef, useState } from "react";
import { Player } from "@remotion/player";
import type { PlayerRef } from "@remotion/player";
import type { PlaybookScript } from "../types";
import { usePlaybookController } from "./usePlaybookController";
import { PlaybookComposition } from "../composition/PlaybookComposition";
import { PLAYBOOK_DEFAULTS } from "../../../../shared/config/constants";

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

  const handlePlayPause = () => {
    if (isPlaying) {
      playerRef.current?.pause();
    } else {
      playerRef.current?.play();
    }
    setIsPlaying((p) => !p);
  };

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
        {/* Playbook header */}
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
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: sidebarText,
              lineHeight: 1.3,
            }}
          >
            {script.title}
          </div>
        </div>

        {/* Steps */}
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
            aria-label="Previous step"
          >
            &#8249;
          </button>

          <span className="playbook-step-indicator">
            {currentStepIndex + 1} / {script.steps.length}
          </span>

          <button
            className="playbook-ctrl-btn playbook-ctrl-btn--play"
            onClick={handlePlayPause}
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? "⏸" : "▶"}
          </button>

          <span className="playbook-step-title">
            {currentStep?.title ?? ""}
          </span>

          <button
            className={`playbook-ctrl-btn playbook-ctrl-btn--mode ${stepThrough ? "is-active" : ""}`}
            onClick={() => setStepThrough(!stepThrough)}
            title={stepThrough ? "步进模式：每步自动暂停" : "连续播放"}
          >
            {stepThrough ? "步进" : "连播"}
          </button>

          <button
            className="playbook-ctrl-btn"
            onClick={next}
            disabled={!canGoNext}
            aria-label="Next step"
          >
            &#8250;
          </button>
        </div>
      </div>
    </div>
  );
};
