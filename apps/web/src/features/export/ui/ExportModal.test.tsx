import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import React from "react";
import { http, HttpResponse } from "msw";

import { server } from "../../../mocks/server";
import { API_BASE_URL } from "../../../shared/config/constants";
import { ExportModal } from "./ExportModal";

interface CapturedSubmit {
  body: Record<string, unknown> | null;
}

/** Register the export-submit + poll fixtures and return a handle that the
 *  test can read after the request lands. Issue #58 — these tests run
 *  against the real ``submitExport`` / ``getExportStatus`` pipeline via MSW
 *  network interception, not vi.mock() module substitution. */
function fixtureExportPipeline(): CapturedSubmit {
  const captured: CapturedSubmit = { body: null };
  server.use(
    http.post(`${API_BASE_URL}/api/v1/exports`, async ({ request }) => {
      captured.body = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({
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
    }),
    http.get(`${API_BASE_URL}/api/v1/exports/j1`, () =>
      HttpResponse.json({
        job_id: "j1",
        run_id: "r1",
        status: "rendering",
        progress: 0.5,
        message: null,
        output_url: null,
        error: null,
        with_audio: false,
        created_at: "now",
      }),
    ),
  );
  return captured;
}

describe("ExportModal (issue #14 / #58)", () => {
  afterEach(() => {
    cleanup();
  });

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
    expect(getByText("高清 1080p")).toBeTruthy();
    expect(getByText("MP4")).toBeTruthy();
    expect(getByText("30 fps")).toBeTruthy();
  });

  it("forwards quality / fps / format choices to the submitted request body", async () => {
    const captured = fixtureExportPipeline();

    const { getByText } = render(
      <ExportModal runId="r1" isDark previewTitle="x" onClose={() => undefined} />,
    );

    fireEvent.click(getByText("超清 2K"));
    fireEvent.click(getByText("WebM"));
    fireEvent.click(getByText("60 fps"));
    await act(async () => {
      fireEvent.click(getByText("开始导出"));
    });

    await waitFor(() => expect(captured.body).not.toBeNull());
    expect(captured.body).toMatchObject({
      run_id: "r1",
      with_audio: false,
      options: { quality: "2k", fps: 60, format: "webm" },
    });
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
  });
});
