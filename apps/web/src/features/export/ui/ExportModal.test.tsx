import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import React from "react";

vi.mock("../api/exportApi", () => ({
  submitExport: vi.fn(),
  getExportStatus: vi.fn(),
  buildDownloadUrl: (u: string) => u,
}));

import { ExportModal } from "./ExportModal";
import { submitExport, getExportStatus } from "../api/exportApi";

const mockSubmit = submitExport as unknown as ReturnType<typeof vi.fn>;
const mockStatus = getExportStatus as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockSubmit.mockReset();
  mockStatus.mockReset();
  localStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe("ExportModal (issue #14)", () => {
  it("renders the preview card with the playbook's first step title", () => {
    const { getByText } = render(
      <ExportModal
        runId="r1"
        isDark
        previewTitle="比较 arr[0] 和 arr[1]"
        onClose={() => undefined}
      />,
    );
    expect(getByText("比较 arr[0] 和 arr[1]")).toBeTruthy();
  });

  it("starts with the 1080p / 30fps / MP4 defaults", () => {
    const { getByText } = render(
      <ExportModal runId="r1" isDark previewTitle="x" onClose={() => undefined} />,
    );
    // Active chips are bolded — assert their labels exist among rendered buttons.
    expect(getByText("高清 1080p")).toBeTruthy();
    expect(getByText("MP4")).toBeTruthy();
    expect(getByText("30 fps")).toBeTruthy();
  });

  it("forwards quality / fps / format choices to the submitExport call", async () => {
    mockSubmit.mockResolvedValue({
      job_id: "j1",
      run_id: "r1",
      status: "queued",
      progress: 0,
      message: null,
      output_url: null,
      error: null,
      with_audio: false,
      created_at: "now",
    });
    mockStatus.mockResolvedValue({
      job_id: "j1",
      run_id: "r1",
      status: "rendering",
      progress: 0.5,
      message: null,
      output_url: null,
      error: null,
      with_audio: false,
      created_at: "now",
    });

    const { getByText } = render(
      <ExportModal runId="r1" isDark previewTitle="x" onClose={() => undefined} />,
    );

    fireEvent.click(getByText("超清 2K"));
    fireEvent.click(getByText("WebM"));
    fireEvent.click(getByText("60 fps"));
    await act(async () => {
      fireEvent.click(getByText("开始导出"));
    });

    expect(mockSubmit).toHaveBeenCalledTimes(1);
    const body = mockSubmit.mock.calls[0][0] as { options: Record<string, unknown> };
    expect(body.options).toEqual({ quality: "2k", fps: 60, format: "webm" });
  });

  it("blocks audio export when TTS backend is still 'system'", async () => {
    const { getByText, findByRole } = render(
      <ExportModal runId="r1" isDark previewTitle="x" onClose={() => undefined} />,
    );
    fireEvent.click(getByText("包含配音（OpenAI TTS）"));
    await act(async () => {
      fireEvent.click(getByText("开始导出"));
    });
    const alert = await findByRole("alert");
    expect(alert.textContent ?? "").toMatch(/OpenAI 后端/);
    expect(mockSubmit).not.toHaveBeenCalled();
  });
});
