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

  it("warns when a biology process asset_id cannot be resolved", () => {
    const warnings = visualQualityGate(
      script({
        domain: "biology",
        steps: [
          {
            step_id: "dna_replication",
            end_frame: 90,
            title: "DNA replication",
            voiceover_text: "",
            tokens: [],
            snapshot: {
              kind: "bio_process_scene",
              pack_id: "biology-basic",
              process_id: "dna_replication",
              steps: [
                { id: "template", semantic_role: "dna", label: "template", x: 22, y: 48, width: 18, height: 38, asset_id: "dna-helix" },
                { id: "fork", semantic_role: "process_step", label: "fork", x: 50, y: 48, width: 24, height: 24, asset_id: "missing-fork" },
              ],
              connections: [
                { id: "template-to-fork", from: "template", to: "fork", semantic_role: "flow_arrow", asset_id: "core-flow-arrow" },
              ],
            },
          },
        ],
      }),
    );

    expect(warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "missing_asset",
          step_id: "dna_replication",
          asset_id: "missing-fork",
          pack_id: "biology-basic",
        }),
      ]),
    );
  });

  it("warns when a chemistry molecule asset_id cannot be resolved", () => {
    const warnings = visualQualityGate(
      script({
        domain: "chemistry",
        steps: [
          {
            step_id: "molecule_2d_water",
            end_frame: 90,
            title: "Water molecule",
            voiceover_text: "",
            tokens: [],
            snapshot: {
              kind: "molecule_2d_scene",
              pack_id: "chemistry-basic",
              molecule_id: "water",
              molecule_asset_id: "missing-water-preset",
              atoms: [
                { id: "o", element: "O", x: 50, y: 45 },
                { id: "h1", element: "H", x: 37, y: 60 },
                { id: "h2", element: "H", x: 63, y: 60 },
              ],
              bonds: [
                { id: "oh1", from: "o", to: "h1", order: 1 },
                { id: "oh2", from: "o", to: "h2", order: 1 },
              ],
            },
          },
        ],
      }),
    );

    expect(warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "missing_asset",
          step_id: "molecule_2d_water",
          asset_id: "missing-water-preset",
          pack_id: "chemistry-basic",
        }),
      ]),
    );
  });

  it("warns when a chemistry reaction asset_id cannot be resolved", () => {
    const warnings = visualQualityGate(
      script({
        domain: "chemistry",
        steps: [
          {
            step_id: "reaction_synthesis_water",
            end_frame: 90,
            title: "Water synthesis reaction",
            voiceover_text: "",
            tokens: [],
            snapshot: {
              kind: "reaction_scene",
              pack_id: "chemistry-basic",
              reaction_id: "reaction_synthesis_water",
              reactants: [
                { id: "h2", formula_latex: "H_2", label: "hydrogen", coefficient: 2, x: 18, y: 48 },
              ],
              products: [
                { id: "h2o", formula_latex: "H_2O", label: "water", coefficient: 2, x: 78, y: 48 },
              ],
              arrows: [
                {
                  id: "main-arrow",
                  semantic_role: "reaction_arrow",
                  from: [48, 48],
                  to: [66, 48],
                  asset_id: "missing-reaction-arrow",
                },
              ],
              electron_flows: [],
            },
          },
        ],
      }),
    );

    expect(warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "missing_asset",
          step_id: "reaction_synthesis_water",
          asset_id: "missing-reaction-arrow",
          pack_id: "chemistry-basic",
        }),
      ]),
    );
  });

  it("warns when chemistry falls back to algorithm_array", () => {
    const warnings = visualQualityGate(
      script({
        domain: "chemistry",
        steps: [
          {
            step_id: "chemistry-array-fallback",
            end_frame: 90,
            title: "Unsupported chemistry fallback",
            voiceover_text: "",
            tokens: [],
            snapshot: {
              kind: "algorithm_array",
              array_values: ["H", "O", "H"],
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
        step_id: "chemistry-array-fallback",
        domain: "chemistry",
        snapshot_kind: "algorithm_array",
      },
    ]);
  });

  it("warns when a math step has formula without plot or scene", () => {
    const warnings = visualQualityGate(
      script({
        domain: "math",
        steps: [
          {
            step_id: "formula-only",
            end_frame: 90,
            title: "Formula only",
            voiceover_text: "",
            tokens: [],
            snapshot: {
              kind: "math_formula",
              formula_latex: "f'(x)=2x",
              caption: "Derivative rule",
            },
          },
        ],
      }),
    );

    expect(warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "low_math_visual_richness",
          step_id: "formula-only",
          domain: "math",
        }),
      ]),
    );
  });

  it("warns when a math plot has no formula", () => {
    const warnings = visualQualityGate(
      script({
        domain: "math",
        steps: [
          {
            step_id: "plot-without-formula",
            end_frame: 90,
            title: "Plot without formula",
            voiceover_text: "",
            tokens: [],
            snapshot: {
              kind: "math_plot",
              curves: [{ expression: "x^2", label: "f(x)" }],
              x_min: -2,
              x_max: 2,
              x_label: "x",
              y_label: "y",
            },
          },
        ],
      }),
    );

    expect(warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "low_math_visual_richness",
          step_id: "plot-without-formula",
          domain: "math",
        }),
      ]),
    );
  });

  it("warns when an algorithm graph has no active state change", () => {
    const warnings = visualQualityGate(
      script({
        domain: "algorithm",
        steps: [
          {
            step_id: "bfs_graph",
            end_frame: 90,
            title: "BFS graph",
            voiceover_text: "",
            tokens: [],
            snapshot: {
              kind: "graph_scene",
              pack_id: "algorithm-code-basic",
              asset_id: "bfs-graph-preset",
              nodes: [{ id: "A" }, { id: "B" }],
              edges: [{ id: "A-B", source: "A", target: "B" }],
              directed: true,
            },
          },
        ],
      }),
    );

    expect(warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "low_algorithm_state_visuals",
          step_id: "bfs_graph",
          domain: "algorithm",
        }),
      ]),
    );
  });
});
