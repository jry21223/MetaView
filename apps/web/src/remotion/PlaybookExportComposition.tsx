import React from "react";
import { Audio, Sequence } from "remotion";
import type { DirectorScript, PlaybookScript } from "../features/playbook/engine/types";
import { PlaybookComposition } from "../features/playbook/engine/composition/PlaybookComposition";

export type PlaybookExportProps = {
  script: PlaybookScript;
  director?: DirectorScript | null;
  theme: "dark" | "light";
  showSubtitles: boolean;
  /**
   * Optional per-step audio file URLs (http:// or https://) aligned with
   * script.steps. Empty entries skip audio for that step. When provided,
   * backend should have already stretched script.steps[i].end_frame to match
   * audio durations.
   *
   * Only http(s) URLs work: Remotion's renderer downloads every media asset
   * over HTTP (file paths and file:// URLs fail during render). The backend
   * serves TTS audio from a loopback HTTP server for the render (#244).
   */
  audioFiles?: string[];
  [key: string]: unknown;
};

function stepStart(script: PlaybookScript, index: number): number {
  return index === 0 ? 0 : script.steps[index - 1].end_frame;
}

export const PlaybookExportComposition: React.FC<PlaybookExportProps> = ({
  script,
  director = null,
  theme,
  showSubtitles,
  audioFiles = [],
}) => {
  return (
    <>
      <PlaybookComposition
        script={script}
        director={director}
        theme={theme}
        showSubtitles={showSubtitles}
        showDiagnostics={false}
        showInlineCode={false}
      />
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
