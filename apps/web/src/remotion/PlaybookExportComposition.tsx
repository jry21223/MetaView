import React from "react";
import { Audio, Sequence } from "remotion";
import type { PlaybookScript } from "../features/playbook/engine/types";
import { PlaybookComposition } from "../features/playbook/engine/composition/PlaybookComposition";

export type PlaybookExportProps = {
  script: PlaybookScript;
  theme: "dark" | "light";
  showSubtitles: boolean;
  /**
   * Optional per-step audio file URLs (file:// or http://) aligned with script.steps.
   * Empty entries skip audio for that step. When provided, backend should have
   * already stretched script.steps[i].end_frame to match audio durations.
   */
  audioFiles?: string[];
  [key: string]: unknown;
};

function stepStart(script: PlaybookScript, index: number): number {
  return index === 0 ? 0 : script.steps[index - 1].end_frame;
}

export const PlaybookExportComposition: React.FC<PlaybookExportProps> = ({
  script,
  theme,
  showSubtitles,
  audioFiles = [],
}) => {
  return (
    <>
      <PlaybookComposition script={script} theme={theme} showSubtitles={showSubtitles} />
      {audioFiles.map((src, i) => {
        if (!src) return null;
        const step = script.steps[i];
        if (!step) return null;
        const from = stepStart(script, i);
        const duration = Math.max(1, step.end_frame - from);
        return (
          <Sequence key={i} from={from} durationInFrames={duration} layout="none">
            <Audio src={src} />
          </Sequence>
        );
      })}
    </>
  );
};
