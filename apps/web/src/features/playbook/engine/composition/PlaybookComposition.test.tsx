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

function layeredMathScript(): PlaybookScript {
  return {
    fps: 30,
    total_frames: 60,
    domain: "math",
    title: "切线与面积",
    summary: "Combines tangent and area layers",
    parameter_controls: [],
    steps: [
      {
        step_id: "s1",
        end_frame: 60,
        title: "合并视图",
        voiceover_text: "同时观察切线和面积",
        tokens: [],
        snapshot: {
          kind: "math_plot",
          curves: [{ expression: "x^2", label: "f(x)", emphasis: "primary" }],
          x_min: -2,
          x_max: 3,
          x_label: "x",
          y_label: "y",
        },
        layers: [
          {
            timing: { enter_at: 0, exit_at: 1, appear_anim: "fade", z_order: 0 },
            body: {
              kind: "math_plot",
              curves: [
                { expression: "x^2", label: "f(x)", emphasis: "primary" },
                { expression: "2*x-1", label: "tangent", emphasis: "secondary" },
              ],
              marker_x: 1,
              x_min: -2,
              x_max: 3,
              x_label: "x",
              y_label: "y",
            },
          },
          {
            timing: { enter_at: 0, exit_at: 1, appear_anim: "fade", z_order: 0 },
            body: {
              kind: "math_plot",
              curves: [{ expression: "x^2", label: "f(x)", emphasis: "primary" }],
              shade_from: 0,
              shade_to: 2,
              x_min: -2,
              x_max: 3,
              x_label: "x",
              y_label: "y",
            },
          },
        ],
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

  it("renders narration only in the shared subtitle row", () => {
    const markup = renderToStaticMarkup(<PlaybookComposition script={mathScript()} />);
    const matches = markup.match(/观察斜率变化/g) ?? [];
    expect(matches).toHaveLength(1);
  });

  it("merges simultaneous math plot layers into one scene", () => {
    const markup = renderToStaticMarkup(<PlaybookComposition script={layeredMathScript()} showSubtitles={false} />);
    expect(markup.match(/<svg/g)).toHaveLength(1);
    expect(markup).toContain("tangent");
    expect(markup).toContain("<polygon");
  });
});
