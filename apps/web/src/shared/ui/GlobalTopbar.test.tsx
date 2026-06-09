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

  it("does not render any nav entry text", () => {
    const { queryByText } = render(<GlobalTopbar {...baseProps} stage="dashboard" />);

    expect(queryByText("运营面板")).toBeFalsy();
    expect(queryByText("工作台")).toBeFalsy();
    expect(queryByText("任务历史")).toBeFalsy();
    expect(queryByText("模板")).toBeFalsy();
    expect(queryByText("设置")).toBeFalsy();
  });
});
