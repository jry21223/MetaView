import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import React from "react";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { server } from "../../mocks/server";
import { API_BASE_URL } from "../../shared/config/constants";
import { sampleDashboard } from "./testFixtures";
import { OpsDashboardPage } from "./OpsDashboardPage";

function renderPage({ onNavigate = vi.fn() }: { onNavigate?: ReturnType<typeof vi.fn> } = {}) {
  return render(
    <OpsDashboardPage
      accountName="管理员"
      accountBalanceYuan="9.00"
      accountAvatarUrl={null}
      onNavigate={onNavigate}
      onOpenProviderSettings={vi.fn()}
    />,
  );
}

describe("OpsDashboardPage", () => {
  beforeEach(() => {
    if (!("ResizeObserver" in window)) {
      Object.defineProperty(window, "ResizeObserver", {
        configurable: true,
        value: class {
          observe() {}
          unobserve() {}
          disconnect() {}
        },
      });
    }
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders KPI, charts, table, and health tree from the dashboard API", async () => {
    server.use(
      http.get(`${API_BASE_URL}/api/v1/ops/dashboard`, () =>
        HttpResponse.json(sampleDashboard()),
      ),
    );

    const { findByText, getAllByText, getByText } = renderPage();

    expect(await findByText("运营总览")).toBeTruthy();
    expect(getByText("用户数")).toBeTruthy();
    expect(getAllByText("¥ 15.00")).toHaveLength(2);
    expect(getByText("任务趋势")).toBeTruthy();
    expect(getByText("收入趋势")).toBeTruthy();
    expect(getByText("矩阵特征值")).toBeTruthy();
    expect(getByText("数学")).toBeTruthy();
    expect(getByText("窗口任务")).toBeTruthy();
  });

  it("marks failed tasks and pending orders for fast scanning", async () => {
    const dashboard = sampleDashboard();
    dashboard.recent_runs[0].status = "failed";
    dashboard.recent_orders[0].status = "pending";
    server.use(
      http.get(`${API_BASE_URL}/api/v1/ops/dashboard`, () =>
        HttpResponse.json(dashboard),
      ),
    );

    const { container, findByText, getByRole } = renderPage();
    await findByText("矩阵特征值");
    expect(container.querySelector(".MuiDataGrid-row.is-failed")).toBeTruthy();

    fireEvent.click(getByRole("tab", { name: "订单" }));
    await waitFor(() =>
      expect(container.querySelector(".MuiDataGrid-row.is-pending")).toBeTruthy(),
    );
  });

  it("does not render row-level user identifiers from dashboard payloads", async () => {
    const dashboard = sampleDashboard();
    Object.assign(dashboard.recent_runs[0], {
      user_id: "user-secret-1",
      user_display_name: "敏感用户",
    });
    Object.assign(dashboard.recent_orders[0], {
      user_id: "user-secret-1",
      user_display_name: "敏感用户",
    });
    server.use(
      http.get(`${API_BASE_URL}/api/v1/ops/dashboard`, () =>
        HttpResponse.json(dashboard),
      ),
    );

    const { findByText, queryByText } = renderPage();

    expect(await findByText("矩阵特征值")).toBeTruthy();
    expect(queryByText("敏感用户")).toBeNull();
    expect(document.body.textContent).not.toContain("user-secret-1");
  });

  it("shows the admin permission empty state for 403 responses", async () => {
    server.use(
      http.get(`${API_BASE_URL}/api/v1/ops/dashboard`, () =>
        HttpResponse.json({ detail: "需要管理员权限" }, { status: 403 }),
      ),
    );

    const { findByText, queryByText } = renderPage();

    expect(await findByText("需要管理员权限")).toBeTruthy();
    expect(queryByText("最近任务")).toBeNull();
  });

  it("does not show dashboard nav item while already on dashboard", async () => {
    server.use(
      http.get(`${API_BASE_URL}/api/v1/ops/dashboard`, () =>
        HttpResponse.json(sampleDashboard()),
      ),
    );

    const { findByText, queryByText } = renderPage();
    await findByText("运营总览");

    expect(queryByText("运营面板")).toBeNull();
  });

  it("shows loading and generic error states", async () => {
    server.use(
      http.get(`${API_BASE_URL}/api/v1/ops/dashboard`, () =>
        HttpResponse.json({ detail: "database unavailable" }, { status: 500 }),
      ),
    );

    const { findByText, getByText } = renderPage();

    expect(getByText("同步运营数据")).toBeTruthy();
    expect(await findByText("加载失败")).toBeTruthy();
    expect(getByText("database unavailable")).toBeTruthy();
  });

  it("refreshes and changes the statistics window", async () => {
    const seenUrls: string[] = [];
    server.use(
      http.get(`${API_BASE_URL}/api/v1/ops/dashboard`, ({ request }) => {
        seenUrls.push(request.url);
        return HttpResponse.json(sampleDashboard());
      }),
    );

    const { findByText, getByRole } = renderPage();
    await findByText("矩阵特征值");

    fireEvent.click(getByRole("button", { name: "刷新运营数据" }));
    await waitFor(() => expect(seenUrls).toHaveLength(2), { timeout: 10_000 });

    fireEvent.click(getByRole("button", { name: "90 天" }));
    await waitFor(
      () => expect(seenUrls.at(-1)).toContain("window_days=90"),
      { timeout: 10_000 },
    );
  }, 15_000);

  it("passes workspace navigation through to the app shell", async () => {
    const onNavigate = vi.fn();
    server.use(
      http.get(`${API_BASE_URL}/api/v1/ops/dashboard`, () =>
        HttpResponse.json(sampleDashboard()),
      ),
    );

    const { findByText, getAllByRole } = renderPage({ onNavigate });
    await findByText("运营总览");

    fireEvent.click(getAllByRole("button", { name: "工作台" })[0]);
    expect(onNavigate).toHaveBeenCalledWith("intake");
  });
});
