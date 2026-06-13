import { cleanup, render, waitFor } from "@testing-library/react";
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
    render(<App />);
    await waitFor(() =>
      expect(document.body.textContent).toContain("MetaView"),
    );

    expect(accountHits).toBe(0);
    expect(opsHits).toBe(0);
  });

  it("self edition shows the looping brand logo animation on the intake screen", async () => {
    vi.stubEnv("VITE_APP_EDITION", "self");

    const { App } = await import("./App");
    const { queryByLabelText } = render(<App />);

    await waitFor(() =>
      expect(document.body.textContent).toContain("MetaView"),
    );
    expect(queryByLabelText("MetaView logo animation")).not.toBeNull();
  });

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
    render(<App />);

    await waitFor(() => expect(accountHits).toBe(1));
    await waitFor(() =>
      expect(document.body.textContent).toContain("登录暂未开放"),
    );
    expect(document.body.textContent).not.toContain("把题目变成可播放的讲解");
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
    render(<App />);

    await waitFor(() => expect(accountHits).toBe(1));
    await waitFor(() => expect(dashboardHits).toBe(0));
    expect(document.body.textContent).toContain("把题目变成可播放的讲解");
    expect(document.body.textContent).not.toContain("全局运营");
    expect(document.body.textContent).toContain("微信用户 · ¥ 5.00");
  });

  it("self edition does not expose ops dashboard shortcut", async () => {
    vi.stubEnv("VITE_APP_EDITION", "self");

    const { App } = await import("./App");
    const { queryByText } = render(<App />);

    await waitFor(() => expect(queryByText("运营面板")).toBeNull());
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
    const { queryByText } = render(<App />);

    await waitFor(() => expect(dashboardHits).toBe(1));
    expect(document.body.textContent).toContain("全局运营");
    expect(queryByText("运营面板")).toBeNull();
  });
});
