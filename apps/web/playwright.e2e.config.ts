import path from "node:path";
import { defineConfig } from "@playwright/test";

const root = path.resolve("../..");

export default defineConfig({
  testDir: "./e2e",
  testMatch: "*.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  reporter: [
    ["line"],
    ["json", { outputFile: "../../eval/reports/browser-e2e/results.json" }],
    ["html", { outputFolder: "../../eval/reports/browser-e2e/html", open: "never" }],
  ],
  outputDir: "../../eval/shots/browser-e2e",
  use: {
    baseURL: "http://127.0.0.1:4173",
    browserName: "chromium",
    colorScheme: "light",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    serviceWorkers: "block",
    actionTimeout: 8_000,
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { viewport: { width: 320, height: 700 }, isMobile: true, hasTouch: true } },
  ],
  webServer: [
    {
      command: "python -m uvicorn apps.web.e2e.api_fixture:app --host 127.0.0.1 --port 8000",
      cwd: root,
      url: "http://127.0.0.1:8000/health",
      reuseExistingServer: false,
      env: {
        PYTHONPATH: path.join(root, "apps/api"),
        METAVIEW_E2E: "1",
        METAVIEW_APP_EDITION: "self",
        METAVIEW_GENERATION_MODE: "single",
        METAVIEW_ROUTER_MODE: "heuristic",
        METAVIEW_REVIEWER_MODE: "off",
        METAVIEW_OPENAI_API_KEY: "e2e-not-a-real-key",
        METAVIEW_OPENAI_BASE_URL: "http://127.0.0.1:8000/e2e-provider-not-enabled",
        METAVIEW_LLM_API_KEY: "",
        METAVIEW_TTS_API_KEY: "",
        METAVIEW_RATE_LIMIT_ENABLED: "false",
        METAVIEW_HISTORY_DB_PATH: path.join(root, "data/e2e", `browser-${process.pid}.db`),
      },
    },
    {
      command: "npm run build && npm run preview -- --host 127.0.0.1 --port 4173 --strictPort",
      url: "http://127.0.0.1:4173/templates",
      reuseExistingServer: false,
      timeout: 120_000,
      env: { VITE_APP_EDITION: "self", VITE_API_BASE_URL: "" },
    },
  ],
});
