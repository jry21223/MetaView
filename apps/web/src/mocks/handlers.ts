import { http, HttpResponse } from "msw";
import { API_BASE_URL } from "../shared/config/constants";

/**
 * Shared default handlers — return a "no fixture configured" 500 unless the
 * test explicitly overrides the path via ``server.use(...)``. Forcing tests
 * to declare their fixtures keeps the network surface visible and
 * intentional, matching CLAUDE.md's "禁止 Mock，前端 API 测试使用 MSW
 * 拦截网络" rule (#58 closes the regression in the old vi.mock-based test).
 */
export const handlers = [
  http.all(`${API_BASE_URL}/api/*`, ({ request }) =>
    HttpResponse.json(
      { detail: `No MSW fixture configured for ${request.method} ${request.url}` },
      { status: 500 },
    ),
  ),
];
