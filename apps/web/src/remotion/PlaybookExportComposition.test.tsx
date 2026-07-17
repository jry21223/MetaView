import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { PlaybookScript } from "../features/playbook/engine/types";

vi.mock("remotion", () => ({
  Audio: ({ src }: { src: string }) => <audio src={src} />,
  Sequence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("../features/playbook/engine/composition/PlaybookComposition", () => ({
  PlaybookComposition: ({
    showDiagnostics,
    showInlineCode,
  }: {
    showDiagnostics?: boolean;
    showInlineCode?: boolean;
  }) => (
    <div
      data-show-diagnostics={String(showDiagnostics)}
      data-show-inline-code={String(showInlineCode)}
    />
  ),
}));

import { PlaybookExportComposition } from "./PlaybookExportComposition";

const SCRIPT: PlaybookScript = {
  fps: 30,
  total_frames: 60,
  domain: "math",
  title: "Export diagnostics contract",
  summary: "Diagnostics must never render into export output.",
  parameter_controls: [],
  steps: [
    {
      step_id: "s1",
      end_frame: 60,
      title: "Plot",
      voiceover_text: "Show the plot.",
      tokens: [],
      snapshot: {
        kind: "math_formula",
        formula_latex: "y=x",
      },
    },
  ],
};

describe("PlaybookExportComposition diagnostics", () => {
  it("forces renderer diagnostics off", () => {
    const markup = renderToStaticMarkup(
      <PlaybookExportComposition script={SCRIPT} theme="light" showSubtitles />,
    );

    expect(markup).toContain('data-show-diagnostics="false"');
    expect(markup).toContain('data-show-inline-code="false"');
  });
});
