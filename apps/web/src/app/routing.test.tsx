import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
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
    vi.unstubAllGlobals();
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

  it("keeps public templates outside account and pipeline shells, including ops edition", async () => {
    let accountHits = 0;
    let pipelineHits = 0;
    server.use(
      http.get(`${API_BASE_URL}/api/v1/account/me`, () => {
        accountHits += 1;
        return HttpResponse.json({ detail: "must not be requested" }, { status: 500 });
      }),
      http.get(`${API_BASE_URL}/api/v1/pipeline`, () => {
        pipelineHits += 1;
        return HttpResponse.json({ detail: "must not be requested" }, { status: 500 });
      }),
    );
    vi.stubEnv("VITE_APP_EDITION", "ops");
    window.history.pushState({}, "", "/templates");

    const { App } = await import("./App");
    const { getByRole } = render(<App />);

    expect(getByRole("heading", { name: "模板本身，就是可以播放的案例" })).toBeTruthy();
    expect(accountHits).toBe(0);
    expect(pipelineHits).toBe(0);
  });

  it("plays, adjusts parameters, and answers follow-ups without any network request", async () => {
    let accountHits = 0;
    let pipelineHits = 0;
    const networkSpy = vi.fn();
    vi.stubGlobal("fetch", networkSpy);
    localStorage.setItem("mv_tts_settings", JSON.stringify({
      enabled: true,
      backend: "openai",
      voice: "alloy",
      rate: 1,
    }));
    server.use(
      http.get(`${API_BASE_URL}/api/v1/account/me`, () => {
        accountHits += 1;
        return HttpResponse.json({ detail: "must not be requested" }, { status: 500 });
      }),
      http.get(`${API_BASE_URL}/api/v1/pipeline`, () => {
        pipelineHits += 1;
        return HttpResponse.json({ detail: "must not be requested" }, { status: 500 });
      }),
    );
    vi.stubEnv("VITE_APP_EDITION", "self");
    window.history.pushState({}, "", "/templates/derivative-tangent");

    const { App } = await import("./App");
    const { getByRole, getByText, queryByText } = render(<App />);

    expect(getByText("静态案例 · 不调用模型")).toBeTruthy();
    fireEvent.click(getByRole("button", { name: "播放" }));
    fireEvent.change(getByRole("slider", { name: /切点 a/ }), { target: { value: "1.4" } });
    fireEvent.click(getByRole("button", { name: "当前切点和斜率是多少？" }));
    fireEvent.click(getByRole("button", { name: "播放器设置" }));

    expect(getByText("切点 a=1.4，对应导数与切线斜率都是 2.8。")).toBeTruthy();
    expect(queryByText("语音后端")).toBeNull();
    expect(accountHits).toBe(0);
    expect(pipelineHits).toBe(0);
    expect(networkSpy).not.toHaveBeenCalled();
  });

  it("keeps pending template deep links unavailable instead of generating them", async () => {
    vi.stubEnv("VITE_APP_EDITION", "ops");
    window.history.pushState({}, "", "/templates/quick-sort");

    const { App } = await import("./App");
    const { getByRole, getByText } = render(<App />);

    expect(getByRole("status").textContent).toContain("快速排序案例仍在制作");
    expect(getByText("返回模板目录")).toBeTruthy();
  });

  it("redirects legacy case routes into the template catalog", async () => {
    vi.stubEnv("VITE_APP_EDITION", "self");
    window.history.pushState({}, "", "/cases/bfs-tree");

    const { App } = await import("./App");
    render(<App />);

    await waitFor(() => expect(window.location.pathname).toBe("/templates/bfs-tree"));
  });

  it("redirects the old cases index to templates", async () => {
    vi.stubEnv("VITE_APP_EDITION", "self");
    window.history.pushState({}, "", "/cases");

    const { App } = await import("./App");
    const { getByRole } = render(<App />);

    await waitFor(() => expect(window.location.pathname).toBe("/templates"));
    expect(getByRole("heading", { name: "模板本身，就是可以播放的案例" })).toBeTruthy();
  });

  it("returns the retired factorial showcase link to the template catalog", async () => {
    vi.stubEnv("VITE_APP_EDITION", "self");
    window.history.pushState({}, "", "/cases/factorial-stack");

    const { App } = await import("./App");
    render(<App />);

    await waitFor(() => expect(window.location.pathname).toBe("/templates"));
  });

  it("redirects unknown app paths back to the public landing page", async () => {
    vi.stubEnv("VITE_APP_EDITION", "self");
    window.history.pushState({}, "", "/nope");

    const { App } = await import("./App");
    const { getByText } = render(<App />);

    await waitFor(() => expect(window.location.pathname).toBe("/"));
    expect(getByText("把一道题，变成一段看得见的理解过程。")).toBeTruthy();
  });

  it("keeps logged-out /run/:runId deep links in place behind a route-level login prompt", async () => {
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

    await waitFor(() => expect(getByText("登录后继续使用")).toBeTruthy());
    expect(window.location.pathname).toBe("/run/run-1");
  });
});
