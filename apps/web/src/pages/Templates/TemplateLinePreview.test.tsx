import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { TemplateLinePreview } from "./TemplateLinePreview";
import type { TemplatePreviewCaseId } from "./templatePreviewCases";

const CONIC_PREVIEWS: ReadonlyArray<{
  caseId: TemplatePreviewCaseId;
  geometry: string;
  objects: Record<string, number>;
}> = [
  {
    caseId: "ellipse-string-construction",
    geometry: "ellipse-string-construction",
    objects: { conic: 1, focus: 2, rope: 1, "moving-point": 1 },
  },
  {
    caseId: "ellipse-standard-equation",
    geometry: "ellipse-standard-equation",
    objects: { conic: 1, focus: 2, "characteristic-triangle": 1, "moving-point": 1 },
  },
  {
    caseId: "ellipse-focus-definition",
    geometry: "ellipse-focal-sum",
    objects: { conic: 1, focus: 2, "focal-distance": 2, "moving-point": 1 },
  },
  {
    caseId: "parabola-focus-directrix",
    geometry: "parabola-focus-directrix",
    objects: { conic: 1, directrix: 1, focus: 1, "projection-foot": 1, "moving-point": 1 },
  },
  {
    caseId: "hyperbola-asymptotes",
    geometry: "hyperbola-asymptotes",
    objects: { "conic-branch": 2, asymptotes: 1, "moving-point": 1 },
  },
  {
    caseId: "line-ellipse-position",
    geometry: "line-ellipse-position",
    objects: { conic: 1, "tangent-reference": 1, "disjoint-reference": 1, secant: 1, intersection: 2 },
  },
  {
    caseId: "ellipse-chord-midpoint-locus",
    geometry: "ellipse-chord-midpoint-locus",
    objects: { conic: 1, chord: 1, "chord-endpoint": 2, "fixed-point": 1, "theoretical-locus": 1, "chord-midpoint": 1 },
  },
];

describe("TemplateLinePreview conic descriptors", () => {
  afterEach(cleanup);

  it.each(CONIC_PREVIEWS)("keeps $caseId mathematically identifiable", ({ caseId, geometry, objects }) => {
    const { container } = render(<TemplateLinePreview caseId={caseId} />);
    const preview = container.querySelector(`[data-preview='${caseId}']`);
    const svg = preview?.querySelector(`svg[data-preview-geometry='${geometry}']`);

    expect(svg).toBeTruthy();
    for (const [object, count] of Object.entries(objects)) {
      expect(svg?.querySelectorAll(`[data-object='${object}']`)).toHaveLength(count);
    }
  });

  it("keeps the pole-polar reference preview unchanged and separate", () => {
    const { container } = render(<TemplateLinePreview caseId="pole-polar" />);

    expect(container.querySelector("[data-preview='pole-polar'] svg")).toBeTruthy();
    expect(container.querySelector("[data-preview-geometry]")).toBeNull();
  });
});
