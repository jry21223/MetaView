import { cleanup, render, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";

import { server } from "../mocks/server";
import { API_BASE_URL } from "../shared/config/constants";

vi.mock("@remotion/player", () => ({
  Player: () => <div data-testid="mock-remotion-player" />,
}));

const pollerResult = {
  playbook: null,
  director: null,
  error: null,
  errorKind: null,
  prompt: null,
  createdAt: "2026-06-02T00:00:00.000Z",
  isLoading: true,
  status: "running",
  retry: vi.fn(),
};

describe("App routing", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    vi.doUnmock("../features/pipeline/hooks/usePipelinePoller");
    vi.resetModules();
    localStorage.clear();
    sessionStorage.clear();
    window.history.pushState({}, "", "/");
  });

  it(
    "renders the public landing page at /",
    async () => {
      vi.stubEnv("VITE_APP_EDITION", "self");

      const { App } = await import("./App");
      const { getByText } = render(<App />);

      expect(getByText("把一道题，变成一段看得见的理解过程。")).toBeTruthy();
      expect(window.location.pathname).toBe("/");
    },
    15_000,
  );

  it("opens the creation intake directly from /create", async () => {
    vi.stubEnv("VITE_APP_EDITION", "self");
    window.history.pushState({}, "", "/create");

    const { App } = await import("./App");
    const { getByText } = render(<App />);

    expect(getByText("新建可视化讲解")).toBeTruthy();
  });

  it("restores the workbench from a direct /run/:runId link", async () => {
    const seenRunIds: Array<string | null> = [];
    vi.stubEnv("VITE_APP_EDITION", "self");
    vi.doMock("../features/pipeline/hooks/usePipelinePoller", () => ({
      usePipelinePoller: (runId: string | null) => {
        seenRunIds.push(runId);
        return pollerResult;
      },
    }));
    window.history.pushState({}, "", "/run/run-1");

    const { App } = await import("./App");
    const { getByRole } = render(<App />);

    await waitFor(() => expect(seenRunIds).toContain("run-1"));
    expect(getByRole("status").textContent).toContain("正在生成脚本");
  });

  it("opens history directly from /history", async () => {
    server.use(
      http.get(`${API_BASE_URL}/api/v1/runs`, () => HttpResponse.json([])),
    );
    vi.stubEnv("VITE_APP_EDITION", "self");
    window.history.pushState({}, "", "/history");

    const { App } = await import("./App");
    const { getByRole, getByText } = render(<App />);

    await waitFor(() => expect(getByText("0 / 0 条")).toBeTruthy());
    expect(getByRole("searchbox")).toBeTruthy();
  });

  it("redirects unknown app paths back to the public landing page", async () => {
    vi.stubEnv("VITE_APP_EDITION", "self");
    window.history.pushState({}, "", "/nope");

    const { App } = await import("./App");
    const { getByText } = render(<App />);

    await waitFor(() => expect(window.location.pathname).toBe("/"));
    expect(getByText("把一道题，变成一段看得见的理解过程。")).toBeTruthy();
  });

  it("shows the ops login gate for logged-out /run/:runId deep links", async () => {
    server.use(
      http.get(`${API_BASE_URL}/api/v1/account/me`, () =>
        HttpResponse.json({ detail: "请先使用微信登录" }, { status: 401 }),
      ),
      http.get(`${API_BASE_URL}/api/v1/auth/wechat/login-url`, () =>
        HttpResponse.json({ detail: "微信登录未配置" }, { status: 503 }),
      ),
    );
    vi.stubEnv("VITE_APP_EDITION", "ops");
    window.history.pushState({}, "", "/run/run-1");

    const { App } = await import("./App");
    const { getByText } = render(<App />);

    await waitFor(() => expect(getByText("登录暂未开放，请联系管理员。")).toBeTruthy());
    expect(window.location.pathname).toBe("/run/run-1");
  });
});
