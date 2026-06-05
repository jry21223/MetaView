import React, { useEffect, useState } from "react";
import { Composition, continueRender, delayRender, type CalculateMetadataFunction } from "remotion";
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

/**
 * Block Remotion's renderer until every @font-face declared in the bundle has
 * loaded. KaTeX ships ``font-display: block``, so without this gate the very
 * first frames are captured before the math glyphs become visible and any
 * formula renders as blank space in the exported video.
 */
const FontReadyGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [handle] = useState<number>(() => delayRender("Waiting for KaTeX + math fonts"));
  useEffect(() => {
    let cancelled = false;
    const fonts = typeof document !== "undefined" ? document.fonts : null;
    if (!fonts) {
      continueRender(handle);
      return;
    }
    fonts.ready.then(() => {
      if (!cancelled) continueRender(handle);
    });
    return () => {
      cancelled = true;
    };
  }, [handle]);
  return <>{children}</>;
};

export const RemotionRoot: React.FC = () => {
  return (
    <FontReadyGate>
      <Composition
        id="playbook"
        component={PlaybookExportComposition}
        durationInFrames={FALLBACK_SCRIPT.total_frames}
        fps={FALLBACK_SCRIPT.fps}
        width={PLAYBOOK_DEFAULTS.COMPOSITION_WIDTH}
        height={PLAYBOOK_DEFAULTS.COMPOSITION_HEIGHT}
        defaultProps={{
          script: FALLBACK_SCRIPT,
          director: null,
          theme: "dark",
          showSubtitles: true,
          audioFiles: [],
        }}
        calculateMetadata={calculateMetadata}
      />
    </FontReadyGate>
  );
};
