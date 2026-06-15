import { useEffect, useMemo, useState } from "react";

import { fetchRechargeOrder } from "../features/account/api/accountApi";

type PollStatus = "loading" | "pending" | "success" | "failed" | "error";

const PAYMENT_POLL_INTERVAL_MS = 2500;
const PAYMENT_POLL_MAX_ATTEMPTS = 80;
export const OPEN_ACCOUNT_PANEL_FLAG = "metaview:openAccountPanel";

function titleForStatus(status: PollStatus) {
  if (status === "success") return "支付成功";
  if (status === "pending") return "等待确认";
  if (status === "failed") return "支付未完成";
  if (status === "error") return "无法查询支付结果";
  return "查询支付结果";
}

function bodyForStatus(status: PollStatus, orderId: string) {
  if (status === "success") return "本次充值已完成，订单状态已更新。";
  if (status === "pending") return `订单 ${orderId} 正在等待支付平台回调确认。`;
  if (status === "failed") return "支付未完成、已失效或确认超时，请返回充值记录核对订单状态。";
  if (status === "error") return "请检查回跳链接中的订单号，或返回账户面板查看最近充值记录。";
  return "正在查询充值订单状态，请稍候。";
}

function returnHome() {
  window.location.href = "/";
}

function openRechargeRecords() {
  window.sessionStorage.setItem(OPEN_ACCOUNT_PANEL_FLAG, "1");
  window.location.href = "/";
}

export function PaymentResultPage() {
  const searchParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const orderId = useMemo(
    () => searchParams.get("order_id") ?? searchParams.get("out_trade_no") ?? "",
    [searchParams],
  );

  const [status, setStatus] = useState<PollStatus>(() => (orderId ? "loading" : "error"));
  const [error, setError] = useState<string>(() =>
    orderId ? "" : "支付回跳缺少订单号参数（order_id / out_trade_no）。",
  );

  useEffect(() => {
    if (!orderId) return;

    let cancelled = false;
    let attempts = 0;
    let timer: number | undefined;

    const stop = () => {
      if (timer != null) {
        window.clearInterval(timer);
        timer = undefined;
      }
    };

    const check = async () => {
      try {
        const order = await fetchRechargeOrder(orderId);
        if (cancelled) return;

        if (order.status === "paid") {
          setStatus("success");
          stop();
          return;
        }
        if (order.status === "closed") {
          setStatus("failed");
          stop();
          return;
        }

        attempts += 1;
        if (attempts >= PAYMENT_POLL_MAX_ATTEMPTS) {
          setStatus("failed");
          setError("支付确认超时，请返回充值记录确认是否到账。");
          stop();
          return;
        }

        setStatus("pending");
      } catch (err) {
        if (cancelled) return;
        setStatus("error");
        setError(err instanceof Error ? err.message : "订单查询失败");
        stop();
      }
    };

    void check();
    timer = window.setInterval(check, PAYMENT_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      stop();
    };
  }, [orderId]);

  return (
    <main className="mv-root mv-payment-result">
      <section className={`mv-payment-result__card mv-payment-result__card--${status}`}>
        <div className="mv-payment-result__status" aria-hidden="true">
          {status === "success" ? "✓" : status === "failed" || status === "error" ? "!" : "…"}
        </div>
        <h1>{titleForStatus(status)}</h1>
        <p>{bodyForStatus(status, orderId)}</p>
        {(status === "error" || error) && status !== "success" && (
          <div className="mv-payment-result__error">{error}</div>
        )}
        <div className="mv-payment-result__actions">
          <button type="button" className="mv-chip mv-chip-primary" onClick={returnHome}>
            返回工作台
          </button>
          <button type="button" className="mv-chip" onClick={openRechargeRecords}>
            查看充值记录
          </button>
        </div>
      </section>
    </main>
  );
}
