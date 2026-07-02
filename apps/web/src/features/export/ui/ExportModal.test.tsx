import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

describe("ExportModal (issue #14 / #58 / #69 / #70 / #72 / #75)", () => {
  beforeEach(() => {
    // Issue #70: the modal persists jobIds in sessionStorage to survive a
    // close/reopen cycle. Wipe both stores between tests so prior fixtures
    // don't leak into the next render.
    sessionStorage.clear();
    localStorage.clear();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
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

  it("forwards the asset attribution report to the submitted request body", async () => {
    const captured = fixtureExportPipeline();

    const { getByText } = render(
      <ExportModal
        runId="r1"
        isDark
        previewTitle="x"
        assetReport={{
          generated_by: "visual_quality_gate",
          entries: [
            {
              asset_id: "cc-by-diagram",
              pack_id: "physics-basic",
              license: "cc-by-4.0",
              commercial_use_status: "allowed-with-attribution",
              attribution: "Example Creator",
              source_url: "https://example.test/asset",
              license_url: "https://creativecommons.org/licenses/by/4.0/",
              requires_attribution: true,
              commercial_use_restricted: false,
              share_alike: false,
              unknown_license: false,
              warning_codes: ["asset_requires_attribution"],
              step_ids: ["s1"],
            },
          ],
          attribution_required: ["physics-basic/cc-by-diagram"],
          license_risk: [],
        }}
        onClose={() => undefined}
      />,
    );

    await act(async () => {
      fireEvent.click(getByText("开始导出"));
    });

    await waitFor(() => expect(captured.body).not.toBeNull());
    expect(captured.body).toMatchObject({
      asset_report: {
        generated_by: "visual_quality_gate",
        entries: [
          {
            asset_id: "cc-by-diagram",
            pack_id: "physics-basic",
            attribution: "Example Creator",
            requires_attribution: true,
          },
        ],
        attribution_required: ["physics-basic/cc-by-diagram"],
        license_risk: [],
      },
    });
  });

  it("renders an asset report download link when the completed job exposes one", async () => {
    server.use(
      http.post(`${API_BASE_URL}/api/v1/exports`, () =>
        HttpResponse.json({
          job_id: "j1",
          run_id: "r1",
          status: "queued",
          progress: 0,
          message: null,
          output_url: null,
          asset_report_url: null,
          error: null,
          with_audio: false,
          created_at: "now",
        }),
      ),
      http.get(`${API_BASE_URL}/api/v1/exports/j1`, () =>
        HttpResponse.json({
          job_id: "j1",
          run_id: "r1",
          status: "completed",
          progress: 1,
          message: null,
          output_url: "/api/v1/exports/j1/download",
          asset_report_url: "/api/v1/exports/j1/asset-report",
          error: null,
          with_audio: false,
          created_at: "now",
        }),
      ),
    );
    const { getByText, findByText } = render(
      <ExportModal runId="r1" isDark previewTitle="x" onClose={() => undefined} />,
    );
    await act(async () => {
      fireEvent.click(getByText("开始导出"));
    });

    const link = await findByText(/下载授权报告/, {}, { timeout: 4000 });
    expect((link as HTMLAnchorElement).href).toContain("/api/v1/exports/j1/asset-report");
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

  // ---- Issue #75 — expanded coverage below this line ----

  it("× button calls onClose", () => {
    const onClose = vi.fn();
    const { getByLabelText } = render(
      <ExportModal runId="r1" isDark previewTitle="x" onClose={onClose} />,
    );
    fireEvent.click(getByLabelText("关闭"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("disables 开始导出 when runId is null", () => {
    const { getByText } = render(
      <ExportModal runId={null} isDark previewTitle="x" onClose={() => undefined} />,
    );
    expect((getByText("开始导出") as HTMLButtonElement).disabled).toBe(true);
  });

  it("surfaces server-side submit failure as alert", async () => {
    server.use(
      http.post(`${API_BASE_URL}/api/v1/exports`, () =>
        HttpResponse.json({ detail: "boom" }, { status: 500 }),
      ),
    );
    const { getByText, findByRole } = render(
      <ExportModal runId="r1" isDark previewTitle="x" onClose={() => undefined} />,
    );
    await act(async () => {
      fireEvent.click(getByText("开始导出"));
    });
    const alert = await findByRole("alert");
    expect(alert.textContent ?? "").toMatch(/boom|提交/);
  });

  it("renders the download link when status reaches completed", async () => {
    server.use(
      http.post(`${API_BASE_URL}/api/v1/exports`, () =>
        HttpResponse.json({
          job_id: "j1",
          run_id: "r1",
          status: "queued",
          progress: 0,
          message: null,
          output_url: null,
          error: null,
          with_audio: false,
          created_at: "now",
        }),
      ),
      http.get(`${API_BASE_URL}/api/v1/exports/j1`, () =>
        HttpResponse.json({
          job_id: "j1",
          run_id: "r1",
          status: "completed",
          progress: 1,
          message: null,
          output_url: "/api/v1/exports/j1/download",
          error: null,
          with_audio: false,
          created_at: "now",
        }),
      ),
    );
    const { getByText, findByText } = render(
      <ExportModal runId="r1" isDark previewTitle="x" onClose={() => undefined} />,
    );
    await act(async () => {
      fireEvent.click(getByText("开始导出"));
    });
    const link = await findByText(/下载 MP4/, {}, { timeout: 4000 });
    expect((link as HTMLAnchorElement).href).toContain("/api/v1/exports/j1/download");
  });

  it("renders the server's error string when status reaches failed", async () => {
    server.use(
      http.post(`${API_BASE_URL}/api/v1/exports`, () =>
        HttpResponse.json({
          job_id: "j1",
          run_id: "r1",
          status: "queued",
          progress: 0,
          message: null,
          output_url: null,
          error: null,
          with_audio: false,
          created_at: "now",
        }),
      ),
      http.get(`${API_BASE_URL}/api/v1/exports/j1`, () =>
        HttpResponse.json({
          job_id: "j1",
          run_id: "r1",
          status: "failed",
          progress: 0.2,
          message: null,
          output_url: null,
          error: "remotion crashed",
          with_audio: false,
          created_at: "now",
        }),
      ),
    );
    const { getByText, findByText } = render(
      <ExportModal runId="r1" isDark previewTitle="x" onClose={() => undefined} />,
    );
    await act(async () => {
      fireEvent.click(getByText("开始导出"));
    });
    await findByText(/remotion crashed/, {}, { timeout: 4000 });
  });

  it(
    "stops polling when the poll request errors (issue #69)",
    async () => {
      let pollCalls = 0;
      server.use(
        http.post(`${API_BASE_URL}/api/v1/exports`, () =>
          HttpResponse.json({
            job_id: "j1",
            run_id: "r1",
            status: "queued",
            progress: 0,
            message: null,
            output_url: null,
            error: null,
            with_audio: false,
            created_at: "now",
          }),
        ),
        http.get(`${API_BASE_URL}/api/v1/exports/j1`, () => {
          pollCalls += 1;
          return HttpResponse.json({ detail: "network down" }, { status: 502 });
        }),
      );
      const { getByText, findByRole } = render(
        <ExportModal runId="r1" isDark previewTitle="x" onClose={() => undefined} />,
      );
      await act(async () => {
        fireEvent.click(getByText("开始导出"));
      });
      const alert = await findByRole("alert", {}, { timeout: 4000 });
      expect(alert.textContent ?? "").toMatch(/network down|轮询/);
      const stopAt = pollCalls;
      // Give the (now-stopped) poll loop a couple of intervals to misbehave.
      // POLL_INTERVAL_MS is 1500 — wait > 2 intervals to be confident.
      await new Promise((resolve) => setTimeout(resolve, 3500));
      expect(pollCalls).toBe(stopAt);
    },
    15000,
  );

  it("forwards the persisted TTS voice when withAudio + openai backend", async () => {
    // Pre-seed localStorage as if the user already switched to the OpenAI
    // backend in the player TTS settings — readStoredTTSConfig() is what the
    // modal reads at submit time (issue #72).
    localStorage.setItem(
      "mv_tts_settings",
      JSON.stringify({ enabled: true, backend: "openai", voice: "echo", rate: 1.0 }),
    );
    const captured = fixtureExportPipeline();
    const { getByText } = render(
      <ExportModal runId="r1" isDark previewTitle="x" onClose={() => undefined} />,
    );
    fireEvent.click(getByText("包含配音（OpenAI TTS）"));
    await act(async () => {
      fireEvent.click(getByText("开始导出"));
    });
    await waitFor(() => expect(captured.body).not.toBeNull());
    expect(captured.body).toMatchObject({
      with_audio: true,
      tts: { voice: "echo" },
    });
  });

  it("rejoins an in-flight job via sessionStorage on mount (issue #70)", async () => {
    sessionStorage.setItem("mv_export_jobs", JSON.stringify({ r1: "j1" }));
    server.use(
      http.get(`${API_BASE_URL}/api/v1/exports/j1`, () =>
        HttpResponse.json({
          job_id: "j1",
          run_id: "r1",
          status: "completed",
          progress: 1,
          message: null,
          output_url: "/api/v1/exports/j1/download",
          error: null,
          with_audio: false,
          created_at: "now",
        }),
      ),
    );
    const { findByText } = render(
      <ExportModal runId="r1" isDark previewTitle="x" onClose={() => undefined} />,
    );
    await findByText(/下载 MP4/, {}, { timeout: 4000 });
  });
});
