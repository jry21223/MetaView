import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LandingPage } from "./LandingPage";

function renderLanding() {
  const props = {
    appEdition: "self" as const,
    isDark: false,
    onToggleTheme: vi.fn(),
    onStart: vi.fn(),
    onOpenTemplates: vi.fn(),
  };

  return { ...render(<LandingPage {...props} />), props };
}

describe("LandingPage", () => {
  afterEach(() => cleanup());

  it("presents the real product workflow and routes primary actions to creation", () => {
    const { getByRole, getByText, props } = renderLanding();

    expect(getByRole("heading", { level: 1 }).textContent).toContain("MetaView");
    expect(getByRole("heading", { level: 1 }).textContent).toContain(
      "把一道题，变成一段看得见的理解过程。",
    );
    expect(getByText("LessonPlan")).toBeTruthy();
    expect(getByText("PlaybookScript")).toBeTruthy();
    expect(getByText("DirectorScript")).toBeTruthy();
    expect(getByText("RenderPlan")).toBeTruthy();

    fireEvent.click(getByRole("button", { name: /开始生成/ }));
    fireEvent.click(getByRole("button", { name: "切换主题" }));
    fireEvent.click(getByRole("button", { name: "模板" }));

    expect(props.onStart).toHaveBeenCalledTimes(1);
    expect(props.onToggleTheme).toHaveBeenCalledTimes(1);
    expect(props.onOpenTemplates).toHaveBeenCalledTimes(1);
  });

  it("switches the learning canvas between supported subject examples", () => {
    const { getByRole, getByText } = renderLanding();

    const physicsTab = getByRole("tab", { name: /物理/ });
    fireEvent.click(physicsTab);

    expect(physicsTab.getAttribute("aria-selected")).toBe("true");
    expect(getByText("抛体运动分解")).toBeTruthy();
    expect(getByText("水平速度保持不变，竖直速度持续受到重力改变。")).toBeTruthy();
  });

  it("encodes binary-search values by bar height while keeping range state explicit", () => {
    const { container, getByRole } = renderLanding();

    fireEvent.click(getByRole("tab", { name: /算法/ }));

    const bars = Array.from(
      container.querySelectorAll<SVGRectElement>(".mv-algorithm-bar rect"),
    );
    const heights = bars.map((bar) => Number(bar.getAttribute("height")));

    expect(heights).toHaveLength(8);
    expect(heights.every((height, index) => index === 0 || height > heights[index - 1])).toBe(
      true,
    );
    expect(container.querySelectorAll(".mv-algorithm-bar.is-discarded")).toHaveLength(4);
    expect(container.querySelectorAll(".mv-algorithm-bar.is-mid")).toHaveLength(1);
    expect(container.querySelector(".mv-lesson-code strong")?.textContent).toContain(
      "left = mid + 1",
    );
  });
});
