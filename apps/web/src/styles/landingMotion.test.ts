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

  it("reveals physics vectors from the moving point instead of fading the whole group", () => {
    const contentCss = landingStyles("content.css");

    expect(contentCss).not.toMatch(
      /\.mv-lesson-scene-layer\.is-active \.mv-lesson-scene--physics \.mv-scene-analysis\s*\{[^}]*mvLandingAnalysisIn/s,
    );
    expect(contentCss).toMatch(
      /\.mv-lesson-scene-layer\.is-active \.mv-lesson-scene--physics \.mv-scene-focus\s*\{[^}]*mvLandingPointReveal/s,
    );
    expect(contentCss).toMatch(
      /\.mv-lesson-scene-layer\.is-active \.mv-scene-vector-branch--component\s*\{[^}]*mvLandingLineGrow/s,
    );
    expect(contentCss).toMatch(
      /\.mv-lesson-scene-layer\.is-active \.mv-scene-vector-branch--result\s*\{[^}]*mvLandingLineGrow/s,
    );
    expect(contentCss).toMatch(
      /\.mv-lesson-scene-layer\.is-active \.mv-scene-vector-annotation--result\s*\{[^}]*mvLandingLabelReveal/s,
    );
    expect(contentCss).toMatch(
      /\.mv-lesson-scene-layer\.is-active \.mv-scene-vector-annotation--component\s*\{[^}]*mvLandingLabelReveal/s,
    );

    const componentTiming = contentCss.match(
      /\.mv-lesson-scene-layer\.is-active \.mv-scene-vector-branch--component\s*\{[^}]*mvLandingLineGrow\s+(\d+)ms\s+(\d+)ms/s,
    );
    const resultTiming = contentCss.match(
      /\.mv-lesson-scene-layer\.is-active \.mv-scene-vector-branch--result\s*\{[^}]*mvLandingLineGrow\s+(\d+)ms\s+(\d+)ms/s,
    );
    const resultAnnotationTiming = contentCss.match(
      /\.mv-lesson-scene-layer\.is-active \.mv-scene-vector-annotation--result\s*\{[^}]*mvLandingLabelReveal\s+(\d+)ms\s+(\d+)ms/s,
    );
    const componentAnnotationTiming = contentCss.match(
      /\.mv-lesson-scene-layer\.is-active \.mv-scene-vector-annotation--component\s*\{[^}]*mvLandingLabelReveal\s+(\d+)ms\s+(\d+)ms/s,
    );
    const projectionTiming = contentCss.match(
      /\.mv-lesson-scene-layer\.is-active \.mv-scene-vector-projections\s*\{[^}]*mvLandingLabelReveal\s+(\d+)ms\s+(\d+)ms/s,
    );
    const resultEnd = Number(resultTiming?.[1]) + Number(resultTiming?.[2]);
    const componentEnd = Number(componentTiming?.[1]) + Number(componentTiming?.[2]);

    const resultAnnotationEnd =
      Number(resultAnnotationTiming?.[1]) + Number(resultAnnotationTiming?.[2]);
    const projectionEnd = Number(projectionTiming?.[1]) + Number(projectionTiming?.[2]);
    expect(Number(resultAnnotationTiming?.[2])).toBeGreaterThanOrEqual(resultEnd);
    expect(Number(componentTiming?.[2])).toBeGreaterThanOrEqual(resultAnnotationEnd);
    expect(Number(projectionTiming?.[2])).toBeGreaterThanOrEqual(componentEnd);
    expect(Number(componentAnnotationTiming?.[2])).toBeGreaterThanOrEqual(projectionEnd);
  });

  it("pins every causal physics layer in reduced-motion mode", () => {
    const compatCss = landingStyles("compat.css");

    expect(compatCss).toMatch(
      /prefers-reduced-motion:[\s\S]*\.mv-scene-vector-branch[\s\S]*stroke-dashoffset:\s*0/,
    );
    expect(compatCss).toMatch(
      /prefers-reduced-motion:[\s\S]*\.mv-scene-vector-annotation[\s\S]*opacity:\s*1/,
    );
    expect(compatCss).toMatch(
      /prefers-reduced-motion:[\s\S]*\.mv-scene-vector-projections[\s\S]*opacity:\s*1/,
    );
  });
});
