import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MotionSceneRenderer } from "./MotionSceneRenderer";
import { rendererRegistry } from "./registry";
import type { MetaStep } from "../types";
import type { MotionSceneSnapshot } from "../motion/types";
import type { RendererProps } from "./types";

function makeScene(extra: Partial<MotionSceneSnapshot> = {}): MotionSceneSnapshot {
  return {
    kind: "motion_scene",
    viewport: {
      width: 960,
      height: 540,
      world: { xMin: 0, xMax: 960, yMin: 0, yMax: 540 },
    },
    objects: [
      {
        id: "triangle",
        type: "polygon",
        points: [
          [220, 380],
          [580, 380],
          [220, 140],
        ],
        label: "triangle",
        style: "primary",
      },
      {
        id: "baseline",
        type: "segment",
        x1: 220,
        y1: 380,
        x2: 580,
        y2: 380,
        style: "accent",
      },
      {
        id: "formula",
        type: "text",
        x: 650,
        y: 120,
        text: "a^2 + b^2 = c^2",
        style: "title",
      },
    ],
    tracks: [
      {
        target: "baseline",
        property: "drawProgress",
        keyframes: [
          { t: 0, value: 0 },
          { t: 1, value: 1 },
        ],
        easing: "linear",
      },
      {
        target: "formula",
        property: "opacity",
        keyframes: [
          { t: 0, value: 0 },
          { t: 1, value: 1 },
        ],
        easing: "linear",
      },
    ],
    camera: {
      keyframes: [
        { t: 0, x: 480, y: 270, zoom: 1 },
        { t: 1, x: 300, y: 320, zoom: 1.5 },
      ],
      easing: "linear",
    },
    ...extra,
  };
}

function sceneStep(snapshot: MotionSceneSnapshot): MetaStep {
  return {
    step_id: "motion-demo",
    end_frame: 90,
    title: "Motion demo",
    voiceover_text: "Object identity demo",
    snapshot,
    tokens: [],
  };
}

function props(snapshot: MotionSceneSnapshot, overrides: Partial<RendererProps> = {}): RendererProps {
  const step = sceneStep(snapshot);
  return {
    step,
    prevStep: null,
    frame: 45,
    stepStartFrame: 0,
    stepEndFrame: 90,
    progress: 0.5,
    theme: "dark",
    ...overrides,
  };
}

function render(snapshot: MotionSceneSnapshot, overrides: Partial<RendererProps> = {}): string {
  return renderToStaticMarkup(<MotionSceneRenderer {...props(snapshot, overrides)} />);
}

describe("MotionSceneRenderer", () => {
  it("is registered for the motion_scene snapshot kind", () => {
    expect(rendererRegistry.get("motion_scene")).toBe(MotionSceneRenderer);
  });

  it("renders the svg scaffold and stable object ids", () => {
    const markup = render(makeScene());

    expect(markup).toContain("motion-scene-renderer");
    expect(markup).toContain('data-theme="dark"');
    expect(markup).toContain("<svg");
    expect(markup).toContain('data-object-id="triangle"');
    expect(markup).toContain('data-object-id="baseline"');
    expect(markup).toContain("a^2 + b^2 = c^2");
  });

  it("applies the evaluated camera transform", () => {
    const markup = render(makeScene());

    expect(markup).toContain("translate(480, 270) scale(1.25) translate(-390, -295)");
  });

  it("uses viewport world bounds for generated motion scenes", () => {
    const markup = render(
      makeScene({
        viewport: {
          width: 1280,
          height: 720,
          world: { xMin: -6, xMax: 6, yMin: -3.5, yMax: 3.5 },
        },
        objects: [
          {
            id: "triangle",
            type: "polygon",
            points: [
              [-4, -2],
              [0, -2],
              [-4, 2],
            ],
            label: "triangle",
            style: "primary",
          },
          {
            id: "baseline",
            type: "segment",
            x1: -4,
            y1: -2,
            x2: 0,
            y2: -2,
            style: "accent",
          },
          {
            id: "formula",
            type: "text",
            x: 2,
            y: 2,
            text: "a^2 + b^2 = c^2",
            style: "title",
          },
        ],
        camera: null,
      }),
      { progress: 0.5 },
    );

    expect(markup).toContain('viewBox="0 0 1280 720"');
    expect(markup).toContain("213.33333333333334,565.7142857142858");
    expect(markup).toContain("640,565.7142857142858");
    expect(markup).toContain("translate(640, 360) scale(1) translate(-640, -360)");
  });

  it("uses drawProgress to grow a segment", () => {
    const start = render(makeScene(), { progress: 0 });
    const middle = render(makeScene(), { progress: 0.5 });
    const end = render(makeScene(), { progress: 1 });

    expect(start).toContain('x2="220"');
    expect(middle).toContain('x2="400"');
    expect(end).toContain('x2="580"');
  });

  it("uses opacity tracks while unchanged objects stay visible", () => {
    const markup = render(makeScene(), { progress: 0 });

    expect(markup).toContain('data-object-id="triangle"');
    expect(markup).toContain('opacity="1"');
    expect(markup).toContain('data-object-id="formula" data-highlight="0.000" opacity="0"');
  });
});
