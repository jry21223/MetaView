import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { PlaybookScript } from "../types";
import type { VisualQualityWarning } from "../assets/visualQualityGate";

const remotionState = vi.hoisted(() => ({ frame: 0 }));
const qualityState = vi.hoisted(() => ({ warnings: [] as VisualQualityWarning[] }));

vi.mock("remotion", async () => {
  const actual = await vi.importActual<typeof import("remotion")>("remotion");
  return {
    ...actual,
    useCurrentFrame: () => remotionState.frame,
    useVideoConfig: () => ({ fps: 30 }),
  };
});

vi.mock("../assets/visualQualityGate", async () => {
  const actual = await vi.importActual<typeof import("../assets/visualQualityGate")>(
    "../assets/visualQualityGate",
  );
  return {
    ...actual,
    visualQualityGate: () => qualityState.warnings,
  };
});

import { PlaybookComposition } from "./PlaybookComposition";

function mathScript(): PlaybookScript {
  return {
    fps: 30,
    total_frames: 60,
    domain: "math",
    title: "Attribution summary fixture",
    summary: "",
    parameter_controls: [],
    steps: [
      {
        step_id: "s1",
        end_frame: 60,
        title: "Plot",
        voiceover_text: "",
        tokens: [],
        snapshot: {
          kind: "math_plot",
          curves: [{ expression: "x^2", label: "f(x)" }],
          x_min: -2,
          x_max: 2,
          x_label: "x",
          y_label: "y",
          formula_latex: "f(x)=x^2",
        },
      },
    ],
  };
}

describe("PlaybookComposition asset attribution metadata", () => {
  it("exposes attribution and license-risk summary for preview/export surfaces", () => {
    qualityState.warnings = [
      {
        code: "asset_requires_attribution",
        step_id: "s1",
        snapshot_kind: "math_plot",
        snapshot_path: "snapshot",
        asset_id: "cc-by-diagram",
        pack_id: "math-basic",
        license: "cc-by-4.0",
        commercialUseStatus: "allowed-with-attribution",
        attribution: "Example Creator",
        sourceUrl: "https://example.test/asset",
        licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
        message: "requires attribution",
      },
      {
        code: "asset_commercial_use_restricted",
        step_id: "s1",
        snapshot_kind: "math_plot",
        snapshot_path: "snapshot",
        asset_id: "restricted-diagram",
        pack_id: "math-basic",
        license: "unknown",
        commercialUseStatus: "restricted",
        attribution: "Unknown source",
        message: "commercial restricted",
      },
    ];

    const markup = renderToStaticMarkup(<PlaybookComposition script={mathScript()} showSubtitles={false} />);

    expect(markup).toContain('data-asset-attribution-count="1"');
    expect(markup).toContain('data-asset-attribution-ids="math-basic/cc-by-diagram"');
    expect(markup).toContain('data-asset-license-risk-count="1"');
    expect(markup).toContain('data-asset-license-risk-ids="math-basic/restricted-diagram"');
    expect(markup).toContain("Example Creator");
    expect(markup).toContain("Unknown source");
  });
});
