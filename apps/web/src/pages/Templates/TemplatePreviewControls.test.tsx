import { cleanup, render } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";

import { TemplatePreviewControls } from "./TemplatePreviewControls";
import { getTemplatePreviewCase } from "./templatePreviewCases";

const noop = () => {};

function renderControls(caseId: string, currentStepId: string) {
  const previewCase = getTemplatePreviewCase(caseId)!;
  return render(
    <TemplatePreviewControls
      previewCase={previewCase}
      params={previewCase.defaultParams}
      onChange={noop}
      onReset={noop}
      currentStepId={currentStepId}
    />,
  );
}

describe("TemplatePreviewControls per-step filtering", () => {
  afterEach(cleanup);

  it("renders only the controls that act on the current step", () => {
    const view = renderControls("rabbit-chaos", "chaos-butterfly");
    expect(view.getByText("初始兔群 N₀")).toBeTruthy();
    expect(view.queryByText("年增长率 r")).toBeNull();
    expect(view.queryByText(/本步暂不支持调整参数/)).toBeNull();
  });

  it("announces frozen steps instead of showing inert sliders", () => {
    const view = renderControls("rabbit-chaos", "chaos-lorenz-shape");
    expect(view.getByText("本步暂不支持调整参数。")).toBeTruthy();
    expect(view.queryByText("年增长率 r")).toBeNull();
    expect(view.queryByText("初始兔群 N₀")).toBeNull();
    expect(view.getByRole("button", { name: "恢复默认参数" })).toBeTruthy();
  });

  it("keeps legacy unscoped cases showing every control", () => {
    const view = renderControls("binary-search", "any-step");
    expect(view.getByText("目标值")).toBeTruthy();
    expect(view.queryByText(/本步暂不支持调整参数/)).toBeNull();
  });
});
