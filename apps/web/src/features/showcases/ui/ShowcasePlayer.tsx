import type { DirectorScript, PlaybookScript } from "../../playbook/engine/types";
import { PlaybookPlayer } from "../../playbook/engine/player/PlaybookPlayer";

interface ShowcasePlayerProps {
  script: PlaybookScript;
  director?: DirectorScript | null;
  theme: "light" | "dark";
}

/**
 * Public playback deliberately delegates to the product player. It does not
 * add a second renderer or wire any run/follow-up/export service.
 */
export function ShowcasePlayer({ script, director = null, theme }: ShowcasePlayerProps) {
  return (
    <div className="mv-showcase-player" data-showcase-player="static">
      <PlaybookPlayer
        script={script}
        director={director}
        theme={theme}
        showLearningConsole={false}
      />
    </div>
  );
}
