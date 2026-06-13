import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { useState } from "react";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it } from "vitest";

import { server } from "../../../mocks/server";
import { API_BASE_URL } from "../../../shared/config/constants";
import { usePipelineSubmit } from "./usePipelineSubmit";

function SubmitHarness() {
  const { submit, runId, error } = usePipelineSubmit();
  const [caught, setCaught] = useState(false);

  return (
    <div>
      <button
        type="button"
        onClick={() =>
          void submit({
            prompt: "讲解二分查找",
            domain: "algorithm",
            sourceCode: "while left < right:\n    right -= 1",
            language: "python",
          }).catch(() => setCaught(true))
        }
      >
        submit
      </button>
      <span>{runId ?? "no-run"}</span>
      <span>{error ?? "no-error"}</span>
      <span>{caught ? "caught" : "not-caught"}</span>
    </div>
  );
}

describe("usePipelineSubmit", () => {
  afterEach(() => {
    cleanup();
  });

  it("passes domain and source code hints to the pipeline API", async () => {
    server.use(
      http.post(`${API_BASE_URL}/api/v1/pipeline`, async ({ request }) => {
        expect(await request.json()).toMatchObject({
          prompt: "讲解二分查找",
          domain: "algorithm",
          source_code: "while left < right:\n    right -= 1",
          language: "python",
        });
        return HttpResponse.json({
          run_id: "run-code",
          status: "queued",
          created_at: "2026-06-12T00:00:00Z",
        });
      }),
    );

    const { getByRole, getByText } = render(<SubmitHarness />);

    fireEvent.click(getByRole("button", { name: "submit" }));

    await waitFor(() => expect(getByText("run-code")).toBeTruthy());
  });

  it("keeps submission failures visible to callers", async () => {
    server.use(
      http.post(`${API_BASE_URL}/api/v1/pipeline`, () =>
        HttpResponse.json({ detail: "provider unavailable" }, { status: 503 }),
      ),
    );

    const { getByRole, getByText } = render(<SubmitHarness />);

    fireEvent.click(getByRole("button", { name: "submit" }));

    await waitFor(() => expect(getByText("caught")).toBeTruthy());
    expect(getByText("provider unavailable")).toBeTruthy();
    expect(getByText("no-run")).toBeTruthy();
  });
});
