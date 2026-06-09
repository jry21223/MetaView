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

  it("does not render the ops dashboard button on the dashboard stage", () => {
    const { queryByText } = render(<GlobalTopbar {...baseProps} stage="dashboard" />);

    expect(queryByText("运营面板")).toBeFalsy();
  });

  it("renders the ops dashboard button on non-dashboard ops stages", () => {
    const { getByText } = render(<GlobalTopbar {...baseProps} stage="intake" />);

    expect(getByText("运营面板")).toBeTruthy();
  });
});
