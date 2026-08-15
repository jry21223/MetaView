import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import React from "react";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { server } from "../../mocks/server";
import { API_BASE_URL } from "../../shared/config/constants";
import { AdminShell } from "../../app/AdminShell";
import { sampleDashboard } from "./testFixtures";
import { OpsDashboardPage } from "./OpsDashboardPage";

function renderPage({
  accountName = "管理员",
  accountBalanceYuan = "9.00",
  accountAvatarUrl = null,
  onRequireLogin,
}: {
  accountName?: string | null;
  accountBalanceYuan?: string | null;
  accountAvatarUrl?: string | null;
  onRequireLogin?: ReturnType<typeof vi.fn>;
} = {}) {
  return render(
    <OpsDashboardPage
      accountName={accountName}
      accountBalanceYuan={accountBalanceYuan}
      accountAvatarUrl={accountAvatarUrl}
      onOpenProviderSettings={vi.fn()}
      onRequireLogin={onRequireLogin}
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

    expect(await findByText("用户数")).toBeTruthy();
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

  it("renders a WeChat login CTA in the permission panel when onRequireLogin is provided", async () => {
    server.use(
      http.get(`${API_BASE_URL}/api/v1/ops/dashboard`, () =>
        HttpResponse.json({ detail: "需要管理员权限" }, { status: 403 }),
      ),
    );

    const onRequireLogin = vi.fn();
    const { findByText, getByRole } = renderPage({ onRequireLogin });

    expect(await findByText("需要管理员权限")).toBeTruthy();
    const cta = getByRole("button", { name: "微信登录" });
    expect(cta).toBeTruthy();

    fireEvent.click(cta);
    expect(onRequireLogin).toHaveBeenCalledOnce();
  });

  it("does not render a login CTA when onRequireLogin is absent", async () => {
    server.use(
      http.get(`${API_BASE_URL}/api/v1/ops/dashboard`, () =>
        HttpResponse.json({ detail: "需要管理员权限" }, { status: 403 }),
      ),
    );

    const { findByText, queryByRole } = renderPage();

    expect(await findByText("需要管理员权限")).toBeTruthy();
    expect(queryByRole("button", { name: "微信登录" })).toBeNull();
  });

  it("does not render dashboard nav item while already on dashboard", async () => {
    server.use(
      http.get(`${API_BASE_URL}/api/v1/ops/dashboard`, () =>
        HttpResponse.json(sampleDashboard()),
      ),
    );

    const { findAllByText, queryByText } = renderPage();
    await findAllByText("运营总览");

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

  it("renders admin-only nav destinations without user shell navigation", async () => {
    server.use(
      http.get(`${API_BASE_URL}/api/v1/ops/dashboard`, () =>
        HttpResponse.json(sampleDashboard()),
      ),
    );

    const { findAllByText, getAllByText, queryByText } = renderPage();

    // Page title plus both drawer copies of the nav item.
    await findAllByText("运营总览");
    expect(getAllByText("运营总览").length).toBeGreaterThanOrEqual(3);
    for (const label of ["账户", "任务审计", "平台状态"]) {
      expect(getAllByText(label).length).toBeGreaterThanOrEqual(2);
    }
    for (const label of ["工作台", "任务历史", "模板", "设置"]) {
      expect(queryByText(label)).toBeNull();
    }
  });

  it("switches between admin sections and renders placeholder content", async () => {
    server.use(
      http.get(`${API_BASE_URL}/api/v1/ops/dashboard`, () =>
        HttpResponse.json(sampleDashboard()),
      ),
    );

    const { findByText, getAllByRole, queryByText } = renderPage();
    await findByText("用户数");

    fireEvent.click(getAllByRole("button", { name: "账户" })[0]);
    expect(await findByText("账户与充值视图将在 #232 落地。")).toBeTruthy();
    expect(queryByText("用户数")).toBeNull();

    fireEvent.click(getAllByRole("button", { name: "任务审计" })[0]);
    expect(await findByText("全站任务审计视图尚未落地。")).toBeTruthy();

    fireEvent.click(getAllByRole("button", { name: "平台状态" })[0]);
    expect(await findByText("平台服务与依赖健康状态视图尚未落地。")).toBeTruthy();

    fireEvent.click(getAllByRole("button", { name: "运营总览" })[0]);
    expect(await findByText("用户数")).toBeTruthy();
  });

  it("renders the admin account identity and balance in the sidebar", async () => {
    server.use(
      http.get(`${API_BASE_URL}/api/v1/ops/dashboard`, () =>
        HttpResponse.json(sampleDashboard()),
      ),
    );

    const { findByText, getAllByText, queryByText } = renderPage({
      accountName: "运营管理员",
      accountBalanceYuan: "3.50",
      accountAvatarUrl: null,
    });

    await findByText("用户数");
    expect(getAllByText("运营管理员")[0]).toBeTruthy();
    expect(getAllByText("余额 ¥ 3.50")[0]).toBeTruthy();
    expect(queryByText("ADMIN ACCESS")).toBeNull();
    expect(queryByText("管理员")).toBeNull();
  });

  it("keeps the neutral admin fallback when no account data is provided", async () => {
    server.use(
      http.get(`${API_BASE_URL}/api/v1/ops/dashboard`, () =>
        HttpResponse.json(sampleDashboard()),
      ),
    );

    const { findByText, getAllByText } = renderPage({
      accountName: null,
      accountBalanceYuan: null,
      accountAvatarUrl: null,
    });

    await findByText("用户数");
    expect(getAllByText("管理员")[0]).toBeTruthy();
    expect(getAllByText("ADMIN ACCESS")[0]).toBeTruthy();
  });
});

describe("AdminShell login CTA from /admin permission panel", () => {
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
    sessionStorage.clear();
  });

  it("persists the post-login return path and opens the WeChat login dialog when the CTA is clicked", async () => {
    server.use(
      http.get(`${API_BASE_URL}/api/v1/ops/dashboard`, () =>
        HttpResponse.json({ detail: "需要管理员权限" }, { status: 403 }),
      ),
      http.get(`${API_BASE_URL}/api/v1/account/me`, () =>
        HttpResponse.json({ detail: "请先使用微信登录" }, { status: 401 }),
      ),
    );

    const { findByText, findByRole, queryByText } = render(
      <MemoryRouter initialEntries={["/admin"]}>
        <AdminShell />
      </MemoryRouter>,
    );

    expect(await findByText("需要管理员权限")).toBeTruthy();
    expect(queryByText("微信登录后继续")).toBeNull();
    expect(sessionStorage.getItem("metaview:post-login-path")).toBeNull();

    fireEvent.click(await findByRole("button", { name: "微信登录" }));

    expect(await findByText("微信登录后继续")).toBeTruthy();
    expect(sessionStorage.getItem("metaview:post-login-path")).toBe("/admin");
  });

  it("passes the logged-in account identity and balance into the admin sidebar", async () => {
    server.use(
      http.get(`${API_BASE_URL}/api/v1/ops/dashboard`, () =>
        HttpResponse.json(sampleDashboard()),
      ),
      http.get(`${API_BASE_URL}/api/v1/account/me`, () =>
        HttpResponse.json({
          user_id: "admin_1",
          display_name: "运营管理员",
          avatar_url: null,
          login_provider: "wechat",
          status: "enabled",
          role: "admin",
          balance_cents: 350,
          balance_yuan: "3.50",
          recharge_min_cents: 500,
          payment_enabled: false,
          wechat_login_enabled: true,
        }),
      ),
    );

    const { findAllByText } = render(
      <MemoryRouter initialEntries={["/admin"]}>
        <AdminShell />
      </MemoryRouter>,
    );

    expect((await findAllByText("运营管理员")).length).toBeGreaterThanOrEqual(1);
    expect((await findAllByText("余额 ¥ 3.50")).length).toBeGreaterThanOrEqual(1);
  });
});
