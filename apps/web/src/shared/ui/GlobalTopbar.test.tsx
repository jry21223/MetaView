import { cleanup, fireEvent, render } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GlobalTopbar } from "./GlobalTopbar";

const baseProps = {
  stage: "intake" as const,
  appEdition: "ops" as const,
  isProviderConfigured: true,
  accountBalanceYuan: "5.00",
  accountName: "微信用户",
  onNavigate: vi.fn(),
  isDark: false,
  onToggleTheme: vi.fn(),
};

describe("GlobalTopbar account avatar", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the account avatar in ops mode when one is available", () => {
    const { getByAltText } = render(
      <GlobalTopbar {...baseProps} accountAvatarUrl="https://example.test/avatar.png" />,
    );

    const avatar = getByAltText("微信用户头像") as HTMLImageElement;
    expect(avatar.src).toBe("https://example.test/avatar.png");
  });

  it("falls back to MV when the avatar is missing or fails to load", () => {
    const { getByAltText, getByText } = render(
      <GlobalTopbar {...baseProps} accountAvatarUrl="https://example.test/avatar.png" />,
    );

    fireEvent.error(getByAltText("微信用户头像"));
    expect(getByText("MV")).toBeTruthy();
  });

  it("does not show ops dashboard nav on workbench stage", () => {
    const { queryByText } = render(<GlobalTopbar {...baseProps} stage="workbench" appEdition="ops" />);

    expect(queryByText("运营面板")).toBeFalsy();
    expect(queryByText("工作台")).toBeTruthy();
    expect(queryByText("首页")).toBeNull();
    expect(queryByText("任务历史")).toBeTruthy();
    expect(queryByText("案例")).toBeTruthy();
    expect(queryByText("设置")).toBeTruthy();
  });

  it("can hide the primary nav on workbench while keeping right-side controls", () => {
    const { queryByText, getByText, getByLabelText } = render(
      <GlobalTopbar
        {...baseProps}
        stage="workbench"
        hidePrimaryNav
        onOpenAccountPanel={vi.fn()}
      />,
    );

    expect(getByText("MetaView")).toBeTruthy();
    expect(queryByText("工作台")).toBeNull();
    expect(queryByText("任务历史")).toBeNull();
    expect(queryByText("案例")).toBeNull();
    expect(queryByText("设置")).toBeNull();
    expect(getByLabelText("账户与充值")).toBeTruthy();
    expect(getByLabelText("切换主题")).toBeTruthy();
  });

  it("keeps the production MetaView brand and does not render concept placeholders", () => {
    const { getByText, queryByText } = render(<GlobalTopbar {...baseProps} />);

    expect(getByText("MetaView")).toBeTruthy();
    expect(queryByText("MetaView v2")).toBeNull();
    expect(queryByText("生成式学习播放器")).toBeNull();
  });

  it("navigates through the production top-level destinations", () => {
    const onNavigate = vi.fn();
    const { getByRole } = render(
      <GlobalTopbar {...baseProps} onNavigate={onNavigate} />,
    );

    fireEvent.click(getByRole("button", { name: "工作台" }));
    fireEvent.click(getByRole("button", { name: "任务历史" }));
    fireEvent.click(getByRole("button", { name: "案例" }));
    fireEvent.click(getByRole("button", { name: "设置" }));

    expect(onNavigate).toHaveBeenNthCalledWith(1, "intake");
    expect(onNavigate).toHaveBeenNthCalledWith(2, "history");
    expect(onNavigate).toHaveBeenNthCalledWith(3, "templates");
    expect(onNavigate).toHaveBeenNthCalledWith(4, "settings");
  });

  it("keeps the primary nav settings icon compact at topbar size", () => {
    const { getByRole } = render(<GlobalTopbar {...baseProps} />);

    const trigger = getByRole("button", { name: "设置" });
    const pathData = Array.from(trigger.querySelectorAll("path")).map(
      (path) => path.getAttribute("d") ?? "",
    );

    expect(pathData.some((d) => d.length > 120)).toBe(false);
  });

  it("self mode shows a quiet provider dot without account or recharge controls", () => {
    const { queryByLabelText, queryByText, getByTitle } = render(
      <GlobalTopbar
        {...baseProps}
        appEdition="self"
        accountBalanceYuan={null}
        accountName={null}
        onOpenProviderSettings={vi.fn()}
      />,
    );

    expect(queryByLabelText("账户与充值")).toBeNull();
    expect(queryByText(/¥ 5\.00/)).toBeNull();
    expect(queryByText("模型已配置")).toBeNull();
    expect(getByTitle("模型已配置")).toBeTruthy();
    expect(queryByLabelText("模型服务商设置")).toBeTruthy();
  });

  it("self mode stays quiet when no provider is configured", () => {
    const { queryByText, queryByTitle, container } = render(
      <GlobalTopbar
        {...baseProps}
        appEdition="self"
        isProviderConfigured={false}
        accountBalanceYuan={null}
        accountName={null}
        onOpenProviderSettings={vi.fn()}
      />,
    );

    expect(queryByText("未配置模型")).toBeNull();
    expect(queryByTitle("模型已配置")).toBeNull();
    expect(container.querySelector(".mv-pulse-offline")).toBeNull();
  });

  it("self mode does not render a placeholder avatar", () => {
    const { queryByText } = render(
      <GlobalTopbar
        {...baseProps}
        appEdition="self"
        accountBalanceYuan={null}
        accountName={null}
        onOpenProviderSettings={vi.fn()}
      />,
    );

    expect(queryByText("MV")).toBeNull();
  });

  it("uses a square svg icon for provider settings instead of a font glyph", () => {
    const { getByLabelText } = render(
      <GlobalTopbar
        {...baseProps}
        appEdition="self"
        accountBalanceYuan={null}
        accountName={null}
        onOpenProviderSettings={vi.fn()}
      />,
    );

    const trigger = getByLabelText("模型服务商设置");

    expect(trigger.querySelector("svg")).toBeTruthy();
    expect(trigger.textContent?.trim()).toBe("");
  });
});
