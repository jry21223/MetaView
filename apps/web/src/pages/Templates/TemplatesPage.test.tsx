import { cleanup, fireEvent, render } from "@testing-library/react";
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

  it("publishes five line-drawn previews and keeps the other templates disabled", () => {
    const { container, getByRole } = renderPage();

    expect(TEMPLATES).toHaveLength(21);
    expect(container.querySelectorAll("[data-preview]")).toHaveLength(5);
    expect((getByRole("button", { name: "快速排序，制作中" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("opens the pole-polar template as a real case route", () => {
    const view = renderPage();
    fireEvent.click(view.getByRole("button", { name: "极点与极线，展开预览" }));
    fireEvent.click(view.getByRole("button", { name: "极点与极线，进入完整案例" }));
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

  it("shows a helpful empty state for unmatched searches", () => {
    const { getByRole, getByText } = renderPage();
    fireEvent.change(getByRole("searchbox"), { target: { value: "不存在的样例关键词" } });
    expect(getByText("没有匹配的讲解模板")).toBeTruthy();
  });
});
