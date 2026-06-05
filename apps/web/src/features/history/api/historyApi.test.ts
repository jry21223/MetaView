import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";

import { server } from "../../../mocks/server";
import { API_BASE_URL } from "../../../shared/config/constants";
import { deletePipelineRun, getPipelineRun, getPipelineRuns } from "./historyApi";

describe("historyApi", () => {
  it("uses account cookies for list, detail, and delete", async () => {
    server.use(
      http.get(`${API_BASE_URL}/api/v1/runs`, ({ request }) => {
        expect(request.credentials).toBe("include");
        return HttpResponse.json([
          {
            run_id: "run-1",
            request_id: "run-1",
            status: "succeeded",
            prompt: "hello",
            created_at: "2026-06-05T00:00:00Z",
            updated_at: "2026-06-05T00:00:00Z",
            title: "Run",
          },
        ]);
      }),
      http.get(`${API_BASE_URL}/api/v1/runs/run-1`, ({ request }) => {
        expect(request.credentials).toBe("include");
        return HttpResponse.json({
          run_id: "run-1",
          request_id: "run-1",
          status: "succeeded",
          prompt: "hello",
          created_at: "2026-06-05T00:00:00Z",
          updated_at: "2026-06-05T00:00:00Z",
          title: "Run",
          request: {
            prompt: "hello",
            enable_narration: true,
            sandbox_mode: "dry_run",
            persist_run: true,
          },
          response: null,
        });
      }),
      http.delete(`${API_BASE_URL}/api/v1/runs/run-1`, ({ request }) => {
        expect(request.credentials).toBe("include");
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const runs = await getPipelineRuns();
    const detail = await getPipelineRun("run-1");
    await deletePipelineRun("run-1");

    expect(runs[0].request_id).toBe("run-1");
    expect(detail.request.prompt).toBe("hello");
  });
});
