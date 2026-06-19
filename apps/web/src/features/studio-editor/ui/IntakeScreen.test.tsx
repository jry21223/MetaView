import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { IntakeScreen } from "./IntakeScreen";

const baseProps: React.ComponentProps<typeof IntakeScreen> = {
  onSubmit: vi.fn(),
};

function renderIntake(
  overrides: Partial<React.ComponentProps<typeof IntakeScreen>> = {},
) {
  const props = {
    ...baseProps,
    onSubmit: vi.fn(),
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

  it("renders only currently supported generation promises", () => {
    const { container, getByText, queryByText, getByRole } = renderIntake();

    expect(getByText("输入题目或代码，生成可播放的分步讲解")).toBeTruthy();
    expect(getByText("支持数学、算法、物理和代码追踪；生成后可继续追问修改，也可导出视频。")).toBeTruthy();
    expect(queryByText(/截图/)).toBeNull();
    expect(queryByText(/翻译/)).toBeNull();
    expect(queryByText("英语拆解")).toBeNull();
    expect(queryByText("空白课件")).toBeNull();
    expect(
      container.querySelector(
        '[data-testid="meta-particle-field"][data-variant="canvas"]',
      ),
    ).toBeTruthy();
    expect(getByText("数学题")).toBeTruthy();
    expect(getByText("算法代码")).toBeTruthy();
    expect(getByText("物理题")).toBeTruthy();
    expect(getByText("化学计量")).toBeTruthy();
    expect(
      (getByRole("button", { name: "生成讲解" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("keeps code upload as a secondary composer action instead of a persistent tab", () => {
    const { container, getByRole } = renderIntake();

    expect(container.querySelector(".mv-intake-attachment-tab")).toBeNull();
    const uploadButton = getByRole("button", { name: "上传代码文件" });
    expect(uploadButton.closest(".mv-intake-actions")).toBeTruthy();
    expect(uploadButton.classList.contains("mv-intake-action")).toBe(true);
    expect(uploadButton.classList.contains("mv-intake-attach")).toBe(true);
    expect(uploadButton.textContent).toContain("代码文件");
  });

  it("submits math templates with a supported domain hint", () => {
    const { getByRole, props } = renderIntake();

    fireEvent.click(getByRole("button", { name: /数学题/ }));

    expect(props.onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        domain: "math",
        template: "math-problem",
        title: "数学题",
      }),
    );
  });

  it("submits chemistry templates with a supported domain hint", () => {
    const { getByRole, props } = renderIntake();

    fireEvent.click(getByRole("button", { name: /化学计量/ }));

    expect(props.onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        domain: "chemistry",
        template: "chemistry-stoichiometry",
        title: "化学计量",
      }),
    );
  });

  it("rejects unsupported attachments without submitting them", () => {
    const { container, getByText, queryByText } = renderIntake();
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const image = new File(["not image bytes"], "diagram.png", {
      type: "image/png",
    });

    fireEvent.change(input, { target: { files: [image] } });

    expect(getByText("当前只支持上传代码文件。图片、PDF、课件暂未接入生成管线。")).toBeTruthy();
    expect(queryByText("diagram.png")).toBeNull();
  });

  it("reads code attachments into source code and language before submit", async () => {
    const { container, getByRole, getByPlaceholderText, getByText, props } = renderIntake();
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["def solve():\n    return 42\n"], "solution.py", {
      type: "text/x-python",
    });

    fireEvent.change(input, { target: { files: [file] } });
    expect(getByText("solution.py")).toBeTruthy();
    fireEvent.change(getByPlaceholderText(/输入一道数学题/), {
      target: { value: "讲解这段代码" },
    });
    fireEvent.click(getByRole("button", { name: "生成讲解" }));

    await waitFor(() => expect(props.onSubmit).toHaveBeenCalledTimes(1));
    expect(props.onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        domain: "code",
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
