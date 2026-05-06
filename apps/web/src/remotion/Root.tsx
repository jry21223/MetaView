import React from "react";
import { Composition, type CalculateMetadataFunction } from "remotion";
import type { PlaybookScript } from "../features/playbook/engine/types";
import { PLAYBOOK_DEFAULTS } from "../shared/config/constants";
import { PlaybookExportComposition, type PlaybookExportProps } from "./PlaybookExportComposition";

const FALLBACK_SCRIPT: PlaybookScript = {
  fps: 30,
  total_frames: 60,
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
      durationInFrames={60}
      fps={30}
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
