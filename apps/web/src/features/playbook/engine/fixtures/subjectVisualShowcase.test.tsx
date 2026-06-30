import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { PlaybookComposition } from "../composition/PlaybookComposition";
import { visualQualityGate } from "../assets/visualQualityGate";
import {
  getSubjectVisualShowcaseEntry,
  listSubjectVisualShowcaseEntries,
} from "./subjectVisualShowcase";

vi.mock("remotion", async () => {
  const actual = await vi.importActual<typeof import("remotion")>("remotion");
  return {
    ...actual,
    useCurrentFrame: () => 0,
    useVideoConfig: () => ({ fps: 30 }),
  };
});

const FLAGSHIP_IDS = [
  "east_asia_monsoon",
  "projectile_motion",
  "cell_structure",
  "dna_replication",
  "molecule_2d_water",
  "molecule_2d_methane",
  "reaction_synthesis_water",
  "derivative_tangent",
  "bfs_graph",
  "recursion_stack",
  "binary_search",
];

describe("subject visual showcase catalog", () => {
  it("lists the roadmap flagship fixtures with renderer and asset pack metadata", () => {
    const entries = listSubjectVisualShowcaseEntries();

    expect(entries.map((entry) => entry.id)).toEqual(FLAGSHIP_IDS);
    expect(entries.map((entry) => entry.packId)).toEqual([
      "geography-earth-basic",
      "physics-basic",
      "biology-basic",
      "biology-basic",
      "chemistry-basic",
      "chemistry-basic",
      "chemistry-basic",
      "math-basic",
      "algorithm-code-basic",
      "algorithm-code-basic",
      "algorithm-code-basic",
    ]);
    expect(entries.map((entry) => entry.rendererKind)).toEqual([
      "geo_map_scene",
      "physics_force_scene",
      "bio_cell_scene",
      "bio_process_scene",
      "molecule_2d_scene",
      "molecule_2d_scene",
      "reaction_scene",
      "math_plot",
      "graph_scene",
      "call_stack_scene",
      "code_trace_scene",
    ]);
    expect(getSubjectVisualShowcaseEntry("bfs_graph")?.showInlineCode).toBe(true);
  });

  it.each(FLAGSHIP_IDS)("passes visual quality gate for %s", (fixtureId) => {
    const entry = getSubjectVisualShowcaseEntry(fixtureId);
    expect(entry, fixtureId).toBeTruthy();

    const warnings = visualQualityGate(entry!.script);
    expect(warnings, fixtureId).toEqual([]);
  });

  it.each(FLAGSHIP_IDS)("statically renders showcase fixture %s with required visual markers", (fixtureId) => {
    const entry = getSubjectVisualShowcaseEntry(fixtureId);
    if (!entry) throw new Error(`Missing showcase entry ${fixtureId}`);

    const markup = renderToStaticMarkup(
      <PlaybookComposition
        script={entry.script}
        showInlineCode={entry.showInlineCode}
        showSubtitles={false}
      />,
    );

    for (const marker of entry.requiredMarkers) {
      expect(markup, `${fixtureId} missing ${marker}`).toContain(marker);
    }
    expect(markup).not.toContain("Unknown snapshot kind");
    expect(markup).not.toContain('data-missing-asset="true"');
    expect(markup).not.toContain("data-visual-quality-warning-count");
  });

  it("documents the flagship fixture matrix and render commands", () => {
    const docs = readFileSync(path.resolve(process.cwd(), "../../docs/assets.md"), "utf8");

    expect(docs).toContain("Flagship Fixture Matrix");
    expect(docs).toContain("npm --workspace apps/web run showcase:export");
    expect(docs).toContain("npm --workspace apps/web run showcase:smoke");
    expect(docs).toContain("node apps/web/scripts/render-shots.mjs");
    for (const fixtureId of FLAGSHIP_IDS) {
      expect(docs).toContain(fixtureId);
    }
  });
});
