import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { StaticFollowupPanel } from "./StaticFollowupPanel";
import type { TemplatePreviewQuestion } from "./templatePreviewCases";

describe("StaticFollowupPanel", () => {
  it("applies a local semantic operation and shows its fixed step-aware response", () => {
    const onApplyOperation = vi.fn();
    const question: TemplatePreviewQuestion = {
      id: "ellipse-distance-sum-slow",
      question: "放慢「比较距离和」",
      answer: "已只延长当前讲解段，后续时间连续顺延。",
      operation: {
        adapter_id: "math.conic-followup",
        step_id: "ellipse-distance-sum",
        target_id: "step:ellipse-distance-sum:slow-current-segment",
        action: "slow-current-segment",
        factor: 1.5,
      },
    };

    render(
      <StaticFollowupPanel
        questions={[question]}
        onApplyOperation={onApplyOperation}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: question.question }));

    expect(onApplyOperation).toHaveBeenCalledWith(question.operation);
    expect(screen.getByText(question.answer)).toBeTruthy();
    expect(screen.getByText("所有调整都在当前案例本地完成，不会调用模型或消耗额度。"))
      .toBeTruthy();
  });
});
