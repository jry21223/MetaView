import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./visual-tests",
  testMatch: "conic-gold.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "line",
  outputDir: "../../eval/shots/conic-playwright",
  use: {
    baseURL: "http://127.0.0.1:4173",
    browserName: "chromium",
    colorScheme: "light",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run preview -- --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173/templates",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
