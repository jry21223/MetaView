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

  it("warns when biology cell scene has too few semantic assets", () => {
    const warnings = visualQualityGate(
      script({
        domain: "biology",
        steps: [
          {
            step_id: "cell_structure",
            end_frame: 90,
            title: "Cell structure",
            voiceover_text: "",
            tokens: [],
            snapshot: {
              kind: "bio_cell_scene",
              pack_id: "biology-basic",
              cell_type: "animal",
              structures: [
                { id: "cell", semantic_role: "cell", label: "cell", x: 50, y: 52, width: 66, height: 50 },
              ],
              callouts: [],
            },
          },
        ],
      }),
    );

    expect(warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "low_biology_structure_assets",
          step_id: "cell_structure",
          domain: "biology",
          snapshot_kind: "bio_cell_scene",
        }),
      ]),
    );
  });

  it("warns when a biology asset_id cannot be resolved", () => {
    const warnings = visualQualityGate(
      script({
        domain: "biology",
        steps: [
          {
            step_id: "cell_structure",
            end_frame: 90,
            title: "Cell structure",
            voiceover_text: "",
            tokens: [],
            snapshot: {
              kind: "bio_cell_scene",
              pack_id: "biology-basic",
              cell_type: "animal",
              structures: [
                { id: "cell", semantic_role: "cell", label: "cell", x: 50, y: 52, width: 66, height: 50, asset_id: "missing-cell" },
                { id: "nucleus", semantic_role: "nucleus", label: "nucleus", x: 49, y: 50, width: 20, height: 18, asset_id: "nucleus" },
              ],
              callouts: [],
            },
          },
        ],
      }),
    );

    expect(warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "missing_asset",
          step_id: "cell_structure",
          asset_id: "missing-cell",
          pack_id: "biology-basic",
        }),
      ]),
    );
  });
});
