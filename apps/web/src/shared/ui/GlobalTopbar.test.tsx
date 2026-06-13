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

  it("does not render ops dashboard nav on dashboard stage", () => {
    const { queryByText } = render(<GlobalTopbar {...baseProps} stage="dashboard" />);

    expect(queryByText("运营面板")).toBeFalsy();
    expect(queryByText("首页")).toBeTruthy();
    expect(queryByText("工作台")).toBeNull();
    expect(queryByText("任务历史")).toBeTruthy();
    expect(queryByText("模板")).toBeTruthy();
    expect(queryByText("设置")).toBeTruthy();
  });

  it("does not show ops dashboard nav on workbench stage", () => {
    const { queryByText } = render(<GlobalTopbar {...baseProps} stage="workbench" appEdition="ops" />);

    expect(queryByText("运营面板")).toBeFalsy();
    expect(queryByText("首页")).toBeTruthy();
    expect(queryByText("工作台")).toBeNull();
    expect(queryByText("任务历史")).toBeTruthy();
    expect(queryByText("模板")).toBeTruthy();
    expect(queryByText("设置")).toBeTruthy();
  });

  it("can hide the primary nav on workbench while keeping right-side controls", () => {
    const { queryByText, getByText, getByLabelText } = render(
      <GlobalTopbar
        {...baseProps}
        stage="workbench"
        hidePrimaryNav
        onOpenProviderSettings={vi.fn()}
      />,
    );

    expect(getByText("MetaView")).toBeTruthy();
    expect(queryByText("首页")).toBeNull();
    expect(queryByText("任务历史")).toBeNull();
    expect(queryByText("模板")).toBeNull();
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

    fireEvent.click(getByRole("button", { name: "首页" }));
    fireEvent.click(getByRole("button", { name: "任务历史" }));
    fireEvent.click(getByRole("button", { name: "模板" }));
    fireEvent.click(getByRole("button", { name: "设置" }));

    expect(onNavigate).toHaveBeenNthCalledWith(1, "intake");
    expect(onNavigate).toHaveBeenNthCalledWith(2, "history");
    expect(onNavigate).toHaveBeenNthCalledWith(3, "templates");
    expect(onNavigate).toHaveBeenNthCalledWith(4, "settings");
  });

  it("self mode shows provider status without account or recharge controls", () => {
    const { queryByLabelText, queryByText, getByText } = render(
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
    expect(getByText("CORE NODES ONLINE")).toBeTruthy();
    expect(queryByLabelText("模型服务商设置")).toBeTruthy();
  });
});
