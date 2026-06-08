import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import React from "react";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { server } from "../../mocks/server";
import { API_BASE_URL } from "../../shared/config/constants";
import { sampleDashboard } from "./testFixtures";
import { OpsDashboardPage } from "./OpsDashboardPage";

function renderPage() {
  return render(
    <OpsDashboardPage
      accountName="管理员"
      accountBalanceYuan="9.00"
      accountAvatarUrl={null}
      onNavigate={vi.fn()}
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

    const { findByText, getByText } = renderPage();

    expect(await findByText("全局运营")).toBeTruthy();
    expect(getByText("用户数")).toBeTruthy();
    expect(getByText("¥ 15.00")).toBeTruthy();
    expect(getByText("任务趋势")).toBeTruthy();
    expect(getByText("收入趋势")).toBeTruthy();
    expect(getByText("矩阵特征值")).toBeTruthy();
    expect(getByText(/生成任务 · 3/)).toBeTruthy();
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
    await waitFor(() => expect(seenUrls).toHaveLength(2));

    fireEvent.click(getByRole("button", { name: "90 天" }));
    await waitFor(() => expect(seenUrls.at(-1)).toContain("window_days=90"));
  });
});
