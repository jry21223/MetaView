import { useEffect, useMemo, useRef, useState } from "react";
import { RECHARGE_USAGE_ESTIMATE } from "../../../shared/config/constants";
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
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function estimateRuns(amountYuan: string): number | null {
  const parsed = Number(amountYuan);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.max(1, Math.round(parsed * RECHARGE_USAGE_ESTIMATE.RUNS_PER_YUAN));
}

function getFocusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => element.tabIndex >= 0 && !element.hasAttribute("hidden"),
  );
}

function getCheckoutUrl(order: RechargeOrder): string | null {
  return order.code_url ?? order.checkout_url ?? order.payment_url ?? null;
}

export function RechargeModal({ account, onRefreshAccount, onClose }: RechargeModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const [amount, setAmount] = useState("10");
  const [orders, setOrders] = useState<RechargeOrder[]>([]);
  const [activeOrder, setActiveOrder] = useState<RechargeOrder | null>(null);
  const [loading, setLoading] = useState(false);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const minYuan = useMemo(
    () => ((account?.recharge_min_cents ?? 500) / 100).toFixed(0),
    [account?.recharge_min_cents],
  );
  const currentEstimate = estimateRuns(amount);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previousActive = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.classList.add("mv-modal-open");
    modalRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const modal = modalRef.current;
      if (!modal) return;
      const focusable = getFocusableElements(modal);
      if (focusable.length === 0) {
        event.preventDefault();
        modal.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey) {
        if (active === first || !modal.contains(active)) {
          event.preventDefault();
          last.focus();
        }
        return;
      }
      if (active === last || !modal.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.classList.remove("mv-modal-open");
      previousActive?.focus();
    };
  }, []);

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
      const checkoutUrl = getCheckoutUrl(order);
      if (!checkoutUrl) {
        throw new Error("充值订单未返回支付链接");
      }
      window.location.href = checkoutUrl;
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
      <div
        ref={modalRef}
        className="mv-account-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mv-account-modal-title"
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mv-account-modal__head">
          <div>
            <div className="mv-account-modal__title" id="mv-account-modal-title">
              账户与充值
            </div>
            <div className="mv-account-modal__sub">
              易支付充值，最低 {minYuan} 元；余额按基础生成消耗
            </div>
          </div>
          <button
            className="mv-icon-btn"
            onClick={onClose}
            style={{ fontSize: 18 }}
            aria-label="关闭账户与充值"
          >
            ×
          </button>
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
            title={
              account?.wechat_login_enabled
                ? "使用微信扫码登录"
                : "缺少微信开放平台网站应用配置"
            }
          >
            微信登录
          </button>
          <button type="button" className="mv-chip" onClick={logout}>
            退出当前账户
          </button>
        </div>
        {!account?.wechat_login_enabled && (
          <div className="mv-account-note">
            微信登录尚未配置。需要微信开放平台网站应用 AppID/AppSecret、微信登录权限和授权回调域名；
            后端填写 METAVIEW_WECHAT_LOGIN_APPID、METAVIEW_WECHAT_LOGIN_SECRET、
            METAVIEW_WECHAT_LOGIN_REDIRECT_URI 和 METAVIEW_WECHAT_LOGIN_SUCCESS_URL。
          </div>
        )}

        <section className="mv-recharge-box">
          <div className="mv-recharge-presets">
            {PRESETS.map((value) => (
              <button
                key={value}
                type="button"
                className={`mv-chip mv-recharge-preset${
                  amount === value ? " mv-chip-primary" : ""
                }`}
                onClick={() => setAmount(value)}
              >
                <span>¥{value}</span>
                <small>约 {estimateRuns(value)} 次</small>
              </button>
            ))}
          </div>

          <div className="mv-recharge-custom">
            <span>自定义</span>
            <input
              className="mv-text-input"
              aria-label="充值金额"
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
          {currentEstimate && (
            <div className="mv-recharge-estimate">
              当前约可支持 {currentEstimate} 次{RECHARGE_USAGE_ESTIMATE.UNIT_LABEL}。按现阶段 1 元约
              {RECHARGE_USAGE_ESTIMATE.RUNS_PER_YUAN} 次估算，实际以平台扣费规则为准。
            </div>
          )}

          {!account?.payment_enabled && (
            <div className="mv-account-note">
              易支付尚未配置。请配置：METAVIEW_EPAY_PID、METAVIEW_EPAY_KEY、
              METAVIEW_EPAY_API_BASE + METAVIEW_EPAY_SUBMIT_PATH（或 METAVIEW_EPAY_SUBMIT_URL）、
              METAVIEW_EPAY_NOTIFY_URL、METAVIEW_EPAY_RETURN_URL（均为必填），
              才能创建真实订单。
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
