import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import React from "react";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";

import { server } from "../../../mocks/server";
import { API_BASE_URL } from "../../../shared/config/constants";
import type { AccountMe } from "../api/accountApi";
import { RechargeModal } from "./RechargeModal";

const BASE_ACCOUNT: AccountMe = {
  user_id: "user_1",
  display_name: "游客账户",
  avatar_url: null,
  login_provider: "guest",
  status: "enabled",
  role: "user",
  balance_cents: 0,
  balance_yuan: "0.00",
  recharge_min_cents: 500,
  payment_enabled: false,
  wechat_login_enabled: false,
};

describe("RechargeModal", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("keeps recharge disabled when payment is not configured", () => {
    server.use(
      http.get(`${API_BASE_URL}/api/v1/account/recharge-orders`, () =>
        HttpResponse.json([]),
      ),
    );
    const { getByRole, getByText } = render(
      <RechargeModal
        account={BASE_ACCOUNT}
        onRefreshAccount={() => undefined}
        onClose={() => undefined}
      />,
    );

    expect((getByRole("button", { name: "充值" }) as HTMLButtonElement).disabled).toBe(true);
    expect(getByText(/微信支付尚未配置/)).toBeTruthy();
  });

  it("creates a custom amount recharge order through the API", async () => {
    let captured: Record<string, unknown> | null = null;
    server.use(
      http.get(`${API_BASE_URL}/api/v1/account/recharge-orders`, () =>
        HttpResponse.json([]),
      ),
      http.post(`${API_BASE_URL}/api/v1/account/recharge-orders`, async ({ request }) => {
        captured = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          {
            order_id: "mv_order_1",
            amount_cents: 500,
            amount_yuan: "5.00",
            status: "pending",
            channel: "wechat_native",
            provider_order_id: null,
            code_url: "weixin://wxpay/test",
            created_at: "now",
            paid_at: null,
          },
          { status: 201 },
        );
      }),
    );

    const { getByDisplayValue, getByRole, findByText } = render(
      <RechargeModal
        account={{ ...BASE_ACCOUNT, payment_enabled: true }}
        onRefreshAccount={() => undefined}
        onClose={() => undefined}
      />,
    );
    fireEvent.change(getByDisplayValue("10"), { target: { value: "5" } });

    await act(async () => {
      fireEvent.click(getByRole("button", { name: "充值" }));
    });

    await waitFor(() => expect(captured).toEqual({ amount_yuan: "5" }));
    expect(await findByText("当前订单")).toBeTruthy();
    expect(await findByText("状态：pending")).toBeTruthy();
  });
});
