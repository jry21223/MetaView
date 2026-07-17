import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";

import { server } from "../../../mocks/server";
import { API_BASE_URL } from "../../../shared/config/constants";
import { getPipelineRun, submitPipeline } from "./pipelineApi";

describe("pipelineApi", () => {
  it("submits and reads runs with account cookies", async () => {
    server.use(
      http.post(`${API_BASE_URL}/api/v1/pipeline`, async ({ request }) => {
        expect(request.credentials).toBe("include");
        expect(await request.json()).toMatchObject({
          prompt: "hello",
          domain: null,
          source_code: "print('hello')",
          language: "python",
          source_filename: "hello.py",
          source_size_bytes: 14,
        });
        return HttpResponse.json({
          run_id: "run-1",
          status: "queued",
          created_at: "2026-06-05T00:00:00Z",
        });
      }),
      http.get(`${API_BASE_URL}/api/v1/runs/run-1`, ({ request }) => {
        expect(request.credentials).toBe("include");
        return HttpResponse.json({
          run_id: "run-1",
          status: "succeeded",
          prompt: "hello",
          playbook: null,
          director: null,
          error: null,
          created_at: "2026-06-05T00:00:00Z",
          review: null,
        });
      }),
    );

    const submitted = await submitPipeline({
      prompt: "hello",
      domain: null,
      source_code: "print('hello')",
      language: "python",
      source_filename: "hello.py",
      source_size_bytes: 14,
    });
    const run = await getPipelineRun(submitted.run_id);

    expect(submitted.run_id).toBe("run-1");
    expect(run.status).toBe("succeeded");
  });
});
