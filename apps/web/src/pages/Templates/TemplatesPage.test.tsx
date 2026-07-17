import { cleanup, fireEvent, render } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TemplatesPage } from "./TemplatesPage";
import { TEMPLATES } from "./templates";

describe("TemplatesPage lesson atlas", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("previews a selected case and only starts it from the explicit CTA", () => {
    const onUseTemplate = vi.fn();
    const { getByRole, getByText } = render(
      <TemplatesPage onUseTemplate={onUseTemplate} />,
    );

    fireEvent.click(getByRole("button", { name: /二分查找/ }));

    expect(onUseTemplate).not.toHaveBeenCalled();
    expect(getByText("可播放预览")).toBeTruthy();
    fireEvent.click(getByRole("button", { name: "用这个案例开始" }));
    expect(onUseTemplate).toHaveBeenCalledWith(
      TEMPLATES.find((template) => template.id === "binary-search")?.prompt,
    );
  });

  it("filters the atlas by domain", () => {
    const { getByRole, queryByRole } = render(
      <TemplatesPage onUseTemplate={vi.fn()} />,
    );

    fireEvent.click(getByRole("button", { name: "数学" }));

    expect(getByRole("heading", { name: "数学" })).toBeTruthy();
    expect(queryByRole("heading", { name: "算法" })).toBeNull();
  });

  it("shows a helpful empty state for unmatched searches", () => {
    const { getByRole, getByText } = render(
      <TemplatesPage onUseTemplate={vi.fn()} />,
    );

    fireEvent.change(getByRole("searchbox"), {
      target: { value: "不存在的样例关键词" },
    });

    expect(getByText("没有匹配的讲解起点")).toBeTruthy();
  });
});
