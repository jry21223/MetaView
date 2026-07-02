import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import React from "react";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";

import { server } from "../mocks/server";
import { API_BASE_URL } from "../shared/config/constants";
import { sampleDashboard } from "../pages/OpsDashboard/testFixtures";

vi.mock("@remotion/player", () => ({
  Player: () => null,
}));

describe("App edition shells", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    vi.doUnmock("../features/pipeline/hooks/usePipelineSubmit");
    vi.doUnmock("../features/pipeline/hooks/usePipelinePoller");
    vi.resetModules();
    localStorage.clear();
    sessionStorage.clear();
    window.history.pushState({}, "", "/");
  });

  it("self edition does not load account state on the intake screen", async () => {
    let accountHits = 0;
    let opsHits = 0;
    server.use(
      http.get(`${API_BASE_URL}/api/v1/account/me`, () => {
        accountHits += 1;
        return HttpResponse.json(
          { detail: "should not be requested" },
          { status: 500 },
        );
      }),
      http.get(`${API_BASE_URL}/api/v1/ops/dashboard`, () => {
        opsHits += 1;
        return HttpResponse.json(
          { detail: "should not be requested" },
          { status: 500 },
        );
      }),
    );
    vi.stubEnv("VITE_APP_EDITION", "self");

    const { App } = await import("./App");
    const { container } = render(<App />);
    expect(container.textContent).toContain("MetaView");
    expect(container.querySelectorAll(".mv-top")).toHaveLength(1);

    expect(accountHits).toBe(0);
    expect(opsHits).toBe(0);
  }, 20000);

  it("self edition shows the canvas particle field on the intake screen", async () => {
    vi.stubEnv("VITE_APP_EDITION", "self");

    const { App } = await import("./App");
    const { container, queryByLabelText } = render(<App />);

    expect(container.textContent).toContain("MetaView");
    expect(
      container.querySelector('[data-testid="meta-particle-field"][data-variant="canvas"]'),
    ).toBeTruthy();
    expect(container.querySelector('[aria-label="MetaView logo animation"]')).toBeNull();
    expect(queryByLabelText("打开设计调节面板")).toBeNull();
  }, 10000);

  it("ops edition shows the login gate when account session is missing", async () => {
    let accountHits = 0;
    server.use(
      http.get(`${API_BASE_URL}/api/v1/account/me`, () => {
        accountHits += 1;
        return HttpResponse.json({ detail: "请先使用微信登录" }, { status: 401 });
      }),
      http.get(`${API_BASE_URL}/api/v1/auth/wechat/login-url`, () => {
        return HttpResponse.json({ detail: "微信登录未配置" }, { status: 503 });
      }),
    );
    vi.stubEnv("VITE_APP_EDITION", "ops");

    const { App } = await import("./App");
    const { container } = render(<App />);

    await waitFor(() => expect(accountHits).toBe(1));
    await waitFor(() =>
      expect(container.textContent).toContain("登录暂未开放"),
    );
    expect(container.textContent).not.toContain("把一道题变成可播放的理论画布");
  });

  it("ops edition opens the intake screen after WeChat login", async () => {
    let accountHits = 0;
    let dashboardHits = 0;
    server.use(
      http.get(`${API_BASE_URL}/api/v1/account/me`, () => {
        accountHits += 1;
        return HttpResponse.json({
          user_id: "user_1",
          display_name: "微信用户",
          avatar_url: null,
          login_provider: "wechat",
          status: "enabled",
          role: "user",
          balance_cents: 500,
          balance_yuan: "5.00",
          recharge_min_cents: 500,
          payment_enabled: false,
          wechat_login_enabled: true,
        });
      }),
      http.get(`${API_BASE_URL}/api/v1/ops/dashboard`, () => {
        dashboardHits += 1;
        return HttpResponse.json(sampleDashboard());
      }),
    );
    vi.stubEnv("VITE_APP_EDITION", "ops");

    const { App } = await import("./App");
    const { container } = render(<App />);

    await waitFor(() => expect(accountHits).toBe(1));
    await waitFor(() => expect(dashboardHits).toBe(0));
    expect(container.textContent).toContain("输入题目或代码，生成可播放的分步讲解");
    expect(container.textContent).not.toContain("全局运营");
    expect(container.textContent).toContain("微信用户 · ¥ 5.00");
    expect(container.querySelectorAll(".mv-top")).toHaveLength(1);
  });

  it("collapses the topbar by default on desktop workbench and restores it after leaving", async () => {
    server.use(
      http.get(`${API_BASE_URL}/api/v1/runs`, () => HttpResponse.json([])),
      http.get(`${API_BASE_URL}/api/v1/runs/run-shell/follow-ups`, () =>
        HttpResponse.json({ followups: [], versions: [] }),
      ),
    );
    vi.stubEnv("VITE_APP_EDITION", "self");
    vi.doMock("../features/pipeline/hooks/usePipelineSubmit", () => ({
      usePipelineSubmit: () => ({
        submit: vi.fn().mockResolvedValue("run-shell"),
        runId: "run-shell",
        isSubmitting: false,
        error: null,
      }),
    }));
    vi.doMock("../features/pipeline/hooks/usePipelinePoller", () => ({
      usePipelinePoller: () => ({
        playbook: shellPlaybook(),
        director: null,
        error: null,
        isLoading: false,
        status: "succeeded",
      }),
    }));

    const { App } = await import("./App");
    const { container, getByRole, getByText } = render(<App />);

    expect(container.querySelectorAll(".mv-top")).toHaveLength(1);
    fireEvent.click(getByRole("button", { name: /二分查找/ }));

    await waitFor(() =>
      expect(getByRole("button", { name: "显示顶部栏" })).toBeTruthy(),
    );
    expect(window.location.pathname).toBe("/run/run-shell");
    const shell = container.querySelector(".mv-top-shell");
    expect(shell).toBeTruthy();
    expect(container.querySelectorAll(".mv-top")).toHaveLength(1);
    expect(shell?.className).toContain("is-collapsed");
    expect(shell?.getAttribute("aria-hidden")).toBe("true");
    expect(shell?.hasAttribute("inert")).toBe(true);

    fireEvent.click(getByRole("button", { name: "显示顶部栏" }));
    expect(shell?.className).not.toContain("is-collapsed");
    expect(shell?.getAttribute("aria-hidden")).toBeNull();
    expect(shell?.hasAttribute("inert")).toBe(false);

    fireEvent.click(getByText("任务历史"));
    await waitFor(() => {
      expect(shell?.className).not.toContain("is-collapsed");
      expect(getByText("任务历史")).toBeTruthy();
    });
    expect(shell?.getAttribute("aria-hidden")).toBeNull();
    expect(shell?.hasAttribute("inert")).toBe(false);
  });

  it("self edition does not expose ops dashboard shortcut", async () => {
    vi.stubEnv("VITE_APP_EDITION", "self");

    const { App } = await import("./App");
    const { queryByText } = render(<App />);

    await waitFor(() => expect(queryByText("运营面板")).toBeNull());
  });

  it("does not render the ops dashboard on /admin in self edition", async () => {
    let dashboardHits = 0;
    server.use(
      http.get(`${API_BASE_URL}/api/v1/ops/dashboard`, () => {
        dashboardHits += 1;
        return HttpResponse.json(sampleDashboard());
      }),
    );
    vi.stubEnv("VITE_APP_EDITION", "self");
    window.history.pushState({}, "", "/admin");

    const { App } = await import("./App");
    const { container } = render(<App />);

    expect(container.textContent).toContain("运营后台仅在 ops edition 可用");
    expect(container.textContent).not.toContain("全局运营");
    expect(dashboardHits).toBe(0);
  });

  it("loads the hidden ops dashboard on /admin without exposing a nav shortcut", async () => {
    let dashboardHits = 0;
    server.use(
      http.get(`${API_BASE_URL}/api/v1/ops/dashboard`, () => {
        dashboardHits += 1;
        return HttpResponse.json(sampleDashboard());
      }),
    );
    vi.stubEnv("VITE_APP_EDITION", "ops");
    window.history.pushState({}, "", "/admin");

    const { App } = await import("./App");
    const { container, queryByText } = render(<App />);

    await waitFor(() => expect(dashboardHits).toBe(1));
    expect(container.textContent).toContain("全局运营");
    expect(queryByText("运营面板")).toBeNull();
  });
});

function shellPlaybook() {
  return {
    schema_version: "1.0.0",
    fps: 30,
    total_frames: 60,
    domain: "math",
    title: "Shell topbar lesson",
    summary: "用于验证 shell 级顶部栏。",
    parameter_controls: [],
    steps: [
      {
        step_id: "step_01",
        end_frame: 60,
        title: "Step 1",
        voiceover_text: "Narration",
        snapshot: {
          kind: "math_formula",
          formula_latex: "x",
        },
        tokens: [],
      },
    ],
  };
}
