import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TeachingDeckPage } from "./TeachingDeckPage";

describe("TeachingDeckPage MVP", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("plans the prefilled ellipse lesson and exposes eleven editable slides", () => {
    const view = render(
      <TeachingDeckPage
        onGenerateDynamicSlide={vi.fn()}
        onOpenRun={vi.fn()}
      />,
    );

    expect(view.getByDisplayValue("椭圆及其标准方程")).toBeTruthy();
    fireEvent.click(view.getByRole("button", { name: "生成课件大纲" }));

    expect(view.getByLabelText("教学课件编辑器")).toBeTruthy();
    expect(
      view.getAllByRole("button", { name: /第 \d+ 页：/ }),
    ).toHaveLength(11);
    expect(view.getByText("11 页 · 2 个动态页 · 0 个已生成")).toBeTruthy();
  });

  it("submits only the selected dynamic slide and keeps the returned run", async () => {
    const onGenerateDynamicSlide = vi.fn().mockResolvedValue("run-ellipse-1");
    const onOpenRun = vi.fn();
    const view = render(
      <TeachingDeckPage
        onGenerateDynamicSlide={onGenerateDynamicSlide}
        onOpenRun={onOpenRun}
      />,
    );

    fireEvent.click(view.getByRole("button", { name: "生成课件大纲" }));
    fireEvent.click(
      view.getByRole("button", { name: "第 5 页：绳长法：椭圆如何形成" }),
    );
    fireEvent.click(view.getByRole("button", { name: "生成此动态页" }));

    await waitFor(() => expect(onGenerateDynamicSlide).toHaveBeenCalledTimes(1));
    expect(onGenerateDynamicSlide.mock.calls[0][0]).toContain("课件页码：第 5 页，共 11 页");
    expect(onGenerateDynamicSlide.mock.calls[0][0]).toContain("只生成这一页的动态讲解");

    await waitFor(() =>
      expect(view.getByText("run-ellipse-1")).toBeTruthy(),
    );
    fireEvent.click(view.getByRole("button", { name: "打开播放器" }));
    expect(onOpenRun).toHaveBeenCalledWith("run-ellipse-1");
  });

  it("asks ops guests to log in before dynamic generation", () => {
    const onRequireLogin = vi.fn();
    const onGenerateDynamicSlide = vi.fn();
    const view = render(
      <TeachingDeckPage
        onGenerateDynamicSlide={onGenerateDynamicSlide}
        onOpenRun={vi.fn()}
        canGenerateDynamic={false}
        onRequireLogin={onRequireLogin}
      />,
    );

    fireEvent.click(view.getByRole("button", { name: "生成课件大纲" }));
    fireEvent.click(
      view.getByRole("button", { name: "第 5 页：绳长法：椭圆如何形成" }),
    );
    fireEvent.click(view.getByRole("button", { name: "生成此动态页" }));

    expect(onRequireLogin).toHaveBeenCalledTimes(1);
    expect(onGenerateDynamicSlide).not.toHaveBeenCalled();
  });
});
