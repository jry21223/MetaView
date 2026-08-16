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

const AUDIO_SCRIPT: PlaybookScript = {
  fps: 30,
  total_frames: 180,
  domain: "math",
  title: "Audio export contract",
  summary: "Per-step audio files must reach <Audio> unchanged.",
  parameter_controls: [],
  steps: [
    {
      step_id: "s1",
      end_frame: 60,
      title: "First",
      voiceover_text: "One.",
      tokens: [],
      snapshot: { kind: "math_formula", formula_latex: "y=x" },
    },
    {
      step_id: "s2",
      end_frame: 120,
      title: "Second",
      voiceover_text: "Two.",
      tokens: [],
      snapshot: { kind: "math_formula", formula_latex: "y=x" },
    },
    {
      step_id: "s3",
      end_frame: 180,
      title: "Silent",
      voiceover_text: "Three.",
      tokens: [],
      snapshot: { kind: "math_formula", formula_latex: "y=x" },
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

describe("PlaybookExportComposition audio", () => {
  it("passes http(s) audio URLs through to <Audio> and skips empty entries", () => {
    const audioFiles = [
      "http://127.0.0.1:43123/step_000.wav",
      "https://cdn.example.com/voice/step_001.mp3",
      "",
    ];
    const markup = renderToStaticMarkup(
      <PlaybookExportComposition
        script={AUDIO_SCRIPT}
        theme="light"
        showSubtitles
        audioFiles={audioFiles}
      />,
    );

    expect(markup).toContain('<audio src="http://127.0.0.1:43123/step_000.wav"></audio>');
    expect(markup).toContain('<audio src="https://cdn.example.com/voice/step_001.mp3"></audio>');
    // The empty entry must not render an <audio> tag for step 3.
    expect(markup.match(/<audio/g)).toHaveLength(2);
  });
});
