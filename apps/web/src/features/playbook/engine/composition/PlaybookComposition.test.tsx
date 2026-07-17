import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type {
  DirectorCameraMotion,
  DirectorSource,
  DirectorScript,
  Layer,
  MathPlotSnapshot,
  MathSceneSnapshot,
  MetaStep,
  PlaybookScript,
} from "../types";
import type { MotionSceneSnapshot } from "../motion/types";

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

function mathScript(totalFrames = 60): PlaybookScript {
  return {
    fps: 30,
    total_frames: totalFrames,
    domain: "math",
    title: "参数直线",
    summary: "Shows a parameterized line",
    parameter_controls: [],
    steps: [
      {
        step_id: "s1",
        end_frame: totalFrames,
        title: "画直线",
        voiceover_text: "观察斜率变化",
        tokens: [],
        snapshot: { ...plotSnapshot("a*x"), params: { a: 2 } },
      },
    ],
  };
}

function motionSnapshot(): MotionSceneSnapshot {
  return {
    kind: "motion_scene",
    viewport: {
      width: 960,
      height: 540,
      world: { xMin: 0, xMax: 960, yMin: 0, yMax: 540 },
    },
    objects: [
      {
        id: "base_edge",
        type: "segment",
        x1: 220,
        y1: 380,
        x2: 580,
        y2: 380,
        style: "accent",
      },
      {
        id: "triangle_fill",
        type: "polygon",
        points: [
          [220, 380],
          [580, 380],
          [220, 140],
        ],
        style: "primary",
      },
    ],
    tracks: [
      {
        target: "base_edge",
        property: "drawProgress",
        keyframes: [
          { t: 0, value: 0 },
          { t: 1, value: 1 },
        ],
        easing: "linear",
      },
      {
        target: "triangle_fill",
        property: "opacity",
        keyframes: [
          { t: 0, value: 0 },
          { t: 1, value: 1 },
        ],
        easing: "linear",
      },
    ],
  };
}

function motionScript(): PlaybookScript {
  return {
    fps: 30,
    total_frames: 90,
    domain: "math",
    title: "Motion scene registry fixture",
    summary: "",
    parameter_controls: [],
    steps: [
      {
        step_id: "motion-registry",
        end_frame: 90,
        title: "Motion scene",
        voiceover_text: "Object identity demo",
        tokens: [],
        snapshot: motionSnapshot(),
      },
    ],
  };
}

function geographyArrayFallbackScript(): PlaybookScript {
  return {
    fps: 30,
    total_frames: 60,
    domain: "geography",
    title: "数组兜底",
    summary: "Unsupported geography fallback",
    parameter_controls: [],
    steps: [
      {
        step_id: "array-fallback",
        end_frame: 60,
        title: "数组兜底",
        voiceover_text: "不应使用算法数组表现地理图层。",
        tokens: [],
        snapshot: {
          kind: "algorithm_array",
          array_values: ["land", "ocean"],
          active_indices: [],
          swap_indices: [],
          sorted_indices: [],
          pointers: {},
        },
      },
    ],
  };
}

