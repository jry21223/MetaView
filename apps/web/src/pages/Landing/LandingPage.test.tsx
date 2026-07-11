import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LandingPage } from "./LandingPage";

const baseProps = {
  appEdition: "self" as const,
  isDark: false,
  onToggleTheme: vi.fn(),
  onStart: vi.fn(),
  onOpenTemplates: vi.fn(),
};

describe("LandingPage", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("states the product promise and keeps the case area explicitly reserved", () => {
    const { getByRole, getByText, getAllByText, container } = render(
      <LandingPage {...baseProps} />,
    );

    expect(
      getByRole("heading", { name: /让每一个.*理解过程.*都能被看见/ }),
    ).toBeTruthy();
    expect(getByText("真实案例将在这里出现")).toBeTruthy();
    expect(getAllByText("待接入真实案例")).toHaveLength(3);
    expect(
      container.querySelector(
        '[data-testid="meta-particle-field"][data-variant="canvas"]',
      ),
    ).toBeTruthy();
  });

  it("opens the workspace from the primary calls to action", () => {
    const onStart = vi.fn();
    const { getByRole } = render(
      <LandingPage {...baseProps} onStart={onStart} />,
    );

    fireEvent.click(getByRole("button", { name: "开始生成讲解" }));
    fireEvent.click(getByRole("button", { name: "进入 MetaView" }));

    expect(onStart).toHaveBeenCalledTimes(2);
  });

  it("keeps theme and template actions wired", () => {
    const onToggleTheme = vi.fn();
    const onOpenTemplates = vi.fn();
    const { getByRole } = render(
      <LandingPage
        {...baseProps}
        onToggleTheme={onToggleTheme}
        onOpenTemplates={onOpenTemplates}
      />,
    );

    fireEvent.click(getByRole("button", { name: "切换主题" }));
    fireEvent.click(getByRole("button", { name: "查看现有模板结构" }));

    expect(onToggleTheme).toHaveBeenCalledOnce();
    expect(onOpenTemplates).toHaveBeenCalledOnce();
  });
});
