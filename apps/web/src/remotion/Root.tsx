import React from "react";
import { Composition, type CalculateMetadataFunction } from "remotion";
import type { PlaybookScript } from "../features/playbook/engine/types";
import { PLAYBOOK_DEFAULTS } from "../shared/config/constants";
import { PlaybookExportComposition, type PlaybookExportProps } from "./PlaybookExportComposition";

const FALLBACK_SCRIPT: PlaybookScript = {
  fps: PLAYBOOK_DEFAULTS.FPS,
  total_frames: PLAYBOOK_DEFAULTS.STEP_FRAMES,
  domain: "algorithm",
  title: "MetaView Export",
  summary: "",
  steps: [],
  parameter_controls: [],
};

const calculateMetadata: CalculateMetadataFunction<PlaybookExportProps> = ({ props }) => {
  const script = props.script ?? FALLBACK_SCRIPT;
  return {
    durationInFrames: Math.max(1, script.total_frames),
    fps: script.fps,
  };
};

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="playbook"
      component={PlaybookExportComposition}
      durationInFrames={PLAYBOOK_DEFAULTS.STEP_FRAMES}
      fps={PLAYBOOK_DEFAULTS.FPS}
      width={PLAYBOOK_DEFAULTS.COMPOSITION_WIDTH}
      height={PLAYBOOK_DEFAULTS.COMPOSITION_HEIGHT}
      defaultProps={{
        script: FALLBACK_SCRIPT,
        theme: "dark",
        showSubtitles: true,
        audioFiles: [],
      }}
      calculateMetadata={calculateMetadata}
    />
  );
};
