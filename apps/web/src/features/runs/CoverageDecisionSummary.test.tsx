import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type {
  CoverageDecision,
  CoverageMode,
} from "../../entities/pipeline/types";
import { CoverageDecisionSummary } from "./CoverageDecisionSummary";

const MODE_EXPECTATION: Record<CoverageMode, string> = {
  specialized: "专用能力",
  composable: "受控组合",
  experimental: "实验性",
  unsupported: "不支持",
};

function decision(mode: CoverageMode): CoverageDecision {
  const fallbackByMode: Record<CoverageMode, CoverageDecision["fallback_policy"]> = {
    specialized: "use_skill",
    composable: "compose",
    experimental: "limited_visual",
    unsupported: "reject",
  };

  return {
    mode,
    domain: "algorithm",
    confidence: 0.92,
    matched_skill_ids: ["algorithm.binary_search"],
    available_tool_ids: ["scene_blueprint.compile", "playbook.self_check"],
    missing_capabilities:
      mode === "experimental" || mode === "unsupported"
        ? ["algorithm.state_validator"]
        : [],
    fallback_policy: fallbackByMode[mode],
    reason: `${mode} coverage reason`,
  };
}

describe("CoverageDecisionSummary", () => {
  afterEach(cleanup);

  it.each<CoverageMode>([
    "specialized",
    "composable",
    "experimental",
    "unsupported",
  ])("renders the %s backend decision", (mode) => {
    render(<CoverageDecisionSummary decision={decision(mode)} />);

    const summary = screen.getByLabelText("能力覆盖判定");
    expect(summary.getAttribute("data-coverage-mode")).toBe(mode);
    expect(screen.getByText(MODE_EXPECTATION[mode])).not.toBeNull();
    expect(screen.getByText("算法")).not.toBeNull();
    expect(screen.getByText("92%")).not.toBeNull();
  });

  it("shows a user-readable summary without engineering identifiers by default", () => {
    render(<CoverageDecisionSummary decision={decision("unsupported")} />);

    expect(
      screen.getByText("当前能力不足，暂时不能安全生成可播放讲解。"),
    ).not.toBeNull();
    expect(screen.queryByText("unsupported coverage reason")).toBeNull();
    expect(screen.queryByText("algorithm.binary_search")).toBeNull();
    expect(screen.queryByText("scene_blueprint.compile")).toBeNull();
    expect(screen.queryByText("algorithm.state_validator")).toBeNull();
    expect(screen.getByText("不生成")).not.toBeNull();
  });

  it("shows capability identifiers only in technical review mode", () => {
    render(
      <CoverageDecisionSummary
        decision={decision("unsupported")}
        showTechnicalDetails
      />,
    );

    expect(screen.getByText("algorithm.binary_search")).not.toBeNull();
    expect(screen.getByText("scene_blueprint.compile")).not.toBeNull();
    expect(screen.getByText("playbook.self_check")).not.toBeNull();
    expect(screen.getByText("algorithm.state_validator")).not.toBeNull();
    expect(screen.getByText("unsupported coverage reason")).not.toBeNull();
  });

  it("renders nothing when the backend has no coverage decision", () => {
    const { container } = render(<CoverageDecisionSummary decision={null} />);

    expect(container.firstChild).toBeNull();
  });
});
