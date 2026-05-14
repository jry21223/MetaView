import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AutoRefinedBadge } from "./AutoRefinedBadge";
import type { ReviewReport } from "../../entities/pipeline/types";

describe("AutoRefinedBadge", () => {
  it("renders nothing when report is null", () => {
    const html = renderToStaticMarkup(<AutoRefinedBadge report={null} />);
    expect(html).toBe("");
  });

  it("renders nothing when attempts is 0", () => {
    const report: ReviewReport = {
      status: "clean",
      attempts: 0,
      issues: [],
      actions: [],
    };
    const html = renderToStaticMarkup(<AutoRefinedBadge report={report} />);
    expect(html).toBe("");
  });

  it("shows attempt count when attempts > 0", () => {
    const report: ReviewReport = {
      status: "repaired",
      attempts: 2,
      issues: [
        {
          code: "math_geometry_requires_scene",
          severity: "error",
          path: "cir.steps[0].visual_kind",
          message: "should be scene",
        },
      ],
      actions: ["repair_attempt_1", "repair_attempt_2"],
    };
    const html = renderToStaticMarkup(<AutoRefinedBadge report={report} />);
    expect(html).toContain("已自动修正");
    expect(html).toContain("(2)");
  });
});
