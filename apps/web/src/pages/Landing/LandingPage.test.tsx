import { cleanup, fireEvent, render, within } from "@testing-library/react";
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

  it("orders the landing narrative as visual, follow-up, workflow, then director", () => {
    const { container, getByRole } = renderLanding();
    const sectionIds = Array.from(
      container.querySelectorAll<HTMLElement>("#landing-main > section[id]"),
    ).map((section) => section.id);
    const primaryNav = getByRole("navigation", { name: "首页导航" });

    expect(sectionIds).toEqual(["visuals", "followup", "workflow", "director"]);
    expect(
      within(primaryNav)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["画面能力", "继续追问", "工作原理", "导演层"]);
    expect(getByRole("link", { name: "看它如何工作" }).getAttribute("href")).toBe("#visuals");
  });

  it("switches the learning canvas between supported subject examples", () => {
    const { container, getByRole, getByText } = renderLanding();

    const stage = container.querySelector<HTMLElement>(
      ".mv-landing-capability .mv-lesson-stage",
    );
    const mathLayer = stage?.querySelector<HTMLElement>("[data-scene-domain='math']");
    const physicsLayer = stage?.querySelector<HTMLElement>("[data-scene-domain='physics']");

    expect(stage?.querySelectorAll(".mv-lesson-scene-layer")).toHaveLength(3);
    expect(mathLayer?.classList.contains("is-active")).toBe(true);

    const physicsTab = getByRole("tab", { name: /物理/ });
    fireEvent.click(physicsTab);

    expect(physicsTab.getAttribute("aria-selected")).toBe("true");
    expect(getByRole("tablist", { name: "学科画面示例" }).getAttribute("data-active-domain")).toBe(
      "physics",
    );
    expect(getByText("抛体运动分解")).toBeTruthy();
    expect(getByText("水平速度保持不变，竖直速度持续受到重力改变。")).toBeTruthy();
    expect(stage?.getAttribute("data-active-domain")).toBe("physics");
    expect(physicsLayer?.classList.contains("is-active")).toBe(true);
    expect(mathLayer?.classList.contains("is-active")).toBe(false);
    expect(stage?.querySelector("[data-scene-domain='physics']")).toBe(physicsLayer);
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

  it("shows follow-up as contextual replies and reversible lesson revisions", () => {
    const { container, getByRole, getByText, props } = renderLanding();
    const followupFrame = container.querySelector(".mv-landing-followup-demo");

    expect(getByText("哪里没看懂，就从那一步继续问。")).toBeTruthy();
    expect(followupFrame?.querySelector(":scope > .mv-landing-followup-demo__head")).toBeTruthy();
    expect(followupFrame?.querySelector(":scope > .mv-landing-followup-demo__modes")).toBeTruthy();
    expect(
      followupFrame?.querySelector(
        ":scope > .mv-landing-followup-demo__viewport > .mv-landing-followup-demo__camera",
      ),
    ).toBeTruthy();
    expect(
      followupFrame?.querySelectorAll("[data-camera-target='prompt'], [data-camera-target='response']"),
    ).toHaveLength(4);
    expect(getByRole("tab", { name: "解释这一步" }).getAttribute("aria-selected")).toBe(
      "true",
    );
    expect(
      container.querySelector(".mv-landing-followup-demo__thread.is-active")?.textContent,
    ).toContain("回答当前疑问，不改动讲解");

    fireEvent.click(getByRole("tab", { name: "调整讲解" }));

    const activeThread = container.querySelector(".mv-landing-followup-demo__thread.is-active");
    expect(activeThread?.textContent).toContain("NEW VERSION");
    expect(activeThread?.textContent).toContain("v2");
    expect(activeThread?.textContent).toContain("可恢复");

    fireEvent.click(getByRole("button", { name: /用自己的题目试一次/ }));
    expect(props.onStart).toHaveBeenCalledTimes(1);
  });
});
