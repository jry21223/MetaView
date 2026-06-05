import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type {
  DirectorCameraMotion,
  DirectorScript,
  Layer,
  MathPlotSnapshot,
  MathSceneSnapshot,
  MetaStep,
  PlaybookScript,
} from "../types";
import { motionSceneDemo } from "../fixtures/motionSceneDemo";

const remotionState = vi.hoisted(() => ({ frame: 0 }));

vi.mock("remotion", async () => {
  const actual = await vi.importActual<typeof import("remotion")>("remotion");
  return {
    ...actual,
    useCurrentFrame: () => remotionState.frame,
    useVideoConfig: () => ({ fps: 30 }),
    spring: ({ frame, durationInFrames }: { frame: number; durationInFrames?: number }) => {
      const duration = Math.max(1, durationInFrames ?? 1);
      return Math.max(0, Math.min(1, frame / duration));
    },
  };
});

import { PlaybookComposition } from "./PlaybookComposition";

function plotSnapshot(expression = "x^2"): MathPlotSnapshot {
  return {
    kind: "math_plot",
    curves: [{ expression, label: "f(x)", emphasis: "primary" }],
    x_min: -2,
    x_max: 2,
    x_label: "x",
    y_label: "y",
  };
}

function sceneSnapshot(overrides: Partial<MathSceneSnapshot> = {}): MathSceneSnapshot {
  return {
    kind: "math_scene",
    x_min: -1,
    x_max: 4,
    y_min: -1,
    y_max: 3,
    x_label: "x",
    y_label: "y",
    points: [],
    segments: [],
    regions: [],
    curves: [],
    annotations: [],
    ...overrides,
  };
}

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
        snapshot: { ...plotSnapshot("a*x"), params: { a: 2 } },
      },
    ],
  };
}

