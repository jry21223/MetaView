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
    const { getByText, queryByText, getByRole } = renderIntake();

    expect(getByText("输入题目或代码，生成可播放的分步讲解")).toBeTruthy();
    expect(
      getByText(
        "覆盖数学、物理、化学、生物、地理与算法代码；生成后可继续追问，也可导出视频。",
      ),
    ).toBeTruthy();
    expect(queryByText(/截图/)).toBeNull();
    expect(queryByText(/翻译/)).toBeNull();
    expect(queryByText("英语拆解")).toBeNull();
    expect(queryByText("空白课件")).toBeNull();
    expect(getByText("二分查找")).toBeTruthy();
    expect(getByText("抛体运动")).toBeTruthy();
    expect(getByText("配平方程")).toBeTruthy();
    expect(getByText("孟德尔遗传")).toBeTruthy();
    expect(
      (getByRole("button", { name: "生成讲解" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("drops duplicate hero copy and composer hints for a calmer intake", () => {
    const { queryByText } = renderIntake();

    expect(queryByText(/THEORETICAL CANVAS/)).toBeNull();
    expect(queryByText("支持代码片段和代码文件")).toBeNull();
    expect(queryByText("数学题")).toBeNull();
    expect(queryByText("化学计量")).toBeNull();
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

  it("submits physics examples with a supported domain hint", () => {
    const { getByRole, props } = renderIntake();

    fireEvent.click(getByRole("button", { name: /抛体运动/ }));

    expect(props.onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        domain: "physics",
        title: "抛体运动",
      }),
    );
  });

  it("submits biology examples with a supported domain hint", () => {
    const { getByRole, props } = renderIntake();

    fireEvent.click(getByRole("button", { name: /孟德尔遗传/ }));

    expect(props.onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        domain: "biology",
        title: "孟德尔遗传",
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

  it("submits freeform prompts with a null domain when inference misses", async () => {
    const { getByPlaceholderText, getByRole, queryByRole, props } = renderIntake();

    fireEvent.change(getByPlaceholderText(/输入一道数学题/), {
      target: { value: "孟德尔豌豆杂交实验的显隐性遗传规律" },
    });
    fireEvent.click(getByRole("button", { name: "生成讲解" }));

    await waitFor(() => expect(props.onSubmit).toHaveBeenCalledTimes(1));
    expect(props.onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ domain: null, template: "freeform" }),
    );
    expect(queryByRole("alert")).toBeNull();
  });

  it("still forwards the inferred domain hint when keywords match", async () => {
    const { getByPlaceholderText, getByRole, props } = renderIntake();

    fireEvent.change(getByPlaceholderText(/输入一道数学题/), {
      target: { value: "求函数 f(x)=x^2 在 x=1 处的导数" },
    });
    fireEvent.click(getByRole("button", { name: "生成讲解" }));

    await waitFor(() => expect(props.onSubmit).toHaveBeenCalledTimes(1));
    expect(props.onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ domain: "math" }),
    );
  });
});
