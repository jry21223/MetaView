import {
  cleanup,
  fireEvent,
  render,
  waitFor,
  within,
} from "@testing-library/react";
import React from "react";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { server } from "../../mocks/server";
import { API_BASE_URL } from "../../shared/config/constants";
import { AdminShell } from "../../app/AdminShell";
import { sampleDashboard } from "./testFixtures";
import { OpsDashboardPage } from "./OpsDashboardPage";
import type { OpsAccountsResponse } from "../../features/ops-dashboard";

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

function sampleAccounts(): OpsAccountsResponse {
  const items = Array.from({ length: 25 }, (_, index) => ({
    user_id: `user_${String(index + 1).padStart(3, "0")}`,
    display_name: index === 0 ? "王小甲" : `账户 ${index + 1}`,
    avatar_url: null,
    login_provider: "wechat",
    status: index === 24 ? "disabled" : "enabled",
    role: index === 1 ? "admin" : "user",
    balance_yuan: (index * 1.5).toFixed(2),
    created_at: `2026-06-${String(8 - (index % 7)).padStart(2, "0")}T03:00:00+00:00`,
    last_active_at: null,
  }));
  return { items, total: items.length, page: 1, page_size: 20 };
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

    const { findByText, getByText, getByRole } = renderPage();

    expect(await findByText("用户数")).toBeTruthy();
    expect(getByText("¥ 15.00")).toBeTruthy();
    expect(getByRole("img", { name: "逐日生成任务趋势" })).toBeTruthy();
    expect(getByRole("img", { name: "逐日充值收入趋势" })).toBeTruthy();
    expect(getByText("矩阵特征值")).toBeTruthy();
    expect(getByText("数学")).toBeTruthy();
    expect(getByRole("region", { name: "生成、资金与全站存量" })).toBeTruthy();
    expect(getByText("¥ 4.25")).toBeTruthy();
    expect(getByText("¥ 2.25")).toBeTruthy();
    expect(getByText("¥ 11.50")).toBeTruthy();
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
    expect(
      container.querySelector("article.mv-ops-record[data-status='failed']"),
    ).toBeTruthy();

    fireEvent.click(getByRole("tab", { name: "订单" }));
    await waitFor(() =>
      expect(
        container.querySelector("article.mv-ops-record[data-status='pending']"),
      ).toBeTruthy(),
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
    await waitFor(() => expect(seenUrls.at(-1)).toContain("window_days=90"), {
      timeout: 10_000,
    });
  }, 15_000);

  it("keeps the global overview and account query without placeholder destinations", async () => {
    server.use(
      http.get(`${API_BASE_URL}/api/v1/ops/dashboard`, () =>
        HttpResponse.json(sampleDashboard()),
      ),
    );

    const { findByText, getByRole, queryByText } = renderPage();
    await findByText("用户数");
    expect(getByRole("navigation", { name: "运营导航" })).toBeTruthy();
    expect(getByRole("button", { name: "账户", exact: true })).toBeTruthy();
    for (const label of [
      "工作台",
      "任务历史",
      "模板",
      "设置",
      "任务审计",
      "平台状态",
    ]) {
      expect(queryByText(label)).toBeNull();
    }
  });

  it("opens account lookup over the global overview and returns to it", async () => {
    server.use(
      http.get(`${API_BASE_URL}/api/v1/ops/dashboard`, () =>
        HttpResponse.json(sampleDashboard()),
      ),
      http.get(`${API_BASE_URL}/api/v1/ops/accounts`, () =>
        HttpResponse.json(sampleAccounts()),
      ),
    );

    const { findByText, getByRole, getByText, queryByRole } = renderPage();
    await findByText("用户数");

    fireEvent.click(getByRole("button", { name: "账户", exact: true }));
    expect(await findByText("王小甲")).toBeTruthy();
    expect(getByText("用户数")).toBeTruthy();
    fireEvent.click(getByRole("button", { name: "关闭账户查询" }));
    await waitFor(() => expect(queryByRole("dialog")).toBeNull());
    expect(getByText("用户数")).toBeTruthy();
  }, 20_000);

  it("defers the accounts request until the 账户 section opens", async () => {
    const seenUrls: string[] = [];
    server.use(
      http.get(`${API_BASE_URL}/api/v1/ops/dashboard`, () =>
        HttpResponse.json(sampleDashboard()),
      ),
      http.get(`${API_BASE_URL}/api/v1/ops/accounts`, ({ request }) => {
        seenUrls.push(request.url);
        return HttpResponse.json(sampleAccounts());
      }),
    );

    const { findByText, getAllByRole, findAllByText } = renderPage();
    await findByText("用户数");
    expect(seenUrls).toHaveLength(0);

    fireEvent.click(getAllByRole("button", { name: "账户" })[0]);
    await findAllByText("王小甲");

    expect(seenUrls).toHaveLength(1);
    expect(seenUrls[0]).toContain("page=1");
    expect(seenUrls[0]).toContain("page_size=20");
  }, 20_000);

  it("searches accounts by display name or user ID on Enter", async () => {
    const requestedSearches: Array<string | null> = [];
    server.use(
      http.get(`${API_BASE_URL}/api/v1/ops/dashboard`, () =>
        HttpResponse.json(sampleDashboard()),
      ),
      http.get(`${API_BASE_URL}/api/v1/ops/accounts`, ({ request }) => {
        const url = new URL(request.url);
        const search = url.searchParams.get("search");
        requestedSearches.push(search);
        const items = search
          ? sampleAccounts().items.filter(
              (account) =>
                account.display_name.includes(search) ||
                account.user_id.includes(search),
            )
          : sampleAccounts().items;
        return HttpResponse.json({
          items: items.slice(0, 20),
          total: items.length,
          page: 1,
          page_size: 20,
        });
      }),
    );

    const { findByText, getAllByRole, getByRole, queryByText } = renderPage();
    await findByText("用户数");
    fireEvent.click(getAllByRole("button", { name: "账户" })[0]);
    await findByText("账户 2");

    const input = getByRole("textbox", { name: "搜索账户" });
    fireEvent.change(input, { target: { value: "王小" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    await waitFor(() => expect(requestedSearches.at(-1)).toBe("王小"), {
      timeout: 10_000,
    });
    expect(await findByText("王小甲")).toBeTruthy();
    await waitFor(() => expect(queryByText("账户 2")).toBeNull(), {
      timeout: 10_000,
    });
  }, 20_000);

  it("requests the next accounts page from the grid pagination", async () => {
    const requestedPages: string[] = [];
    server.use(
      http.get(`${API_BASE_URL}/api/v1/ops/dashboard`, () =>
        HttpResponse.json(sampleDashboard()),
      ),
      http.get(`${API_BASE_URL}/api/v1/ops/accounts`, ({ request }) => {
        const url = new URL(request.url);
        requestedPages.push(url.searchParams.get("page") ?? "1");
        return HttpResponse.json(sampleAccounts());
      }),
    );

    const { findByText, getAllByRole, getByRole } = renderPage();
    await findByText("用户数");
    fireEvent.click(getAllByRole("button", { name: "账户" })[0]);
    await findByText("王小甲");

    fireEvent.click(getByRole("button", { name: "下一页" }));
    await waitFor(() => expect(requestedPages).toContain("2"), {
      timeout: 10_000,
    });
  }, 20_000);

  it("shows the empty state when the accounts API returns no accounts", async () => {
    server.use(
      http.get(`${API_BASE_URL}/api/v1/ops/dashboard`, () =>
        HttpResponse.json(sampleDashboard()),
      ),
      http.get(`${API_BASE_URL}/api/v1/ops/accounts`, () =>
        HttpResponse.json({ items: [], total: 0, page: 1, page_size: 20 }),
      ),
    );

    const { findByText, getAllByRole } = renderPage();
    await findByText("用户数");
    fireEvent.click(getAllByRole("button", { name: "账户" })[0]);

    expect(await findByText("暂无账户记录")).toBeTruthy();
  }, 20_000);

  it("shows an error state when the accounts API fails", async () => {
    server.use(
      http.get(`${API_BASE_URL}/api/v1/ops/dashboard`, () =>
        HttpResponse.json(sampleDashboard()),
      ),
      http.get(`${API_BASE_URL}/api/v1/ops/accounts`, () =>
        HttpResponse.json({ detail: "database unavailable" }, { status: 500 }),
      ),
    );

    const { findByText, getAllByRole, getByText } = renderPage();
    await findByText("用户数");
    fireEvent.click(getAllByRole("button", { name: "账户" })[0]);

    expect(await findByText("加载失败")).toBeTruthy();
    await waitFor(
      () => expect(getByText("database unavailable")).toBeTruthy(),
      {
        timeout: 10_000,
      },
    );
  }, 20_000);

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

  it("preserves all window statuses and independent parent/leaf health states", async () => {
    const dashboard = sampleDashboard();
    server.use(
      http.get(`${API_BASE_URL}/api/v1/ops/dashboard`, () =>
        HttpResponse.json(dashboard),
      ),
    );
    const { findByText, getByRole, container } = renderPage();
    await findByText("用户数");
    const statuses = getByRole("group", { name: "窗口任务状态分布" });
    for (const item of dashboard.status_distribution) {
      expect(
        statuses.querySelector(`[data-status='${item.id}']`)?.textContent,
      ).toContain(String(item.count));
    }
    expect(
      container
        .querySelector("[data-health-id='billing']")
        ?.getAttribute("data-health-status"),
    ).toBe("ok");
    fireEvent.click(getByRole("button", { name: "全部依据" }));
    const dialog = getByRole("dialog");
    expect(dialog.querySelectorAll("[data-health-id]")).toHaveLength(11);
    expect(
      dialog
        .querySelector("[data-health-id='billing']")
        ?.getAttribute("data-health-status"),
    ).toBe("ok");
    expect(
      dialog
        .querySelector("[data-health-id='billing-refund']")
        ?.getAttribute("data-health-status"),
    ).toBe("warn");
    expect(within(dialog).getByText("¥ 2.25")).toBeTruthy();
    expect(
      within(dialog).getAllByText("记录 · neutral").length,
    ).toBeGreaterThan(0);
  });

  it("filters loaded records without changing window aggregates and expands raw details", async () => {
    const dashboard = sampleDashboard();
    dashboard.kpis.find((item) => item.id === "runs")!.value = "8";
    dashboard.status_distribution.find((item) => item.id === "failed")!.count =
      6;
    dashboard.run_trend[1] = {
      date: "2026-06-07",
      total: 6,
      succeeded: 0,
      failed: 6,
      in_flight: 0,
    };
    dashboard.recent_runs[0].status = "failed";
    dashboard.recent_runs[0].error = "计划生成未通过质量门";
    server.use(
      http.get(`${API_BASE_URL}/api/v1/ops/dashboard`, () =>
        HttpResponse.json(dashboard),
      ),
    );
    const { findByText, getByRole, getByText, container } = renderPage();
    await findByText("矩阵特征值");
    fireEvent.click(getByRole("button", { name: "核查最近失败" }));
    expect(getByText("已载 1 条 · 最多 50 条 · 匹配 1 条")).toBeTruthy();
    expect(
      container.querySelector(".mv-ops-window-status [data-status='failed']")
        ?.textContent,
    ).toContain("6");
    fireEvent.click(getByRole("button", { name: "核查", exact: true }));
    expect(await findByText("计划生成未通过质量门")).toBeTruthy();
    expect(getByText("讲解矩阵")).toBeTruthy();
    expect(container.querySelectorAll("a[href^='/run/']")).toHaveLength(0);
  });

  it("keeps old response scope and values when a requested new window fails", async () => {
    let requestCount = 0;
    server.use(
      http.get(`${API_BASE_URL}/api/v1/ops/dashboard`, () => {
        requestCount += 1;
        return requestCount === 1
          ? HttpResponse.json(sampleDashboard())
          : HttpResponse.json({ detail: "offline" }, { status: 500 });
      }),
    );
    const { findByText, getByRole, getByText } = renderPage();
    await findByText("矩阵特征值");
    fireEvent.click(getByRole("button", { name: "90 天" }));
    expect(
      await findByText("刷新失败，当前仍显示上次成功数据：offline"),
    ).toBeTruthy();
    expect(getByText("近 30 天 · UTC 自然日")).toBeTruthy();
    expect(getByText("¥ 4.25")).toBeTruthy();
    expect(getByText("矩阵特征值")).toBeTruthy();
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

    expect((await findAllByText("运营管理员")).length).toBeGreaterThanOrEqual(
      1,
    );
    expect((await findAllByText("余额 ¥ 3.50")).length).toBeGreaterThanOrEqual(
      1,
    );
  });
});
