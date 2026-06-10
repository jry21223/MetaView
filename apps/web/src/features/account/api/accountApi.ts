import { API_BASE_URL, readErrorMessage } from "../../../shared/api/httpClient";

export interface AccountMe {
  user_id: string;
  display_name: string;
  avatar_url?: string | null;
  login_provider: "guest" | "wechat" | string;
  status: "enabled" | "disabled" | string;
  role: "user" | "admin" | string;
  balance_cents: number;
  balance_yuan: string;
  recharge_min_cents: number;
  payment_enabled: boolean;
  wechat_login_enabled: boolean;
}

export interface RechargeOrder {
  order_id: string;
  amount_cents: number;
  amount_yuan: string;
  status: "pending" | "paid" | "closed" | string;
  channel: string;
  code_url?: string | null;
  checkout_url?: string | null;
  payment_url?: string | null;
  provider_order_id?: string | null;
  created_at: string;
  paid_at?: string | null;
}

export async function fetchAccountMe(): Promise<AccountMe> {
  const response = await fetch(`${API_BASE_URL}/api/v1/account/me`, {
    credentials: "include",
  });
  if (!response.ok) throw new Error(await readErrorMessage(response, "Account request failed"));
  return (await response.json()) as AccountMe;
}

export async function fetchRechargeOrders(): Promise<RechargeOrder[]> {
  const response = await fetch(`${API_BASE_URL}/api/v1/account/recharge-orders`, {
    credentials: "include",
  });
  if (!response.ok) throw new Error(await readErrorMessage(response, "Orders request failed"));
  return (await response.json()) as RechargeOrder[];
}

export async function createRechargeOrder(amountYuan: string): Promise<RechargeOrder> {
  const response = await fetch(`${API_BASE_URL}/api/v1/account/recharge-orders`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount_yuan: amountYuan }),
  });
  if (!response.ok) throw new Error(await readErrorMessage(response, "Recharge request failed"));
  return (await response.json()) as RechargeOrder;
}

export async function fetchRechargeOrder(orderId: string): Promise<RechargeOrder> {
  const response = await fetch(`${API_BASE_URL}/api/v1/account/recharge-orders/${orderId}`, {
    credentials: "include",
  });
  if (!response.ok) throw new Error(await readErrorMessage(response, "Order request failed"));
  return (await response.json()) as RechargeOrder;
}

export async function fetchWeChatLoginUrl(): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/api/v1/auth/wechat/login-url`, {
    credentials: "include",
  });
  if (!response.ok)
    throw new Error(await readErrorMessage(response, "WeChat login request failed"));
  const payload = (await response.json()) as { url: string };
  return payload.url;
}

export async function logoutAccount(): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/v1/account/logout`, {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) throw new Error(await readErrorMessage(response, "Logout request failed"));
}
