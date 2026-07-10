import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PlaybookComposition } from "./PlaybookComposition";
import type { PlaybookScript } from "../types";

vi.mock("remotion", () => ({
  Easing: { bezier: () => (value: number) => value, inOut: (fn: (value: number) => number) => fn },
  interpolate: (value: number) => value,
  spring: () => 1,
  staticFile: (path: string) => path,
  useCurrentFrame: () => 0,
  useVideoConfig: () => ({ fps: 30, width: 1280, height: 720, durationInFrames: 120 }),
}));

function scriptWithQualityWarning(): PlaybookScript {
  return {
    schema_version: "1.0.0",
    title: "Diagnostics fixture",
    summary: "A fixture with an intentionally unresolved asset.",
    domain: "math",
    total_frames: 120,
    steps: [
      {
        step_id: "step-1",
        title: "Asset warning",
        voiceover_text: "Show the curve with an unresolved asset marker.",
        narration_template: ["Show the curve with an unresolved asset marker."],
        end_frame: 120,
        snapshot: {
          kind: "math_plot",
          curves: [{ expression: "x^2", label: "f(x)" }],
          x_min: -2,
          x_max: 2,
          x_label: "x",
          y_label: "y",
          asset_id: "missing-asset",
        },
        layers: [
          {
            timing: { enter_at: 0, exit_at: 1, appear_anim: "fade", z_order: 0 },
            body: {
              kind: "math_plot",
              curves: [{ expression: "x^2", label: "f(x)" }],
              x_min: -2,
              x_max: 2,
              x_label: "x",
              y_label: "y",
              asset_id: "missing-asset",
            },
          },
        ],
      },
    ],
  };
}

describe("PlaybookComposition diagnostics", () => {
  it("hides warning overlay and diagnostic attributes by default", () => {
    const markup = renderToStaticMarkup(<PlaybookComposition script={scriptWithQualityWarning()} showSubtitles={false} />);
    expect(markup).not.toContain("data-visual-quality-warning-icon");
    expect(markup).not.toContain("data-visual-quality-warning-count");
  });

  it("shows warning overlay only when diagnostics are enabled", () => {
    const markup = renderToStaticMarkup(
      <PlaybookComposition script={scriptWithQualityWarning()} showSubtitles={false} showDiagnostics={true} />,
    );
    expect(markup).toContain("data-visual-quality-warning-icon");
    expect(markup).toContain("data-visual-quality-warning-count");
  });
});
