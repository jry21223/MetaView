import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { PlaybookComposition } from "../composition/PlaybookComposition";
import { visualQualityGate } from "../assets/visualQualityGate";
import { DEFAULT_SHOWCASE_IMAGE_QUALITY_THRESHOLDS } from "./showcaseImageQuality";
import {
  SUBJECT_VISUAL_SHOWCASE_IDS,
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

const SHOWCASE_IDS = [...SUBJECT_VISUAL_SHOWCASE_IDS];

describe("subject visual showcase catalog", () => {
  it("lists the roadmap flagship fixtures with renderer and asset pack metadata", () => {
    const entries = listSubjectVisualShowcaseEntries();

    expect(entries.map((entry) => entry.id)).toEqual(SHOWCASE_IDS);
    expect(entries.map((entry) => entry.id)).toContain("molecule_2d_glucose");
    expect(entries.map((entry) => entry.packId)).toEqual([
      "geography-earth-basic",
      "physics-basic",
      "biology-basic",
      "biology-basic",
      "biology-basic",
      "chemistry-basic",
      "chemistry-basic",
      "chemistry-basic",
      "chemistry-basic",
      "chemistry-basic",
      "math-basic",
      "math-basic",
      "algorithm-code-basic",
      "algorithm-code-basic",
      "algorithm-code-basic",
    ]);
    expect(entries.map((entry) => entry.rendererKind)).toEqual([
      "geo_map_scene",
      "physics_force_scene",
      "bio_cell_scene",
      "bio_cell_scene",
      "bio_process_scene",
      "molecule_2d_scene",
      "molecule_2d_scene",
      "molecule_2d_scene",
      "molecule_2d_scene",
      "reaction_scene",
      "math_plot",
      "math_plot",
      "graph_scene",
      "call_stack_scene",
      "code_trace_scene",
    ]);
    expect(getSubjectVisualShowcaseEntry("bfs_graph")?.showInlineCode).toBe(true);
  });

  it.each(SHOWCASE_IDS)("declares screenshot quality baselines for %s", (fixtureId) => {
    const entry = getSubjectVisualShowcaseEntry(fixtureId);
    expect(entry, fixtureId).toBeTruthy();

    expect(entry!.imageQuality).toMatchObject({
      minWidth: DEFAULT_SHOWCASE_IMAGE_QUALITY_THRESHOLDS.minWidth,
      minHeight: DEFAULT_SHOWCASE_IMAGE_QUALITY_THRESHOLDS.minHeight,
      minNonTransparentRatio: DEFAULT_SHOWCASE_IMAGE_QUALITY_THRESHOLDS.minNonTransparentRatio,
    });
    expect(entry!.imageQuality.minBytes).toBeGreaterThanOrEqual(DEFAULT_SHOWCASE_IMAGE_QUALITY_THRESHOLDS.minBytes);
    expect(entry!.imageQuality.minUniqueColors).toBeGreaterThanOrEqual(
      DEFAULT_SHOWCASE_IMAGE_QUALITY_THRESHOLDS.minUniqueColors,
    );
    expect(entry!.imageQuality.minContentPixelRatio).toBeGreaterThanOrEqual(
      DEFAULT_SHOWCASE_IMAGE_QUALITY_THRESHOLDS.minContentPixelRatio,
    );
    expect(entry!.imageQuality.minContentWidthRatio).toBeGreaterThanOrEqual(
      DEFAULT_SHOWCASE_IMAGE_QUALITY_THRESHOLDS.minContentWidthRatio,
    );
    expect(entry!.imageQuality.minContentHeightRatio).toBeGreaterThanOrEqual(
      DEFAULT_SHOWCASE_IMAGE_QUALITY_THRESHOLDS.minContentHeightRatio,
    );
  });

  it.each(SHOWCASE_IDS)("passes visual quality gate for %s", (fixtureId) => {
    const entry = getSubjectVisualShowcaseEntry(fixtureId);
    expect(entry, fixtureId).toBeTruthy();

    const warnings = visualQualityGate(entry!.script);
    expect(warnings, fixtureId).toEqual([]);
  });

  it("exposes scene contract coverage for contract-backed showcase fixtures", () => {
    expect(getSubjectVisualShowcaseEntry("molecule_2d_water")?.contractCoverage).toMatchObject({
      status: "matched",
      contractIds: ["water-molecule-contract"],
      missingAssetIds: [],
    });
    expect(getSubjectVisualShowcaseEntry("bfs_graph")?.contractCoverage).toMatchObject({
      status: "matched",
      contractIds: ["bfs-graph-contract"],
      missingAssetIds: [],
    });
    expect(getSubjectVisualShowcaseEntry("projectile_motion")?.contractCoverage).toMatchObject({
      status: "not_applicable",
      contractIds: [],
      missingAssetIds: [],
    });
  });

  it.each(SHOWCASE_IDS)("statically renders showcase fixture %s with required visual markers", (fixtureId) => {
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
    expect(docs).toContain("molecule_2d_glucose");
    expect(docs).toContain("npm --workspace apps/web run showcase:export");
    expect(docs).toContain("npm --workspace apps/web run showcase:smoke");
    expect(docs).toContain("npm --workspace apps/web run showcase:baseline");
    expect(docs).toContain("npm --workspace apps/web run showcase:review-packet");
    expect(docs).toContain("npm --workspace apps/web run showcase:approve-reference");
    expect(docs).toContain("node apps/web/scripts/render-shots.mjs");
    expect(docs).toContain("per-fixture screenshot baseline");
    expect(docs).toContain("screenshotReview");
    expect(docs).toContain("contractCoverage");
    expect(docs).toContain("approved_reference_current");
    expect(docs).toContain("SHOWCASE_BASELINE_REQUIRE_APPROVED=1");
    for (const fixtureId of SHOWCASE_IDS) {
      expect(docs).toContain(fixtureId);
    }
  });
});
