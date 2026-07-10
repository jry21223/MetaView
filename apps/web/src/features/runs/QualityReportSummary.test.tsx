import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { QualityReport } from "../../entities/pipeline/types";
import { QualityReportSummary } from "./QualityReportSummary";

describe("QualityReportSummary", () => {
  it("shows the backend report without recomputing a frontend verdict", () => {
    const report: QualityReport = {
      status: "blocked",
      generator_path: "skill_pack",
      coverage_mode: "specialized",
      issues: [
        {
          code: "asset.missing",
          severity: "error",
          path: "steps[0].snapshot.asset_id",
          message: "Asset is missing.",
        },
      ],
      scores: { export_readiness: 0.65 },
      repair_targets: ["steps[0].snapshot.asset_id"],
      summary: "blocked",
      actions: [],
      attempts: 0,
    };

    render(<QualityReportSummary report={report} />);

    expect(
      screen.getByLabelText("生成质量报告").getAttribute("data-quality-status"),
    ).toBe("blocked");
    expect(screen.getByText(/skill_pack · specialized/)).not.toBeNull();
    expect(screen.getByText("asset.missing")).not.toBeNull();
  });
});
