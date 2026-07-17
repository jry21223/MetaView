import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FollowupCommitLog } from "./FollowupCommitLog";
import type { RunVersionRecord } from "../api/followupApi";

describe("FollowupCommitLog", () => {
  afterEach(() => cleanup());

  it("collapses by default and expands the git-log style commit list on click", () => {
    const onRestore = vi.fn();

    const { getByRole, getByText, queryByText } = render(
      <FollowupCommitLog
        versions={versions()}
        pending={false}
        canModify
        onRestore={onRestore}
      />,
    );

    expect(getByRole("button", { name: "展开版本记录" })).toBeTruthy();
    expect(queryByText("e5f6a7b8")).toBeNull();

    fireEvent.click(getByRole("button", { name: "展开版本记录" }));

    expect(getByText("HEAD")).toBeTruthy();
    expect(getByText("e5f6a7b8")).toBeTruthy();
    expect(getByText("restore")).toBeTruthy();
    expect(getByText("revert: restore a1b2c3d4")).toBeTruthy();
    expect(queryByText("恢复到此版本")).toBeNull();
    expect(onRestore).not.toHaveBeenCalled();
  });

  it("restores historical versions by clicking the whole card and disables them while pending", async () => {
    const onRestore = vi.fn();
    const { getByRole, getAllByRole, queryAllByText, rerender } = render(
      <FollowupCommitLog
        versions={versions()}
        pending={false}
        canModify
        onRestore={onRestore}
      />,
    );

    fireEvent.click(getByRole("button", { name: "展开版本记录" }));
    expect(queryAllByText("HEAD")).toHaveLength(1);
    expect(queryAllByText("恢复到此版本")).toHaveLength(0);

    const restoreCards = getAllByRole("button", { name: /恢复版本/ });
    expect(restoreCards).toHaveLength(2);
    fireEvent.click(restoreCards[0]);
    expect(onRestore).toHaveBeenCalledWith("version-1");
    await waitFor(() => {
      expect(getByRole("button", { name: "展开版本记录" })).toBeTruthy();
    });

    rerender(
      <FollowupCommitLog
        versions={versions()}
        pending
        canModify
        onRestore={onRestore}
      />,
    );
    fireEvent.click(getByRole("button", { name: "展开版本记录" }));
    expect((getAllByRole("button", { name: /恢复版本/ })[0] as HTMLButtonElement).disabled).toBe(true);
  });

  it("collapses the version list after successfully choosing a historical card", async () => {
    const onRestore = vi.fn();
    const { getByRole, queryByText } = render(
      <FollowupCommitLog
        versions={versions()}
        pending={false}
        canModify
        onRestore={onRestore}
      />,
    );

    fireEvent.click(getByRole("button", { name: "展开版本记录" }));
    fireEvent.click(getByRole("button", { name: "恢复版本 c0ffee12" }));

    expect(onRestore).toHaveBeenCalledWith("version-1");
    await waitFor(() => {
      expect(getByRole("button", { name: "展开版本记录" })).toBeTruthy();
      expect(queryByText("c0ffee12")).toBeNull();
    });
  });

  it("keeps the version list expanded with a visible error when restore fails", async () => {
    const onRestore = vi.fn().mockRejectedValue(new Error("版本不存在"));
    const { getByRole, getByText } = render(
      <FollowupCommitLog
        versions={versions()}
        pending={false}
        canModify
        onRestore={onRestore}
      />,
    );

    fireEvent.click(getByRole("button", { name: "展开版本记录" }));
    fireEvent.click(getByRole("button", { name: "恢复版本 c0ffee12" }));

    await waitFor(() => {
      expect(getByRole("alert").textContent ?? "").toContain("版本不存在");
    });
    expect(getByRole("button", { name: "收起版本记录" })).toBeTruthy();
    expect(getByText("c0ffee12")).toBeTruthy();
  });
});

function versions(): RunVersionRecord[] {
  return [
    {
      version_id: "version-0",
      short_id: "a1b2c3d4",
      run_id: "run-1",
      version_number: 0,
      parent_version_id: null,
      source: "initial",
      summary: "initial playbook",
      followup_id: null,
      created_at: "2026-06-01T00:00:00Z",
      is_head: false,
    },
    {
      version_id: "version-1",
      short_id: "c0ffee12",
      run_id: "run-1",
      version_number: 1,
      parent_version_id: "version-0",
      source: "followup",
      summary: "refactor: update explanation",
      followup_id: "followup-1",
      created_at: "2026-06-01T00:01:00Z",
      is_head: false,
    },
    {
      version_id: "version-2",
      short_id: "e5f6a7b8",
      run_id: "run-1",
      version_number: 2,
      parent_version_id: "version-1",
      source: "restore",
      summary: "revert: restore a1b2c3d4",
      followup_id: null,
      created_at: "2026-06-01T00:02:00Z",
      is_head: true,
    },
  ];
}
