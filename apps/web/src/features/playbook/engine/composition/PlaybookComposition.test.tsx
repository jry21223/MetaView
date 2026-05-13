import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { PlaybookScript } from "../types";

vi.mock("remotion", async () => {
  const actual = await vi.importActual<typeof import("remotion")>("remotion");
  return {
    ...actual,
    useCurrentFrame: () => 0,
    useVideoConfig: () => ({ fps: 30 }),
    spring: () => 1,
  };
});

import { PlaybookComposition } from "./PlaybookComposition";

function mathScript(): PlaybookScript {
  return {
    fps: 30,
    total_frames: 60,
    domain: "math",
    title: "参数直线",
    summary: "Shows a parameterized line",
    parameter_controls: [],
    steps: [
      {
        step_id: "s1",
        end_frame: 60,
        title: "画直线",
        voiceover_text: "观察斜率变化",
        tokens: [],
        snapshot: {
          kind: "math_plot",
          curves: [{ expression: "a*x", label: "f(x)", emphasis: "primary" }],
          params: { a: 2 },
          x_min: -2,
          x_max: 2,
          x_label: "x",
          y_label: "y",
        },
      },
    ],
  };
}

describe("PlaybookComposition", () => {
  it("renders math_plot snapshots through the renderer registry", () => {
    const markup = renderToStaticMarkup(<PlaybookComposition script={mathScript()} showSubtitles={false} />);
    expect(markup).toContain("<svg");
    expect(markup).toContain("<polyline");
    expect(markup).not.toContain("Unknown snapshot kind");
  });
});