function directorFor(
  script: PlaybookScript,
  cameraMotion: DirectorCameraMotion,
  voiceoverText = "Director override.",
): DirectorScript {
  return {
    schema_version: "1.0.0",
    source: "rule",
    run_id: "run-1",
    beats: [
      {
        beat_id: "beat_01",
        step_id: script.steps[0].step_id,
        start_frame: 0,
        end_frame: script.steps[0].end_frame,
        intent: "hook",
        shot_type: "medium",
        camera_motion: cameraMotion,
        pacing: "normal",
        voiceover_text: voiceoverText,
        emphasis_terms: [],
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

function layeredMathSceneScript(): PlaybookScript {
  const base = sceneSnapshot({
    points: [{ x: 0, y: 0, label: "O" }],
    formula_latex: "F=ma",
    caption: "base caption",
  });
  const overlay = sceneSnapshot({
    segments: [{ x0: 0, y0: 0, x1: 2, y1: 1, arrow: true }],
    formula_latex: "overlay formula hidden",
    caption: "overlay caption hidden",
  });
  return {
    fps: 30,
    total_frames: 60,
    domain: "physics",
    title: "受力图",
    summary: "Layered physics-style math scene",
    parameter_controls: [],
    steps: [
      {
        step_id: "s1",
        end_frame: 60,
        title: "合并力图",
        voiceover_text: "先保留底图，再叠加力的方向。",
        tokens: [],
        snapshot: base,
        layers: [
          {
            timing: { enter_at: 0, exit_at: 1, appear_anim: "fade", z_order: 0 },
            body: base,
          },
          {
            timing: { enter_at: 0, exit_at: 1, appear_anim: "fade", z_order: 1 },
            body: overlay,
          },
        ],
      },
    ],
  };
}

function step({
  id,
  endFrame,
  title,
  voiceover,
  snapshot,
  layers,
}: {
  id: string;
  endFrame: number;
  title: string;
  voiceover: string;
  snapshot: MathPlotSnapshot;
  layers?: Layer[];
}): MetaStep {
  return {
    step_id: id,
    end_frame: endFrame,
    title,
    voiceover_text: voiceover,
    tokens: [],
    snapshot,
    layers,
  };
}

function twoStepScript(first: MetaStep, second: MetaStep): PlaybookScript {
  return {
    fps: 30,
    total_frames: second.end_frame,
    domain: "math",
    title: "连续分镜",
    summary: "",
    parameter_controls: [],
    steps: [first, second],
  };
}

function firstPolylinePointCount(markup: string): number {
  const match = markup.match(/<polyline[^>]*points="([^"]+)"/);
  if (!match) return 0;
  return match[1].trim().split(/\s+/).length;
}

describe("PlaybookComposition", () => {
  beforeEach(() => {
    remotionState.frame = 0;
  });

  it("renders math_plot snapshots through the renderer registry", () => {
    const markup = renderToStaticMarkup(<PlaybookComposition script={mathScript()} showSubtitles={false} />);
    expect(markup).toContain("<svg");
    expect(markup).toContain("<polyline");
    expect(markup).not.toContain("Unknown snapshot kind");
  });

  it("renders the motion scene demo through the renderer registry", () => {
    const markup = renderToStaticMarkup(<PlaybookComposition script={motionSceneDemo} showSubtitles={false} />);
    expect(markup).toContain("motion-scene-renderer");
    expect(markup).toContain('data-object-id="triangle_fill"');
    expect(markup).toContain('data-object-id="base_edge"');
    expect(markup).not.toContain("Unknown snapshot kind");
  });

  it("renders narration only in the shared subtitle row", () => {
    const markup = renderToStaticMarkup(<PlaybookComposition script={mathScript()} />);
    const matches = markup.match(/观察斜率变化/g) ?? [];
    expect(matches).toHaveLength(1);
  });

  it("keeps subtitle and stage transform unchanged without a director", () => {
    remotionState.frame = 30;
    const markup = renderToStaticMarkup(<PlaybookComposition script={mathScript()} />);

    expect(markup).toContain("观察斜率变化");
    expect(markup).not.toContain("data-camera-motion");
    expect(markup).not.toContain("transform:");
  });

  it("uses director voiceover text for subtitles when present", () => {
    const script = mathScript();
    const markup = renderToStaticMarkup(
      <PlaybookComposition script={script} director={directorFor(script, "hold", "导演旁白覆盖。")} />,
    );

    expect(markup).toContain("导演旁白覆盖。");
    expect(markup).not.toContain("观察斜率变化");
  });

  it.each([
    ["hold", undefined],
    ["push_in", "transform:scale(1.0300)"],
    ["pull_out", "transform:scale(1.0300)"],
    ["pan_left", "transform:translateX(-9.00px)"],
    ["pan_right", "transform:translateX(9.00px)"],
  ] as const)("applies %s camera motion to the visual stage", (cameraMotion, expectedTransform) => {
    remotionState.frame = 30;
    const script = mathScript();
    const markup = renderToStaticMarkup(
      <PlaybookComposition script={script} director={directorFor(script, cameraMotion)} showSubtitles={false} />,
    );

    expect(markup).toContain(`data-camera-motion="${cameraMotion}"`);
    if (expectedTransform) {
      expect(markup).toContain(expectedTransform);
    } else {
      expect(markup).not.toContain("transform:");
    }
  });

  it("merges simultaneous math plot layers into one scene", () => {
    remotionState.frame = 60;
    const markup = renderToStaticMarkup(<PlaybookComposition script={layeredMathScript()} showSubtitles={false} />);
    expect(markup.match(/<svg/g)).toHaveLength(1);
    expect(markup).toContain("tangent");
    expect(markup).toContain("<polygon");
  });

  it("renders only the first stage layer with full math scene chrome", () => {
    const markup = renderToStaticMarkup(
      <PlaybookComposition script={layeredMathSceneScript()} showSubtitles={false} />,
    );

    expect(markup.match(/data-layer-kind="math_scene"/g)).toHaveLength(2);
    expect(markup.match(/math-scene-renderer--overlay/g)).toHaveLength(1);
    expect(markup.match(/math-scene-renderer__formula/g)).toHaveLength(1);
    expect(markup).toContain("base caption");
    expect(markup).not.toContain("overlay caption hidden");
    expect(markup).not.toContain("overlay formula hidden");
    expect(markup.match(/合并力图/g)).toHaveLength(1);
  });

  it("continues identical math plot geometry across a narration step boundary", () => {
    const snapshot = plotSnapshot();
    const script = twoStepScript(
      step({
        id: "s1",
        endFrame: 60,
        title: "画出曲线",
        voiceover: "第一段说明",
        snapshot,
      }),
      step({
        id: "s2",
        endFrame: 120,
        title: "解释曲线",
        voiceover: "第二段说明",
        snapshot,
      }),
    );

    remotionState.frame = 60;
    const markup = renderToStaticMarkup(<PlaybookComposition script={script} />);

    expect(firstPolylinePointCount(markup)).toBeGreaterThan(100);
    expect(markup).toContain("第二段说明");
    expect(markup).toContain("2 / 2");
    expect(markup).toContain('data-visual-continuation="true"');
  });

  it("restarts math plot geometry when the visual snapshot changes", () => {
    const script = twoStepScript(
      step({
        id: "s1",
        endFrame: 60,
        title: "画出抛物线",
        voiceover: "第一段说明",
        snapshot: plotSnapshot("x^2"),
      }),
      step({
        id: "s2",
        endFrame: 120,
        title: "切到正弦",
        voiceover: "第二段说明",
        snapshot: plotSnapshot("sin(x)"),
      }),
    );

    remotionState.frame = 60;
    const markup = renderToStaticMarkup(<PlaybookComposition script={script} showSubtitles={false} />);

    expect(firstPolylinePointCount(markup)).toBeLessThanOrEqual(3);
    expect(markup).toContain('data-visual-continuation="false"');
  });

  it("keeps an unchanged layer drawn while a new layer enters", () => {
    const plotLayer: Layer = {
      timing: { enter_at: 0, exit_at: 1, appear_anim: "draw", z_order: 0 },
      body: plotSnapshot(),
    };
    const script = twoStepScript(
      step({
        id: "s1",
        endFrame: 60,
        title: "先看曲线",
        voiceover: "第一段说明",
        snapshot: plotSnapshot(),
        layers: [plotLayer],
      }),
      step({
        id: "s2",
        endFrame: 120,
        title: "加入说明",
        voiceover: "第二段说明",
        snapshot: plotSnapshot(),
        layers: [
          plotLayer,
          {
            timing: { enter_at: 0, exit_at: 1, appear_anim: "fade", z_order: 1 },
            body: {
              kind: "narration_card",
              text: "补充说明",
              position: "bottom",
              emphasis: "secondary",
            },
          },
        ],
      }),
    );

    remotionState.frame = 60;
    const markup = renderToStaticMarkup(<PlaybookComposition script={script} showSubtitles={false} />);

    expect(firstPolylinePointCount(markup)).toBeGreaterThan(100);
    expect(markup).toContain("补充说明");
    expect(markup).toContain('data-layer-kind="math_plot"');
    expect(markup).toContain('data-layer-kind="narration_card"');
  });
});
