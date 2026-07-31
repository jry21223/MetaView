import { cleanup, fireEvent, render } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { languageFromCodeFilename } from "../lib/codeFileLanguage";
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

function fileInput(container: HTMLElement): HTMLInputElement {
  return container.querySelector('input[type="file"]') as HTMLInputElement;
}

function pythonFile(name = "solution.py", source = "def solve():\n    return 42\n") {
  return new File([source], name, { type: "text/x-python" });
}

describe("IntakeScreen smart-routed intake", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("renders one focused creation surface without internal routing copy", () => {
    const { getAllByRole, getByText, queryByText } = renderIntake();

    expect(getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(getByText("新建可视化讲解")).toBeTruthy();
    expect(getByText("输入一道题、一个知识点，或粘贴代码。")).toBeTruthy();
    expect(queryByText(/NEW VISUAL LESSON/)).toBeNull();
    expect(queryByText(/Generation Path/i)).toBeNull();
    expect(queryByText(/Coverage/i)).toBeNull();
    expect(queryByText(/LessonPlan/i)).toBeNull();
    expect(queryByText(/Director/i)).toBeNull();
    expect(queryByText("领域提示")).toBeNull();
    expect(queryByText("等待输入")).toBeNull();
    expect(queryByText("可播放")).toBeNull();
    expect(queryByText("可追问")).toBeNull();
    expect(queryByText("可导出")).toBeNull();
  });

  it("offers exactly three prompt-only examples and a stable templates link", () => {
    const { container, getByRole, getAllByRole, props } = renderIntake();

    const examples = getAllByRole("button").filter((button) =>
      button.classList.contains("mv-intake-example"),
    );
    expect(examples).toHaveLength(3);
    expect(getByRole("button", { name: "导数与切线" })).toBeTruthy();
    expect(getByRole("button", { name: "二分查找" })).toBeTruthy();
    expect(getByRole("button", { name: "抛体运动" })).toBeTruthy();

    fireEvent.click(getByRole("button", { name: "导数与切线" }));

    expect(props.onSubmit).not.toHaveBeenCalled();
    expect(
      (container.querySelector("textarea") as HTMLTextAreaElement).value,
    ).toBe(
      "用动画解释导数的几何意义：曲线 y=x² 在点 (1,1) 处切线的斜率为什么是 2。",
    );
    expect(getByRole("link", { name: "查看模板案例" }).getAttribute("href")).toBe(
      "/templates",
    );
  });

  it("shows a testing-in-progress announcement and keeps generation disabled", async () => {
    const { getByRole, getByPlaceholderText, getByText, props } = renderIntake();
    const textarea = getByPlaceholderText(/例如：用动画解释导数/);

    expect(
      getByText("MetaView 目前处于测试阶段，生成效果仍在优化中，新建生成功能暂时关闭，感谢理解。"),
    ).toBeTruthy();

    fireEvent.change(textarea, { target: { value: "求函数 f(x)=x² 在 x=1 处的导数" } });
    const submitButton = getByRole("button", { name: "生成讲解" }) as HTMLButtonElement;
    expect(submitButton.disabled).toBe(true);

    fireEvent.click(submitButton);
    fireEvent.keyDown(textarea, { key: "Enter", metaKey: true });

    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it("seeds initialPrompt and caps textarea growth at 320px", () => {
    const { getByDisplayValue } = renderIntake({ initialPrompt: "已有题目" });
    const textarea = getByDisplayValue("已有题目") as HTMLTextAreaElement;
    Object.defineProperty(textarea, "scrollHeight", {
      configurable: true,
      value: 480,
    });

    fireEvent.change(textarea, { target: { value: "已有题目，继续补充" } });

    expect(textarea.style.height).toBe("320px");
    expect(textarea.style.overflowY).toBe("auto");
  });

  it("keeps code upload single-file and replaces the previous selection", () => {
    const { container, getByText, queryByText } = renderIntake();
    const input = fileInput(container);

    expect(input.multiple).toBe(false);
    fireEvent.change(input, { target: { files: [pythonFile("first.py")] } });
    expect(getByText("first.py")).toBeTruthy();

    fireEvent.change(input, { target: { files: [pythonFile("second.py")] } });
    expect(queryByText("first.py")).toBeNull();
    expect(getByText("second.py")).toBeTruthy();
  });

  it("removes the selected code file", () => {
    const { container, getByRole, getByText, queryByText } = renderIntake();
    fireEvent.change(fileInput(container), {
      target: { files: [pythonFile("remove-me.py")] },
    });
    expect(getByText("remove-me.py")).toBeTruthy();

    fireEvent.click(getByRole("button", { name: "删除 remove-me.py" }));

    expect(queryByText("remove-me.py")).toBeNull();
    expect((getByRole("button", { name: "生成讲解" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("rejects multiple dropped files without replacing the current file", () => {
    const { container, getByText } = renderIntake();
    const input = fileInput(container);
    fireEvent.change(input, { target: { files: [pythonFile("kept.py")] } });

    fireEvent.drop(container.querySelector(".mv-intake-composer") as HTMLElement, {
      dataTransfer: {
        files: [pythonFile("one.py"), pythonFile("two.py")],
      },
    });

    expect(getByText("一次只能上传一个代码文件。")).toBeTruthy();
    expect(getByText("kept.py")).toBeTruthy();
  });

  it("rejects unknown extensions and files larger than 256 KB", () => {
    const { container, getByText, queryByText } = renderIntake();
    const input = fileInput(container);
    const image = new File(["not code"], "diagram.png", { type: "image/png" });

    fireEvent.change(input, { target: { files: [image] } });
    expect(getByText("不支持该文件类型，请选择代码文件。")).toBeTruthy();
    expect(queryByText("diagram.png")).toBeNull();

    const oversized = new File([new Uint8Array(256 * 1024 + 1)], "large.py");
    fireEvent.change(input, { target: { files: [oversized] } });
    expect(getByText("代码文件不能超过 256 KB。")).toBeTruthy();
    expect(queryByText("large.py")).toBeNull();
  });

  it("keeps generation disabled even with a valid code file attached", () => {
    const { container, getByRole, getByText, props } = renderIntake();
    const file = pythonFile();

    fireEvent.change(fileInput(container), { target: { files: [file] } });
    expect(getByText("solution.py")).toBeTruthy();

    const submitButton = getByRole("button", { name: "生成讲解" }) as HTMLButtonElement;
    expect(submitButton.disabled).toBe(true);
    fireEvent.click(submitButton);

    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it("exposes pending and submit errors accessibly", () => {
    const { getByRole, getByText, getByPlaceholderText } = renderIntake({
      isSubmitting: true,
      submitError: "提交失败，请重试",
    });

    expect(getByRole("status").textContent).toContain("正在提交");
    expect(getByText("提交失败，请重试")).toBeTruthy();
    expect((getByRole("button", { name: "生成讲解" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((getByPlaceholderText(/例如：用动画解释导数/) as HTMLTextAreaElement).disabled).toBe(
      true,
    );
    expect((getByRole("button", { name: "上传代码文件" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((getByRole("button", { name: "导数与切线" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
});

describe("languageFromCodeFilename", () => {
  it.each([
    ["lesson.PY", "python"],
    ["demo.tsx", "typescript"],
    ["Main.java", "java"],
    ["query.sql", "sql"],
    ["notes.txt", null],
    ["README", null],
  ])("maps %s to %s", (filename, expected) => {
    expect(languageFromCodeFilename(filename)).toBe(expected);
  });
});
