import { cleanup, fireEvent, render, within } from "@testing-library/react";
import React from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TemplatesPage } from "./TemplatesPage";
import { TEMPLATES } from "./templates";

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="current-path">{location.pathname}</output>;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/templates"]}>
      <Routes>
        <Route path="/templates" element={<><TemplatesPage /><LocationProbe /></>} />
        <Route path="/templates/:templateId" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("TemplatesPage lesson atlas", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("introduces the examples as ready-to-play teaching explanations", () => {
    const view = renderPage();

    expect(view.getByText("从一个好问题开始")).toBeTruthy();
    expect(view.getByRole("heading", { name: "挑一个感兴趣的知识点，从这里慢慢看懂它" })).toBeTruthy();
    expect(view.getByText("这些案例已经准备好了。先看一眼，再跟着完整讲解一步步走下去。")).toBeTruthy();
  });

  it("expands a real poster on the first click and enters the player on the second", () => {
    const view = renderPage();
    const firstState = view.getByRole("button", { name: "二分查找，展开预览" });

    fireEvent.click(firstState);

    expect(view.getByRole("button", { name: "二分查找，进入完整案例" })).toBeTruthy();
    expect(view.getByRole("button", { name: "进入完整案例：二分查找" })).toBeTruthy();
    expect(view.getByLabelText("current-path").textContent).toBe("/templates");

    fireEvent.click(view.getByRole("button", { name: "二分查找，进入完整案例" }));
    expect(view.getByLabelText("current-path").textContent).toBe("/templates/binary-search");
  });

  it("publishes thirty-four line-drawn previews and keeps the other templates disabled", () => {
    const { container, getByRole } = renderPage();

    expect(TEMPLATES).toHaveLength(41);
    expect(container.querySelectorAll("[data-preview]")).toHaveLength(34);
    expect((getByRole("button", { name: "斐波那契 · 记忆化，制作中" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("opens the pole-polar template as a real case route", () => {
    const view = renderPage();
    fireEvent.click(view.getByRole("button", { name: "极点与极线（拓展），展开预览" }));
    fireEvent.click(view.getByRole("button", { name: "极点与极线（拓展），进入完整案例" }));
    expect(view.getByLabelText("current-path").textContent).toBe("/templates/pole-polar");
  });

  it("filters the atlas by domain and clears an expanded item that disappears", () => {
    const view = renderPage();
    fireEvent.click(view.getByRole("button", { name: "二分查找，展开预览" }));
    fireEvent.click(view.getByRole("button", { name: "数学" }));

    expect(view.getByRole("heading", { name: "数学" })).toBeTruthy();
    expect(view.queryByRole("heading", { name: "算法" })).toBeNull();
    expect(view.queryByRole("button", { name: "进入完整案例：二分查找" })).toBeNull();
  });

  it("groups code-driven algorithm lessons under the algorithm domain", () => {
    const view = renderPage();
    const algorithmSection = view
      .getByRole("heading", { name: "算法" })
      .closest("section");

    expect(algorithmSection).not.toBeNull();
    expect(view.queryByRole("button", { name: "代码" })).toBeNull();
    expect(view.queryByRole("heading", { name: "代码" })).toBeNull();
    expect(view.queryByText("两数之和 · 哈希表")).toBeNull();
    expect(within(algorithmSection as HTMLElement).getByText("斐波那契 · 记忆化")).toBeTruthy();
  });

  it("lists the data-structure cases in their own playable section", () => {
    const view = renderPage();
    const algorithmSection = view
      .getByRole("heading", { name: "数据结构" })
      .closest("section") as HTMLElement;
    expect(view.getByRole("button", { name: "数据结构" })).toBeTruthy();

    for (const title of [
      "栈 · 括号匹配",
      "单调栈 · 下一个更大元素",
      "链表反转 · 三指针迭代",
      "二叉搜索树 · 查找与插入",
      "Dijkstra 最短路径",
    ]) {
      expect(within(algorithmSection).getByText(title)).toBeTruthy();
      expect(
        (view.getByRole("button", { name: `${title}，展开预览` }) as HTMLButtonElement).disabled,
      ).toBe(false);
    }

    fireEvent.click(view.getByRole("button", { name: "Dijkstra 最短路径，展开预览" }));
    fireEvent.click(view.getByRole("button", { name: "Dijkstra 最短路径，进入完整案例" }));
    expect(view.getByLabelText("current-path").textContent).toBe("/templates/dijkstra");
  });

  it("lists the chemistry coursepack in its own playable section, in textbook order", () => {
    const view = renderPage();
    const section = view.getByRole("heading", { name: "化学" }).closest("section") as HTMLElement;
    const titles = [
      "锌铜原电池 · 电子与离子",
      "酯化反应 · ¹⁸O 示踪与机理",
      "碰撞理论与活化能",
      "合成氨与勒夏特列原理",
      "酸碱中和滴定 · pH 突变",
    ];
    const text = section.textContent ?? "";
    const positions = titles.map((title) => text.indexOf(title));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    for (const title of titles) {
      expect((view.getByRole("button", { name: `${title}，展开预览` }) as HTMLButtonElement).disabled).toBe(false);
    }
    expect(view.queryByText("氧化还原 · 电子转移")).toBeNull();
    fireEvent.click(view.getByRole("button", { name: "锌铜原电池 · 电子与离子，展开预览" }));
    fireEvent.click(view.getByRole("button", { name: "锌铜原电池 · 电子与离子，进入完整案例" }));
    expect(view.getByLabelText("current-path").textContent).toBe("/templates/galvanic-cell");
  });

  it("shows a helpful empty state for unmatched searches", () => {
    const { getByRole, getByText } = renderPage();
    fireEvent.change(getByRole("searchbox"), { target: { value: "不存在的样例关键词" } });
    expect(getByText("没有匹配的讲解模板")).toBeTruthy();
  });
});
