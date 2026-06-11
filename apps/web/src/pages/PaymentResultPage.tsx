import { useEffect, useMemo, useState } from "react";

import { fetchRechargeOrder } from "../features/account/api/accountApi";

type PollStatus = "loading" | "pending" | "success" | "failed" | "error";

export function PaymentResultPage() {
  const searchParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const orderId = useMemo(
    () => searchParams.get("order_id") ?? searchParams.get("out_trade_no") ?? "",
    [searchParams],
  );

  const [status, setStatus] = useState<PollStatus>(() => (orderId ? "loading" : "error"));
  const [error, setError] = useState<string>(() =>
    orderId ? "" : "支付回调缺少订单号参数（order_id / out_trade_no）",
  );

  useEffect(() => {
    if (!orderId) {
      return;
    }

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 80;

    const check = async () => {
      try {
        const order = await fetchRechargeOrder(orderId);
        if (cancelled) return;

        if (order.status === "paid") {
          setStatus("success");
          return;
        }
        if (order.status === "closed") {
          setStatus("failed");
          return;
        }
        setStatus("pending");

        attempts += 1;
        if (attempts >= maxAttempts) {
          setStatus("failed");
          setError("支付超时，请返回订单列表确认是否已到账。");
        }
      } catch (err) {
        if (cancelled) return;
        setStatus("error");
        setError(err instanceof Error ? err.message : "订单查询失败");
      }
    };

    check();
    const timer = window.setInterval(check, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [orderId]);

  const title =
    status === "success"
      ? "支付成功"
      : status === "pending"
        ? "支付中"
        : status === "failed"
          ? "支付失败"
          : "支付结果查询中";

  return (
    <main
      className="mv-root"
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "24px",
        boxSizing: "border-box",
      }}
    >
      <section
        style={{
          background: "var(--mv-surface)",
          border: "1px solid var(--mv-line)",
          borderRadius: 12,
          padding: 24,
          width: "min(92vw, 560px)",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <h1 style={{ margin: 0, fontSize: 22 }}>{title}</h1>
        <p style={{ margin: 0 }}>
          {status === "success"
            ? "本次充值已完成，订单状态已更新。"
            : status === "pending"
              ? `订单 ${orderId} 正在等待支付回调确认。`
              : status === "failed"
                ? "支付未完成或已失效，请重新发起充值。"
                : "正在查询充值订单状态，请稍候。"}
        </p>
        {status === "error" && <div style={{ color: "var(--mv-danger)" }}>{error}</div>}
        <button
          type="button"
          className="mv-chip"
          onClick={() => {
            window.location.href = "/";
          }}
        >
          返回首页
        </button>
      </section>
    </main>
  );
}
