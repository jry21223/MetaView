import React, { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import type { AccountMe, RechargeOrder } from "../api/accountApi";
import {
  createRechargeOrder,
  fetchRechargeOrder,
  fetchRechargeOrders,
  fetchWeChatLoginUrl,
  logoutAccount,
} from "../api/accountApi";

interface RechargeModalProps {
  account: AccountMe | null;
  onRefreshAccount: () => Promise<void> | void;
  onClose: () => void;
}

const PRESETS = ["5", "10", "30", "50", "100"];

export function RechargeModal({ account, onRefreshAccount, onClose }: RechargeModalProps) {
  const [amount, setAmount] = useState("10");
  const [orders, setOrders] = useState<RechargeOrder[]>([]);
  const [activeOrder, setActiveOrder] = useState<RechargeOrder | null>(null);
  const [qrSvg, setQrSvg] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const minYuan = useMemo(
    () => ((account?.recharge_min_cents ?? 500) / 100).toFixed(0),
    [account?.recharge_min_cents],
  );

  useEffect(() => {
    let cancelled = false;
    fetchRechargeOrders()
      .then((list) => {
        if (!cancelled) setOrders(list);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "充值记录加载失败");
      })
      .finally(() => {
        if (!cancelled) setOrdersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!activeOrder?.code_url) {
      return;
    }
    QRCode.toString(activeOrder.code_url, {
      type: "svg",
      width: 180,
      margin: 1,
      color: { dark: "#0a0c10", light: "#ffffff" },
    }).then((svg) => {
      if (!cancelled) setQrSvg(svg);
    });
    return () => {
      cancelled = true;
    };
  }, [activeOrder?.code_url]);

  useEffect(() => {
    if (!activeOrder || activeOrder.status !== "pending") return;
    const timer = window.setInterval(async () => {
      try {
        const next = await fetchRechargeOrder(activeOrder.order_id);
        setActiveOrder(next);
        if (next.status === "paid") {
          await onRefreshAccount();
          const list = await fetchRechargeOrders();
          setOrders(list);
        }
      } catch {
        // Keep polling; transient network errors are common during local dev.
      }
    }, 2500);
    return () => window.clearInterval(timer);
  }, [activeOrder, onRefreshAccount]);

  const submit = async () => {
    setError(null);
    setLoading(true);
    try {
      const order = await createRechargeOrder(amount.trim());
      setActiveOrder(order);
      setOrders((prev) => [order, ...prev.filter((item) => item.order_id !== order.order_id)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建充值订单失败");
    } finally {
      setLoading(false);
    }
  };

  const loginWithWeChat = async () => {
    setError(null);
    try {
      window.location.href = await fetchWeChatLoginUrl();
    } catch (err) {
      setError(err instanceof Error ? err.message : "微信登录暂不可用");
    }
  };

  const logout = async () => {
    setError(null);
    try {
      await logoutAccount();
      await onRefreshAccount();
    } catch (err) {
      setError(err instanceof Error ? err.message : "退出登录失败");
    }
  };

  return (
    <div className="mv-account-modal-backdrop" onMouseDown={onClose}>
      <div className="mv-account-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mv-account-modal__head">
          <div>
            <div className="mv-account-modal__title">账户与充值</div>
            <div className="mv-account-modal__sub">微信支付 Native 充值，最低 {minYuan} 元</div>
          </div>
          <button className="mv-icon-btn" onClick={onClose} style={{ fontSize: 18 }}>×</button>
        </div>

        <section className="mv-account-card">
          <div>
            <div className="mv-account-card__label">
              {account?.login_provider === "wechat" ? "微信账户" : "游客账户"}
            </div>
            <div className="mv-account-card__name">{account?.display_name ?? "加载中"}</div>
          </div>
          <div className="mv-account-card__balance">
            <span>余额</span>
            <strong>¥ {account?.balance_yuan ?? "0.00"}</strong>
          </div>
        </section>

        <div className="mv-account-actions">
          <button
            type="button"
            className="mv-chip"
            onClick={loginWithWeChat}
            disabled={!account?.wechat_login_enabled}
            title={account?.wechat_login_enabled ? "使用微信扫码登录" : "后端未配置微信登录"}
          >
            微信登录
          </button>
          <button type="button" className="mv-chip" onClick={logout}>
            退出当前账户
          </button>
        </div>

        <section className="mv-recharge-box">
          <div className="mv-recharge-presets">
            {PRESETS.map((value) => (
              <button
                key={value}
                type="button"
                className={`mv-chip${amount === value ? " mv-chip-primary" : ""}`}
                onClick={() => setAmount(value)}
              >
                ¥{value}
              </button>
            ))}
          </div>

          <div className="mv-recharge-custom">
            <span>自定义</span>
            <input
              className="mv-text-input"
              type="number"
              min={minYuan}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <button
              className="mv-chip mv-chip-primary"
              onClick={submit}
              disabled={loading || !account?.payment_enabled}
            >
              {loading ? "创建中..." : "充值"}
            </button>
          </div>

          {!account?.payment_enabled && (
            <div className="mv-account-note">
              微信支付尚未配置。需要设置商户号、AppID、商户私钥、证书序列号、APIv3 Key
              和支付回调地址后才能创建真实订单。
            </div>
          )}
        </section>

        {activeOrder && (
          <section className="mv-pay-panel">
            <div>
              <div className="mv-account-card__label">当前订单</div>
              <div className="mv-pay-panel__amount">¥ {activeOrder.amount_yuan}</div>
              <div className="mv-account-note">状态：{activeOrder.status}</div>
            </div>
            {qrSvg && activeOrder.status === "pending" && (
              <div className="mv-pay-panel__qr" dangerouslySetInnerHTML={{ __html: qrSvg }} />
            )}
            {activeOrder.status === "paid" && <div className="mv-pay-panel__paid">已到账</div>}
          </section>
        )}

        {error && <div className="mv-account-error">{error}</div>}

        <section className="mv-order-list">
          <div className="mv-account-modal__sub">最近充值</div>
          {ordersLoading && <div className="mv-account-note">加载中...</div>}
          {!ordersLoading && orders.length === 0 && (
            <div className="mv-account-note">还没有充值记录。</div>
          )}
          {orders.slice(0, 5).map((order) => (
            <button
              key={order.order_id}
              className="mv-order-item"
              onClick={() => setActiveOrder(order)}
              type="button"
            >
              <span>¥ {order.amount_yuan}</span>
              <span>{order.status}</span>
            </button>
          ))}
        </section>
      </div>
    </div>
  );
}
