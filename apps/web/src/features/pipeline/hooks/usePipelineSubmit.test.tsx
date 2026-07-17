import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { useState } from "react";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it } from "vitest";

import { server } from "../../../mocks/server";
import { API_BASE_URL } from "../../../shared/config/constants";
import {
  usePipelineSubmit,
  type PipelineSubmitInput,
} from "./usePipelineSubmit";

function SubmitHarness({ input }: { input: PipelineSubmitInput }) {
  const { submit, runId, error } = usePipelineSubmit();
  const [caught, setCaught] = useState(false);
  const [resolvedRunId, setResolvedRunId] = useState<string | null>(null);

  return (
    <div>
      <button
        type="button"
        onClick={() =>
          void submit(input)
            .then((newRunId) => setResolvedRunId(newRunId))
            .catch(() => setCaught(true))
        }
      >
        submit
      </button>
      <span>{runId ?? "no-run"}</span>
      <span>{resolvedRunId ? `resolved:${resolvedRunId}` : "no-resolved-run"}</span>
      <span>{error ?? "no-error"}</span>
      <span>{caught ? "caught" : "not-caught"}</span>
    </div>
  );
}

describe("usePipelineSubmit", () => {
  afterEach(() => {
    cleanup();
  });

  it.each([
    "用动画解释导数的几何意义",
    "演示平抛运动的速度变化",
  ])("submits text with nullable routing evidence for %s", async (prompt) => {
    server.use(
      http.post(`${API_BASE_URL}/api/v1/pipeline`, async ({ request }) => {
        expect(await request.json()).toMatchObject({
          prompt,
          domain: null,
          source_code: null,
          language: null,
          source_filename: null,
          source_size_bytes: null,
        });
        return HttpResponse.json({
          run_id: "run-text",
          status: "queued",
          created_at: "2026-07-13T00:00:00Z",
        });
      }),
    );

    const { getByRole, getByText } = render(
      <SubmitHarness input={{ prompt }} />,
    );
    fireEvent.click(getByRole("button", { name: "submit" }));

    await waitFor(() => expect(getByText("run-text")).toBeTruthy());
  });

  it("submits code metadata without injecting a frontend domain", async () => {
    server.use(
      http.post(`${API_BASE_URL}/api/v1/pipeline`, async ({ request }) => {
        expect(await request.json()).toMatchObject({
          prompt: "讲解 solution.py 中的代码。",
          domain: null,
          source_code: "while left < right:\n    right -= 1",
          language: "python",
          source_filename: "solution.py",
          source_size_bytes: 39,
        });
        return HttpResponse.json({
          run_id: "run-code",
          status: "queued",
          created_at: "2026-07-13T00:00:00Z",
        });
      }),
    );

    const { getByRole, getByText } = render(
      <SubmitHarness
        input={{
          prompt: "讲解 solution.py 中的代码。",
          sourceCode: "while left < right:\n    right -= 1",
          language: "python",
          sourceFilename: "solution.py",
          sourceSizeBytes: 39,
        }}
      />,
    );

    fireEvent.click(getByRole("button", { name: "submit" }));

    await waitFor(() => expect(getByText("run-code")).toBeTruthy());
    expect(getByText("resolved:run-code")).toBeTruthy();
  });

  it("keeps submission failures visible to callers", async () => {
    server.use(
      http.post(`${API_BASE_URL}/api/v1/pipeline`, () =>
        HttpResponse.json({ detail: "provider unavailable" }, { status: 503 }),
      ),
    );

    const { getByRole, getByText } = render(
      <SubmitHarness input={{ prompt: "讲解二分查找" }} />,
    );

    fireEvent.click(getByRole("button", { name: "submit" }));

    await waitFor(() => expect(getByText("caught")).toBeTruthy());
    expect(getByText("provider unavailable")).toBeTruthy();
    expect(getByText("no-run")).toBeTruthy();
  });
});
