import { cleanup, fireEvent, render } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TWEAK_DEFAULTS } from "../hooks/useTweaks";
import { TweaksPanel } from "./TweaksPanel";

function renderTweaksPanel() {
  const setTweak = vi.fn();
  return {
    ...render(<TweaksPanel t={TWEAK_DEFAULTS} setTweak={setTweak} />),
    setTweak,
  };
}

describe("TweaksPanel", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("keeps workbench controls but no longer renders theme controls", () => {
    const { getByLabelText, getByText, queryByLabelText, queryByText, container } = renderTweaksPanel();

    fireEvent.click(getByLabelText("打开设计调节面板"));

    expect(queryByText("主题")).toBeNull();
    expect(queryByLabelText("强调色")).toBeNull();
    expect(container.querySelector('input[type="color"]')).toBeNull();
    expect(getByText("布局")).toBeTruthy();
    expect(getByText("历史/工具位置")).toBeTruthy();
    expect(getByText("密度")).toBeTruthy();
    expect(getByText("动画")).toBeTruthy();
    expect(getByText("交换时长")).toBeTruthy();
  });

  it("still updates layout tweaks", () => {
    const { getByLabelText, getByText, setTweak } = renderTweaksPanel();

    fireEvent.click(getByLabelText("打开设计调节面板"));
    fireEvent.click(getByText("left"));

    expect(setTweak).toHaveBeenCalledWith("layout", "left");
  });
});
