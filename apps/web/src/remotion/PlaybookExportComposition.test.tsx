import { renderToStaticMarkup } from "react-dom/server";
import type React from "react";
import { describe, expect, it, vi } from "vitest";

import type { DirectorScript, PlaybookScript } from "../features/playbook/engine/types";
import { PlaybookExportComposition } from "./PlaybookExportComposition";

vi.mock("remotion", () => ({
  Audio: ({ src }: { src: string }) => <audio data-src={src} />,
  Sequence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("../features/playbook/engine/composition/PlaybookComposition", () => ({
  PlaybookComposition: ({
    director,
    showSubtitles,
  }: {
    director?: DirectorScript | null;
    showSubtitles?: boolean;
  }) => (
    <div
      data-testid="mock-playbook-composition"
      data-director-source={director?.source ?? "none"}
      data-show-subtitles={String(showSubtitles)}
    />
  ),
}));

describe("PlaybookExportComposition", () => {
  it("passes director and subtitle props to the shared playbook composition", () => {
    const markup = renderToStaticMarkup(
      <PlaybookExportComposition
        script={script()}
        director={director()}
        theme="dark"
        showSubtitles
        audioFiles={["file:///tmp/step.mp3"]}
      />,
    );

    expect(markup).toContain('data-director-source="manual"');
    expect(markup).toContain('data-show-subtitles="true"');
    expect(markup).toContain('data-src="file:///tmp/step.mp3"');
  });
});

function director(): DirectorScript {
  return {
    schema_version: "1.0.0",
    source: "manual",
    run_id: "run-1",
    beats: [],
  };
}

function script(): PlaybookScript {
  return {
    schema_version: "1.0.0",
    fps: 30,
    total_frames: 60,
    domain: "math",
    title: "Export",
    summary: "Export fixture",
    parameter_controls: [],
    steps: [
      {
        step_id: "step_01",
        end_frame: 60,
        title: "Step",
        voiceover_text: "Narration",
        tokens: [],
        snapshot: {
          kind: "math_formula",
          formula_latex: "x^2",
        },
      },
    ],
  };
}
