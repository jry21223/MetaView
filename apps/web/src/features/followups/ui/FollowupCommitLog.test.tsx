import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FollowupCommitLog } from "./FollowupCommitLog";
import type { RunVersionRecord } from "../api/followupApi";

describe("FollowupCommitLog", () => {
  afterEach(() => cleanup());

  it("shows git-log style commits with the current HEAD marker", () => {
    const onRestore = vi.fn();

    const { getByText, getAllByRole } = render(
      <FollowupCommitLog
        versions={versions()}
        pending={false}
        canModify
        onRestore={onRestore}
      />,
    );

    expect(getByText("HEAD")).toBeTruthy();
    expect(getByText("e5f6a7b8")).toBeTruthy();
    expect(getByText("restore")).toBeTruthy();
    expect(getByText("revert: restore a1b2c3d4")).toBeTruthy();

    fireEvent.click(getAllByRole("button", { name: "恢复到此版本" })[0]);

    expect(onRestore).toHaveBeenCalledWith("version-1");
  });

  it("does not offer restore for HEAD and disables historical restore while pending", () => {
    const { getAllByRole, queryAllByText } = render(
      <FollowupCommitLog
        versions={versions()}
        pending
        canModify
        onRestore={vi.fn()}
      />,
    );

    expect(queryAllByText("HEAD")).toHaveLength(1);
    expect(getAllByRole("button", { name: "恢复到此版本" })).toHaveLength(2);
    expect((getAllByRole("button", { name: "恢复到此版本" })[0] as HTMLButtonElement).disabled).toBe(true);
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
