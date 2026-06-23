import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import type { PlaybookScript } from "../features/playbook/engine/types";
import { PlaybookExportComposition } from "./PlaybookExportComposition";

vi.mock("remotion", async () => {
  const actual = await vi.importActual<typeof import("remotion")>("remotion");
  return {
    ...actual,
    useCurrentFrame: () => 0,
    useVideoConfig: () => ({ fps: 30 }),
    spring: ({ frame, durationInFrames }: { frame: number; durationInFrames?: number }) => {
      const duration = Math.max(1, durationInFrames ?? 1);
      return Math.max(0, Math.min(1, frame / duration));
    },
  };
});

function script(): PlaybookScript {
  return {
    fps: 30,
    total_frames: 60,
    domain: "math",
    title: "SSR export",
    summary: "Export render smoke test",
    parameter_controls: [],
    steps: [
      {
        step_id: "s1",
        end_frame: 60,
        title: "字幕导出",
        voiceover_text: "导出视频需要保留这段字幕。",
        tokens: [],
        snapshot: {
          kind: "math_formula",
          formula_latex: "f(x)=x^2",
        },
      },
    ],
  };
}

describe("PlaybookExportComposition", () => {
  it("renders on the SSR export path without browser viewport APIs while keeping subtitles", () => {
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: undefined,
    });

    const markup = renderToStaticMarkup(
      <PlaybookExportComposition
        script={script()}
        director={null}
        theme="dark"
        showSubtitles
        audioFiles={[]}
      />,
    );

    expect(markup).toContain("导出视频需要保留这段字幕。");
    expect(markup).toContain("1 / 1");
  });
});
