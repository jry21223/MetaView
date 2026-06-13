import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TWEAK_DEFAULTS } from "../hooks/useTweaks";
import { IntakeScreen } from "./IntakeScreen";

vi.mock("@remotion/player", () => ({
  Player: () => <div data-testid="brand-logo-loop" />,
}));

const baseProps: React.ComponentProps<typeof IntakeScreen> = {
  onSubmit: vi.fn(),
  t: TWEAK_DEFAULTS,
  isProviderConfigured: true,
  onNavigate: vi.fn(),
  onToggleTheme: vi.fn(),
};

function renderIntake(
  overrides: Partial<React.ComponentProps<typeof IntakeScreen>> = {},
) {
  const props = {
    ...baseProps,
    onSubmit: vi.fn(),
    onNavigate: vi.fn(),
    onToggleTheme: vi.fn(),
    ...overrides,
  };

  return {
    ...render(<IntakeScreen {...props} />),
    props,
  };
}

describe("IntakeScreen launch home", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders the launch-ready intake without concept placeholder branding", () => {
    const { getByText, queryByText, getByRole } = renderIntake();

    expect(getByText("把题目变成可播放的讲解")).toBeTruthy();
    expect(queryByText("MetaView v2")).toBeNull();
    expect(queryByText("生成式学习播放器")).toBeNull();
    expect(getByText("高数动画")).toBeTruthy();
    expect(getByText("算法题")).toBeTruthy();
    expect(getByText("英语拆解")).toBeTruthy();
    expect(getByText("空白课件")).toBeTruthy();
    expect((getByRole("button", { name: "生成" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("submits math templates with a domain hint", () => {
    const { getByRole, props } = renderIntake();

    fireEvent.click(getByRole("button", { name: /高数动画/ }));

    expect(props.onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        domain: "math",
        template: "math-animation",
        title: "高数动画",
      }),
    );
  });

  it("reads code attachments into source code and language before submit", async () => {
    const { container, getByRole, getByPlaceholderText, props } = renderIntake();
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["def solve():\n    return 42\n"], "solution.py", {
      type: "text/x-python",
    });

    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.change(getByPlaceholderText(/输入一道题/), {
      target: { value: "讲解这段代码" },
    });
    fireEvent.click(getByRole("button", { name: "生成" }));

    await waitFor(() => expect(props.onSubmit).toHaveBeenCalledTimes(1));
    expect(props.onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        domain: "algorithm",
        sourceCode: "def solve():\n    return 42\n",
        language: "python",
      }),
    );
  });

  it("surfaces submit errors near the composer", () => {
    const { getByText } = renderIntake({ submitError: "提交失败，请重试" });

    expect(getByText("提交失败，请重试")).toBeTruthy();
  });
});
