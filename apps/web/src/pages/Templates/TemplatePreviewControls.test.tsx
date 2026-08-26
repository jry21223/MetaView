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

describe("TemplatePreviewControls step badges", () => {
  afterEach(cleanup);

  it("marks which controls act on the current step", () => {
    const view = renderControls("rabbit-chaos", "chaos-butterfly");
    expect(view.getAllByText("本步可调")).toHaveLength(1);
    expect(view.getAllByText("本步不生效")).toHaveLength(1);
    expect(view.queryByText(/当前步骤不可调参/)).toBeNull();
  });

  it("announces frozen steps where no parameter applies", () => {
    const view = renderControls("rabbit-chaos", "chaos-lorenz-shape");
    expect(view.getByText(/当前步骤不可调参/)).toBeTruthy();
    expect(view.getAllByText("本步不生效")).toHaveLength(2);
    expect(view.queryByText("本步可调")).toBeNull();
  });

  it("keeps unscoped controls badge-free", () => {
    const view = renderControls("binary-search", "any-step");
    expect(view.queryByText("本步可调")).toBeNull();
    expect(view.queryByText("本步不生效")).toBeNull();
    expect(view.queryByText(/当前步骤不可调参/)).toBeNull();
  });
});
