import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import React from "react";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";

import { server } from "../mocks/server";
import { API_BASE_URL } from "../shared/config/constants";
import { sampleDashboard } from "../pages/OpsDashboard/testFixtures";

describe("App edition shells", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    vi.resetModules();
    localStorage.clear();
    sessionStorage.clear();
  });

  it("self edition does not load account state on the intake screen", async () => {
    let accountHits = 0;
    let opsHits = 0;
    server.use(
      http.get(`${API_BASE_URL}/api/v1/account/me`, () => {
        accountHits += 1;
        return HttpResponse.json({ detail: "should not be requested" }, { status: 500 });
      }),
      http.get(`${API_BASE_URL}/api/v1/ops/dashboard`, () => {
        opsHits += 1;
        return HttpResponse.json({ detail: "should not be requested" }, { status: 500 });
      }),
    );
    vi.stubEnv("VITE_APP_EDITION", "self");

    const { App } = await import("./App");
    render(<App />);
    await waitFor(() => expect(document.body.textContent).toContain("MetaView"));

    expect(accountHits).toBe(0);
    expect(opsHits).toBe(0);
  });

  it("ops edition loads account state and opens the global dashboard", async () => {
    let accountHits = 0;
    let dashboardHits = 0;
    server.use(
      http.get(`${API_BASE_URL}/api/v1/account/me`, () => {
        accountHits += 1;
        return HttpResponse.json({
          user_id: "user_1",
          display_name: "游客账户",
          avatar_url: null,
          login_provider: "guest",
          status: "enabled",
          role: "admin",
          balance_cents: 500,
          balance_yuan: "5.00",
          recharge_min_cents: 500,
          payment_enabled: false,
          wechat_login_enabled: false,
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
    await waitFor(() => expect(dashboardHits).toBe(1));
    expect(document.body.textContent).toContain("全局运营");
    expect(document.body.textContent).toContain("余额 ¥ 5.00");
  });

  it("opens an existing history run in the workbench without submitting", async () => {
    let detailHits = 0;
    let submitHits = 0;
    server.use(
      http.get(`${API_BASE_URL}/api/v1/runs`, () =>
        HttpResponse.json([
          {
            run_id: "history-run-1",
            status: "running",
            prompt: "讲解格林公式",
            playbook: null,
            error: null,
            created_at: "2026-06-01T10:00:00.000Z",
            review: null,
          },
        ]),
      ),
      http.get(`${API_BASE_URL}/api/v1/runs/history-run-1`, () => {
        detailHits += 1;
        return HttpResponse.json({
          run_id: "history-run-1",
          status: "running",
          prompt: "讲解格林公式",
          playbook: null,
          error: null,
          created_at: "2026-06-01T10:00:00.000Z",
          review: null,
        });
      }),
      http.post(`${API_BASE_URL}/api/v1/pipeline`, () => {
        submitHits += 1;
        return HttpResponse.json({ detail: "should not submit" }, { status: 500 });
      }),
    );
    vi.stubEnv("VITE_APP_EDITION", "self");

    const { App } = await import("./App");
    const { getByRole, getByText } = render(<App />);

    fireEvent.click(getByRole("button", { name: "任务历史" }));
    await waitFor(() => expect(getByText("讲解格林公式")).toBeTruthy());
    fireEvent.click(getByRole("button", { name: "在工作台打开" }));

    await waitFor(() => expect(detailHits).toBeGreaterThan(0));
    expect(submitHits).toBe(0);
    expect(document.body.textContent).toContain("正在生成脚本");
  });
});
