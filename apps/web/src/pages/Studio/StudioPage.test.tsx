import { cleanup, fireEvent, render } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TWEAK_DEFAULTS } from "../../features/studio-editor/hooks/useTweaks";
import { StudioPage } from "./StudioPage";

describe("StudioPage", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("navigates to intake when starting from an empty workbench", () => {
    const onNavigate = vi.fn();
    const setTweak = vi.fn();

    const { getByRole, getByText } = render(
      <StudioPage
        runId={null}
        t={TWEAK_DEFAULTS}
        setTweak={setTweak}
        onNavigate={onNavigate}
        isProviderConfigured
      />,
    );

    expect(getByText("暂无任务")).toBeTruthy();
    fireEvent.click(getByRole("button", { name: "先提交一个题目" }));
    expect(onNavigate).toHaveBeenCalledWith("intake");
    expect(setTweak).not.toHaveBeenCalled();
  });
});
