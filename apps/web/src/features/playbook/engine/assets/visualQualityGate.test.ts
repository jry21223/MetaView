import { describe, expect, it } from "vitest";

import type { PlaybookScript } from "../types";
import { visualQualityGate } from "./visualQualityGate";

function script(overrides: Partial<PlaybookScript> = {}): PlaybookScript {
  return {
    fps: 30,
    total_frames: 90,
    domain: "physics",
    title: "quality fixture",
    summary: "quality fixture",
    parameter_controls: [],
    steps: [],
    ...overrides,
  };
}

describe("visualQualityGate", () => {
  it("warns when an asset_id cannot be resolved", () => {
    const warnings = visualQualityGate(
      script({
        steps: [
          {
            step_id: "projectile_motion",
            end_frame: 90,
            title: "平抛运动",
            voiceover_text: "",
            tokens: [],
            snapshot: {
              kind: "physics_force_scene",
              pack_id: "physics-basic",
              objects: [{ id: "body", label: "小球", x: 30, y: 42, asset_id: "missing-projectile" }],
              vectors: [],
              trajectory: [[18, 34], [32, 42]],
            },
          },
        ],
      }),
    );

    expect(warnings).toMatchObject([
      {
        code: "missing_asset",
        step_id: "projectile_motion",
        asset_id: "missing-projectile",
        pack_id: "physics-basic",
      },
    ]);
  });

  it("warns when geography falls back to algorithm_array", () => {
    const warnings = visualQualityGate(
      script({
        domain: "geography",
        steps: [
          {
            step_id: "array-fallback",
            end_frame: 90,
            title: "不支持的数组兜底",
            voiceover_text: "",
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
      }),
    );

    expect(warnings).toMatchObject([
      {
        code: "unsupported_array_fallback",
        step_id: "array-fallback",
        domain: "geography",
        snapshot_kind: "algorithm_array",
      },
    ]);
  });
});
