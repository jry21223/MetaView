import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { PlaybookComposition } from "../composition/PlaybookComposition";
import { getSubjectVisualFixture } from "./subjectVisualFixtures";

vi.mock("remotion", async () => {
  const actual = await vi.importActual<typeof import("remotion")>("remotion");
  return {
    ...actual,
    useCurrentFrame: () => 0,
    useVideoConfig: () => ({ fps: 30 }),
  };
});

describe("subject visual fixtures", () => {
  it("statically renders east_asia_monsoon through PlaybookComposition", () => {
    const markup = renderToStaticMarkup(
      <PlaybookComposition script={getSubjectVisualFixture("east_asia_monsoon")} showSubtitles={false} />,
    );

    expect(markup).toContain("geo-map-scene");
    expect(markup).toContain('data-asset-id="east-asia-map-placeholder"');
    expect(markup).toContain('data-asset-id="monsoon-wind-arrow"');
    expect(markup).not.toContain("Unknown snapshot kind");
    expect(markup).not.toContain('data-missing-asset="true"');
  });

  it("statically renders projectile_motion through PlaybookComposition", () => {
    const markup = renderToStaticMarkup(
      <PlaybookComposition script={getSubjectVisualFixture("projectile_motion")} showSubtitles={false} />,
    );

    expect(markup).toContain("physics-force-scene");
    expect(markup).toContain('data-asset-id="projectile-body-dot"');
    expect(markup).toContain('data-asset-id="force-vector-arrow"');
    expect(markup).toContain('data-semantic-role="motion_trail"');
    expect(markup).not.toContain("Unknown snapshot kind");
    expect(markup).not.toContain('data-missing-asset="true"');
  });
});
