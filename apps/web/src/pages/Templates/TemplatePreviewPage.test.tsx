import { cleanup, fireEvent, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlaybookScript } from "../../features/playbook/engine/types";
import { TemplatePreviewPage } from "./TemplatePreviewPage";

vi.mock("../../features/playbook/engine/player/PlaybookPlayer", () => ({
  PlaybookPlayer: ({ script, parameterSlot, followupSlot }: {
    script: PlaybookScript;
    parameterSlot: (context: { currentStepId: string }) => ReactNode;
    followupSlot: (context: { currentStepId: string }) => ReactNode;
  }) => {
    const context = { currentStepId: script.steps[0].step_id };
    return <div>
      <output data-testid="frames">{script.total_frames}</output>
      {parameterSlot(context)}{followupSlot(context)}
    </div>;
  },
}));

afterEach(cleanup);

describe("template sandbox reset", () => {
  it("clears followup changes even when the base parameter state was already default", () => {
    const view = render(<MemoryRouter initialEntries={["/templates/ellipse-focus-definition"]}>
      <Routes><Route path="/templates/:templateId" element={
        <TemplatePreviewPage theme="light" topbarCollapsed={false} onToggleTopbar={vi.fn()} />
      } /></Routes>
    </MemoryRouter>);
    const values = () => Array.from(view.container.querySelectorAll<HTMLInputElement>(
      ".mv-template-params input",
    )).map((input) => input.value);
    const initial = values();
    expect(initial.length).toBeGreaterThan(0);
    fireEvent.click(view.getByRole("button", { name: /^调整 / }));
    expect(values()).not.toEqual(initial);
    fireEvent.click(view.getByRole("button", { name: "恢复默认参数" }));
    expect(values()).toEqual(initial);
    fireEvent.click(view.getByRole("button", { name: /^调整 / }));
    expect(values()).not.toEqual(initial);
    fireEvent.click(view.getByRole("button", { name: "恢复默认参数" }));
    expect(values()).toEqual(initial);
  });
});
