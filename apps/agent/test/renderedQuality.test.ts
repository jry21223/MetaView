import { describe, expect, it } from "vitest";

import { analyzeRenderedFrames, type DecodedFrame } from "../src/state/renderedQuality.js";
import type { PlaybookOutput } from "../src/state/types.js";

function frame(stepIndex: number, mutate?: (rgba: Uint8Array, width: number, height: number) => void): DecodedFrame {
  const width = 100;
  const height = 60;
  const rgba = new Uint8Array(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const offset = pixel * 4;
    rgba[offset] = 12;
    rgba[offset + 1] = 12;
    rgba[offset + 2] = 12;
    rgba[offset + 3] = 255;
  }
  for (let y = 15; y < 45; y += 1) {
    for (let x = 25; x < 75; x += 1) {
      const offset = (y * width + x) * 4;
      rgba[offset] = 230;
      rgba[offset + 1] = 230;
      rgba[offset + 2] = 230;
    }
  }
  mutate?.(rgba, width, height);
  return { stepIndex, frame: stepIndex * 180 + 120, width, height, rgba };
}

function playbook(): PlaybookOutput {
  const snapshot = { kind: "math_formula", formula_latex: "x" };
  const steps = [0, 1].map((index) => ({
    step_id: `step_0${index + 1}`,
    title: `Step ${index + 1}`,
    end_frame: (index + 1) * 180,
    narration_template: [`Narration ${index + 1}`],
    voiceover_text: `Narration ${index + 1}`,
    tokens: [],
    code_highlight: null,
    snapshot,
    layers: [
      {
        timing: { enter_at: 0, exit_at: 1, appear_anim: "fade" as const, z_order: 0 },
        body: snapshot,
      },
    ],
  }));
  return {
    fps: 30,
    total_frames: 360,
    domain: "math",
    title: "Rendered test",
    summary: "Rendered test",
    steps,
    parameter_controls: [],
  };
}

describe("rendered-frame quality gate", () => {
  it("blocks identical rendered frames when narration changes", () => {
    const first = frame(0);
    const second = frame(1);
    const report = analyzeRenderedFrames([first, second], playbook());
    expect(report.status).toBe("blocked");
    expect(report.issues.some((issue) => issue.code === "scene.progression_missing")).toBe(true);
    expect(report.metrics.minimum_consecutive_pixel_delta).toBe(0);
  });

  it("accepts a meaningful visual state change", () => {
    const first = frame(0);
    const second = frame(1, (rgba, width) => {
      for (let y = 20; y < 40; y += 1) {
        for (let x = 75; x < 95; x += 1) {
          const offset = (y * width + x) * 4;
          rgba[offset] = 200;
          rgba[offset + 1] = 80;
          rgba[offset + 2] = 80;
        }
      }
    });
    const report = analyzeRenderedFrames([first, second], playbook());
    expect(report.issues.some((issue) => issue.code === "scene.progression_missing")).toBe(false);
    expect(report.metrics.minimum_consecutive_pixel_delta).toBeGreaterThan(0.002);
  });

  it("reports content touching the viewport edge", () => {
    const clipped = frame(0, (rgba, width, height) => {
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < 10; x += 1) {
          const offset = (y * width + x) * 4;
          rgba[offset] = 240;
          rgba[offset + 1] = 240;
          rgba[offset + 2] = 240;
        }
      }
    });
    const report = analyzeRenderedFrames([clipped]);
    expect(report.issues.some((issue) => issue.code === "visual.content_clipped")).toBe(true);
  });
});
