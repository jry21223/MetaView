import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const landingStyles = (name: string) =>
  fs.readFileSync(
    path.resolve(process.cwd(), "src/styles/pages/landing", name),
    "utf8",
  );

describe("Landing causal scene motion", () => {
  it("reveals the math analysis from its focus instead of fading the whole group", () => {
    const contentCss = landingStyles("content.css");
    const compatCss = landingStyles("compat.css");

    expect(contentCss).not.toMatch(
      /\.mv-lesson-scene-layer\.is-active \.mv-scene-analysis\s*\{[^}]*mvLandingAnalysisIn/s,
    );
    expect(contentCss).toMatch(
      /\.mv-lesson-scene-layer\.is-active \.mv-lesson-scene--math \.mv-scene-focus\s*\{[^}]*mvLandingPointReveal/s,
    );
    expect(contentCss).toMatch(
      /\.mv-lesson-scene-layer\.is-active \.mv-scene-tangent-branch\s*\{[^}]*mvLandingLineGrow/s,
    );
    expect(contentCss).toMatch(
      /\.mv-lesson-scene-layer\.is-active \.mv-scene-guide-branch\s*\{[^}]*mvLandingLineGrow/s,
    );
    expect(contentCss).toMatch(
      /\.mv-lesson-scene-layer\.is-active \.mv-scene-analysis-labels\s*\{[^}]*mvLandingLabelReveal/s,
    );
    expect(compatCss).toContain("@keyframes mvLandingPointReveal");
    expect(compatCss).toContain("@keyframes mvLandingLineGrow");
    expect(compatCss).toContain("@keyframes mvLandingLabelReveal");
  });

  it("pins every causal math layer in reduced-motion mode", () => {
    const compatCss = landingStyles("compat.css");

    expect(compatCss).toMatch(
      /prefers-reduced-motion:[\s\S]*\.mv-scene-tangent-branch[\s\S]*stroke-dashoffset:\s*0/,
    );
    expect(compatCss).toMatch(
      /prefers-reduced-motion:[\s\S]*\.mv-scene-analysis-labels[\s\S]*opacity:\s*1/,
    );
  });
});
