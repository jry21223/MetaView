import React from "react";
import { Player } from "@remotion/player";
import type { PlaybookScript } from "../types";
import { usePlaybookController } from "./usePlaybookController";
import { PlaybookComposition } from "../composition/PlaybookComposition";

interface PlaybookPlayerProps {
  script: PlaybookScript;
  theme?: "dark" | "light";
}

export const PlaybookPlayer: React.FC<PlaybookPlayerProps> = ({ script, theme = "dark" }) => {
  const ctrl = usePlaybookController(script);

  if (!script.steps.length) {
    return (
      <div className="playbook-player-empty">
        <p>No steps in playbook</p>
      </div>
    );
  }

  return (
    <div className="playbook-player" data-theme={theme}>
      <div className="playbook-player__stage">
        <Player
          ref={ctrl.playerRef}
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
          onClick={ctrl.prev}
          disabled={!ctrl.canGoPrev}
          aria-label="Previous step"
        >
          &#8249;
        </button>

        <span className="playbook-step-indicator">
          {ctrl.currentStepIndex + 1} / {script.steps.length}
        </span>

        <span className="playbook-step-title">
          {script.steps[ctrl.currentStepIndex]?.title ?? ""}
        </span>

        <button
          className="playbook-ctrl-btn"
          onClick={ctrl.next}
          disabled={!ctrl.canGoNext}
          aria-label="Next step"
        >
          &#8250;
        </button>
      </div>

      {script.steps[ctrl.currentStepIndex]?.voiceover_text && (
        <div className="playbook-player__narration">
          {script.steps[ctrl.currentStepIndex].voiceover_text}
        </div>
      )}
    </div>
  );
};
