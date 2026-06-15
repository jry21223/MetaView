import { cleanup, render, waitFor } from "@testing-library/react";
import React from "react";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it } from "vitest";

import { server } from "../mocks/server";
import { API_BASE_URL } from "../shared/config/constants";
import { PaymentResultPage } from "./PaymentResultPage";

describe("PaymentResultPage", () => {
  afterEach(() => {
    cleanup();
    window.history.pushState({}, "", "/");
  });

  it("shows an actionable error when the payment callback has no order id", () => {
    window.history.pushState({}, "", "/payment/result");

    const { getByText } = render(<PaymentResultPage />);

    expect(getByText("无法查询支付结果")).toBeTruthy();
    expect(getByText(/缺少订单号参数/)).toBeTruthy();
    expect(getByText("返回工作台")).toBeTruthy();
    expect(getByText("查看充值记录")).toBeTruthy();
  });

  it("polls the recharge order and renders success", async () => {
    server.use(
      http.get(`${API_BASE_URL}/api/v1/account/recharge-orders/order-1`, () =>
        HttpResponse.json({
          order_id: "order-1",
          amount_cents: 500,
          amount_yuan: "5.00",
          status: "paid",
          channel: "epay",
          provider_order_id: null,
          code_url: null,
          created_at: "now",
          paid_at: "now",
        }),
      ),
    );
    window.history.pushState({}, "", "/payment/result?order_id=order-1");

    const { getByText } = render(<PaymentResultPage />);

    await waitFor(() => expect(getByText("支付成功")).toBeTruthy());
    expect(getByText("本次充值已完成，订单状态已更新。")).toBeTruthy();
  });
});
