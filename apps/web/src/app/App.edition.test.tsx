import { cleanup, render, waitFor } from "@testing-library/react";
import React from "react";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";

import { server } from "../mocks/server";
import { API_BASE_URL } from "../shared/config/constants";

describe("App edition shells", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    vi.resetModules();
    localStorage.clear();
    sessionStorage.clear();
  });

  it("self edition does not load account state on the intake screen", async () => {
    let accountHits = 0;
    server.use(
      http.get(`${API_BASE_URL}/api/v1/account/me`, () => {
        accountHits += 1;
        return HttpResponse.json({ detail: "should not be requested" }, { status: 500 });
      }),
    );
    vi.stubEnv("VITE_APP_EDITION", "self");

    const { App } = await import("./App");
    render(<App />);
    await waitFor(() => expect(document.body.textContent).toContain("MetaView"));

    expect(accountHits).toBe(0);
  });

  it("ops edition loads account state and shows balance", async () => {
    let accountHits = 0;
    server.use(
      http.get(`${API_BASE_URL}/api/v1/account/me`, () => {
        accountHits += 1;
        return HttpResponse.json({
          user_id: "user_1",
          display_name: "游客账户",
          avatar_url: null,
          login_provider: "guest",
          status: "enabled",
          role: "user",
          balance_cents: 500,
          balance_yuan: "5.00",
          recharge_min_cents: 500,
          payment_enabled: false,
          wechat_login_enabled: false,
        });
      }),
    );
    vi.stubEnv("VITE_APP_EDITION", "ops");

    const { App } = await import("./App");
    render(<App />);

    await waitFor(() => expect(accountHits).toBe(1));
    expect(document.body.textContent).toContain("游客账户 · ¥ 5.00");
  });
});
