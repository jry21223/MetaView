import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ConfirmDialog } from "./ConfirmDialog";

function renderDialog() {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  const view = render(
    <ConfirmDialog
      title="确定删除这条历史记录吗？"
      description="讲解二分查找"
      confirmLabel="删除"
      danger
      onConfirm={onConfirm}
      onCancel={onCancel}
    />,
  );
  return { ...view, onConfirm, onCancel };
}

describe("ConfirmDialog", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders modal semantics for assistive technology", () => {
    const { getByRole } = renderDialog();

    const dialog = getByRole("dialog", { name: "确定删除这条历史记录吗？" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.textContent).toContain("讲解二分查找");
  });

  it("confirms the destructive action from the primary button", () => {
    const { getByRole, onConfirm, onCancel } = renderDialog();

    fireEvent.click(within(getByRole("dialog")).getByRole("button", { name: "删除" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("cancels from Escape and overlay click", () => {
    const { getByRole, onCancel } = renderDialog();
    const dialog = getByRole("dialog");

    fireEvent.keyDown(dialog, { key: "Escape" });
    fireEvent.click(dialog);

    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it("cancels from the secondary button without confirming", () => {
    const { getByRole, onConfirm, onCancel } = renderDialog();

    fireEvent.click(within(getByRole("dialog")).getByRole("button", { name: "取消" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