function directorFor(
  script: PlaybookScript,
  cameraMotion: DirectorCameraMotion,
  voiceoverText = "Director override.",
  source: DirectorSource = "rule",
  beatDurationFrames = script.steps[0].end_frame,
): DirectorScript {
  return {
    schema_version: "1.0.0",
    source,
    run_id: "run-1",
    beats: [
      {
        beat_id: "beat_01",
        step_id: script.steps[0].step_id,
        start_frame: 0,
        end_frame: beatDurationFrames,
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

function mathSceneScript(): PlaybookScript {
  return {
    fps: 30,
    total_frames: 60,
    domain: "math",
    title: "几何场景",
    summary: "Shows a geometry scene",
    parameter_controls: [],
    steps: [
      {
        step_id: "s1",
        end_frame: 60,
        title: "画线段",
        voiceover_text: "观察线段长度",
        tokens: [],
        snapshot: sceneSnapshot({
          points: [{ x: 0, y: 0, label: "A" }],
          segments: [{ x0: 0, y0: 0, x1: 2, y1: 1, label: "AB" }],
        }),
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

function layerOpenTag(markup: string, kind: string): string {
  return markup.match(new RegExp(`<div[^>]*data-layer-kind="${kind}"[^>]*>`))?.[0] ?? "";
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

  it("keeps a legacy plot interactive when an empty layers array falls back to its snapshot", () => {
    const script = mathScript();
    script.steps[0] = {
      ...script.steps[0],
      snapshot: {
        ...(script.steps[0].snapshot as MathPlotSnapshot),
        marker_x: 1,
      },
      layers: [],
    };
    const markup = renderToStaticMarkup(
      <PlaybookComposition
        script={script}
        showSubtitles={false}
        onInteraction={vi.fn()}
      />,
    );

    expect(markup).toContain('role="slider"');
    expect(markup).toContain('data-interaction-target="marker-x"');
  });

  it("renders the motion scene demo through the renderer registry", () => {
    const markup = renderToStaticMarkup(<PlaybookComposition script={motionScript()} showSubtitles={false} />);
    expect(markup).toContain("motion-scene-renderer");
    expect(markup).toContain('data-object-id="triangle_fill"');
    expect(markup).toContain('data-object-id="base_edge"');
    expect(markup).not.toContain("Unknown snapshot kind");
  });

  it("exposes non-blocking visual quality warning metadata only in diagnostics mode", () => {
    const markup = renderToStaticMarkup(
      <PlaybookComposition
        script={geographyArrayFallbackScript()}
        showSubtitles={false}
        showDiagnostics
      />,
    );

    expect(markup).toContain('data-visual-quality-warning-count="1"');
    expect(markup).toContain('data-visual-quality-warning-codes="unsupported_array_fallback"');
    expect(markup).toContain('data-visual-quality-warning-steps="array-fallback"');
    expect(markup).toContain('data-visual-quality-warning-icon="true"');
    expect(markup).toContain('data-asset-id="core-warning-icon"');
    expect(markup).not.toContain('data-missing-asset="true"');
    expect(markup).toContain("domain-array-renderer");
  });

  it("renders narration only in the shared subtitle row", () => {
    const markup = renderToStaticMarkup(<PlaybookComposition script={mathScript()} />);
    const matches = markup.match(/观察斜率变化/g) ?? [];
    expect(matches).toHaveLength(1);
  });

  it("uses long director beat voiceover when it is long enough", () => {
    const script = mathScript(120);
    const markup = renderToStaticMarkup(
      <PlaybookComposition
        script={script}
        director={directorFor(script, "hold", "长时段导演口播。", "manual", 120)}
      />,
    );

    expect(markup).toContain("长时段导演口播。");
    expect(markup).not.toContain("观察斜率变化");
  });

  it("keeps step-level subtitles when director beat is too short", () => {
    const script = mathScript(120);
    const markup = renderToStaticMarkup(
      <PlaybookComposition
        script={script}
        director={directorFor(script, "hold", "短时段导演口播。", "manual", 30)}
      />,
    );

    expect(markup).toContain("观察斜率变化");
    expect(markup).not.toContain("短时段导演口播。");
  });

  it("keeps subtitle and stage transform unchanged without a director", () => {
    remotionState.frame = 30;
    const markup = renderToStaticMarkup(<PlaybookComposition script={mathScript()} />);

    expect(markup).toContain("观察斜率变化");
    expect(markup).not.toContain("data-camera-motion");
    expect(markup).not.toContain("transform:");
  });

  it("uses manual director voiceover text for subtitles when present", () => {
    const script = mathScript();
    const markup = renderToStaticMarkup(
      <PlaybookComposition script={script} director={directorFor(script, "hold", "导演旁白覆盖。", "manual")} />,
    );

    expect(markup).toContain("导演旁白覆盖。");
    expect(markup).not.toContain("观察斜率变化");
  });

  it("does not let rule director voiceover override subtitles", () => {
    const script = mathScript();
    const markup = renderToStaticMarkup(
      <PlaybookComposition script={script} director={directorFor(script, "hold", "规则旁白不覆盖。")} />,
    );

    expect(markup).toContain("观察斜率变化");
    expect(markup).not.toContain("规则旁白不覆盖。");
  });

  it.each([
    ["hold", undefined],
    ["push_in", "transform:scale(1.0125)"],
    ["pull_out", "transform:scale(1.0125)"],
    ["pan_left", "transform:translateX(-7.00px)"],
    ["pan_right", "transform:translateX(7.00px)"],
    ["focus_target", undefined],
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

  it("does not apply outer stage camera transforms to math_scene steps", () => {
    remotionState.frame = 30;
    const script = mathSceneScript();
    const markup = renderToStaticMarkup(
      <PlaybookComposition script={script} director={directorFor(script, "push_in")} showSubtitles={false} />,
    );

    expect(markup).toContain('data-camera-motion="push_in"');
    expect(markup).toContain('data-director-adapter="math_scene"');
    expect(markup).not.toContain("transform:scale(1.0125)");
  });

  it("merges simultaneous math plot layers into one scene", () => {
    remotionState.frame = 60;
    const markup = renderToStaticMarkup(<PlaybookComposition script={layeredMathScript()} showSubtitles={false} />);
    expect(markup.match(/class="math-plot-renderer"/g)).toHaveLength(1);
    expect(markup).toContain("tangent");
    expect(markup).toContain("<polygon");
  });

  it("fails closed instead of attaching input to an ambiguous multi-plot layer", () => {
    remotionState.frame = 30;
    const markup = renderToStaticMarkup(
      <PlaybookComposition
        script={layeredMathScript()}
        showSubtitles={false}
        onInteraction={vi.fn()}
      />,
    );

    expect(markup).not.toContain('role="slider"');
    expect(markup).not.toContain('data-interaction-target="marker-x"');
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

  it("keeps the semantic stage layer mounted when the visual snapshot changes", () => {
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

    expect(firstPolylinePointCount(markup)).toBeGreaterThan(100);
    expect(markup).toContain('data-visual-continuation="true"');
  });

  it("renders the new step base layer opaque over a stable stage background at the boundary", () => {
    const script = twoStepScript(
      step({
        id: "s1",
        endFrame: 60,
        title: "先看抛物线",
        voiceover: "第一段说明",
        snapshot: plotSnapshot("x^2"),
        layers: [
          {
            timing: { enter_at: 0, exit_at: 1, appear_anim: "fade", z_order: 0 },
            body: plotSnapshot("x^2"),
          },
        ],
      }),
      step({
        id: "s2",
        endFrame: 120,
        title: "切换到正弦",
        voiceover: "第二段说明",
        snapshot: plotSnapshot("sin(x)"),
        layers: [
          {
            timing: { enter_at: 0, exit_at: 1, appear_anim: "fade", z_order: 0 },
            body: plotSnapshot("sin(x)"),
          },
        ],
      }),
    );

    remotionState.frame = 60;
    const markup = renderToStaticMarkup(
      <PlaybookComposition script={script} showSubtitles={false} theme="dark" />,
    );
    const baseLayer = layerOpenTag(markup, "math_plot");

    expect(markup).toContain("scene-compositor");
    expect(markup).toContain("background:#0f1117");
    expect(baseLayer).not.toBe("");
    expect(baseLayer).toContain("opacity:1");
    expect(baseLayer).not.toContain("opacity:0");
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

  it("exposes only the unique target layer without letting its wrapper block the stage", () => {
    const graph = {
      kind: "graph_scene" as const,
      nodes: [{ id: "A" }, { id: "B" }],
      edges: [{ source: "A", target: "B" }],
    };
    const script: PlaybookScript = {
      fps: 30,
      total_frames: 60,
      domain: "algorithm",
      algorithm_id: "bfs",
      title: "BFS",
      summary: "",
      parameter_controls: [],
      steps: [{
        step_id: "graph",
        end_frame: 60,
        title: "Graph",
        voiceover_text: "",
        tokens: [],
        snapshot: graph,
        layers: [{
          id: "graph-layer",
          timing: { enter_at: 0, exit_at: 1, appear_anim: "none", z_order: 0 },
          body: graph,
        }, {
          id: "caption-layer",
          timing: { enter_at: 0, exit_at: 1, appear_anim: "none", z_order: 1 },
          body: { kind: "narration_card", text: "Explain", position: "bottom" },
        }],
      }],
    };

    const markup = renderToStaticMarkup(
      <PlaybookComposition
        script={script}
        showSubtitles={false}
        interactionTargetKind="graph_scene"
        onInteraction={vi.fn()}
      />,
    );

    expect(layerOpenTag(markup, "graph_scene")).toContain("pointer-events:none");
    expect(markup).toContain('data-interaction-target="start-node"');
    expect(markup).toContain('role="button"');
  });

  it("fails closed when more than one layer matches the interaction target", () => {
    const graph = {
      kind: "graph_scene" as const,
      nodes: [{ id: "A" }],
      edges: [],
    };
    const script: PlaybookScript = {
      fps: 30,
      total_frames: 60,
      domain: "algorithm",
      algorithm_id: "bfs",
      title: "Ambiguous BFS",
      summary: "",
      parameter_controls: [],
      steps: [{
        step_id: "graph",
        end_frame: 60,
        title: "Graph",
        voiceover_text: "",
        tokens: [],
        snapshot: graph,
        layers: [0, 1].map((zOrder) => ({
          id: `graph-${zOrder}`,
          timing: { enter_at: 0, exit_at: 1, appear_anim: "none" as const, z_order: zOrder },
          body: graph,
        })),
      }],
    };

    const markup = renderToStaticMarkup(
      <PlaybookComposition
        script={script}
        showSubtitles={false}
        interactionTargetKind="graph_scene"
        onInteraction={vi.fn()}
      />,
    );

    expect(markup).not.toContain('data-interaction-target="start-node"');
    expect(markup).not.toContain('role="button"');
  });
});
