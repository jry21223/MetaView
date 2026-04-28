import React, { useRef } from "react";
import { Player } from "@remotion/player";
import type { PlayerRef } from "@remotion/player";
import type { PlaybookScript } from "../types";
import { usePlaybookController } from "./usePlaybookController";
import { PlaybookComposition } from "../composition/PlaybookComposition";

interface PlaybookPlayerProps {
  script: PlaybookScript;
  theme?: "dark" | "light";
}

export const PlaybookPlayer: React.FC<PlaybookPlayerProps> = ({ script, theme = "dark" }) => {
  const playerRef = useRef<PlayerRef | null>(null);
  const { currentStepIndex, canGoPrev, canGoNext, prev, next } = usePlaybookController(script, playerRef);

  if (!script.steps.length) {
    return (
      <div className="playbook-player-empty">
        <p>No steps in playbook</p>
      </div>
    );
  }

  const currentStep = script.steps[currentStepIndex];

  return (
    <div className="playbook-player" data-theme={theme}>
      <div className="playbook-player__stage">
        <Player
          ref={playerRef}
          component={PlaybookComposition}
          inputProps={{ script, theme }}
          durationInFrames={script.total_frames}
          fps={script.fps}
          compositionWidth={960}
          compositionHeight={540}
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

        <span className="playbook-step-title">
          {currentStep?.title ?? ""}
        </span>

        <button
          className="playbook-ctrl-btn"
          onClick={next}
          disabled={!canGoNext}
          aria-label="Next step"
        >
          &#8250;
        </button>
      </div>

      {currentStep?.voiceover_text && (
        <div className="playbook-player__narration">
          {currentStep.voiceover_text}
        </div>
      )}
    </div>
  );
};
