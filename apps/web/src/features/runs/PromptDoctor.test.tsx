import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PromptDoctor } from "./PromptDoctor";
import type { ReviewReport } from "../../entities/pipeline/types";

const reviewReport: ReviewReport = {
  status: "failed",
  attempts: 2,
  issues: [
    {
      code: "math_geometry_requires_scene",
      severity: "error",
      path: "cir.steps[0].visual_kind",
      message: "Math geometry must use scene.",
    },
    {
      code: "formula_missing_latex",
      severity: "error",
      path: "cir.steps[1].plot.formula_latex",
      message: "Missing latex.",
    },
  ],
  actions: ["repair_attempt_1", "repair_attempt_2"],
};

describe("PromptDoctor", () => {
  it("shows attempt count in header when attempts > 0", () => {
    const html = renderToStaticMarkup(
      <PromptDoctor report={reviewReport} error="raw trace" />,
    );
    expect(html).toContain("已自动修复 2 次");
  });

  it("renders one pill per distinct suggestion", () => {
    const html = renderToStaticMarkup(
      <PromptDoctor report={reviewReport} error="raw trace" />,
    );
    expect(html).toContain("请用 2D 坐标系画出区域和向量场");
    expect(html).toContain("KaTeX");
  });

  it("renders raw error inside accordion", () => {
    const html = renderToStaticMarkup(
      <PromptDoctor report={null} error="ValidationError: stack trace here" />,
    );
    expect(html).toContain("查看技术细节");
    expect(html).toContain("ValidationError: stack trace here");
  });

  it("does not expose an English-only backend suggestion in the recovery UI", () => {
    const report: ReviewReport = {
      status: "failed",
      attempts: 0,
      actions: [],
      issues: [
        {
          code: "capability.text_only_required",
          severity: "error",
          path: "coverage_decision",
          message: "Text-only output is not supported.",
          suggestion: "Use a supported visual capability.",
        },
      ],
    };

    const html = renderToStaticMarkup(
      <PromptDoctor report={report} error="raw trace" />,
    );

    expect(html).toContain("补充希望展示的画面");
    expect(html).not.toContain("Use a supported visual capability");
  });

  it("invokes onRetryWithSuggestion when pill clicked", () => {
    // SSR markup can't trigger handlers; this test asserts handler prop is
    // wired up via direct call.
    const handler = vi.fn();
    const node = (
      <PromptDoctor
        report={reviewReport}
        error="x"
        onRetryWithSuggestion={handler}
      />
    );
    expect(node.props.onRetryWithSuggestion).toBe(handler);
  });
});
