import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

type ManifestEntry = { id: string; playbookPath: string };
const manifest = JSON.parse(fs.readFileSync(
  path.resolve("../../data/template-previews/manifest.json"), "utf8",
)) as ManifestEntry[];

async function params(page: Page) {
  await expect(page.locator(".playbook-player")).toBeVisible();
  if (await page.locator(".playbook-player--portrait").count()) {
    await page.getByRole("tab", { name: "参数", exact: true }).click();
  }
}
async function followup(page: Page) {
  await expect(page.locator(".playbook-player")).toBeVisible();
  if (await page.locator(".playbook-player--portrait").count()) {
    await page.getByRole("tab", { name: "追问", exact: true }).click();
    await page.getByRole("button", { name: "打开追问面板", exact: true }).click();
  }
}
async function closeSheet(page: Page) {
  const close = page.locator(".playbook-player__mobile-sheet-head").getByRole("button", { name: "关闭面板", exact: true });
  if (await close.isVisible()) await close.click();
}

test.beforeEach(async ({ page }) => {
  // Fixtures are local; unexpected external requests cannot spend quota.
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    return ["127.0.0.1", "localhost"].includes(url.hostname)
      ? route.continue() : route.abort("blockedbyclient");
  });
});

for (const entry of manifest) {
  test(`template ${entry.id}: all steps, controls, reset, followup`, async ({ page }, info) => {
    const errors: string[] = [];
    const writes: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => {
      if (request.method() !== "GET" && request.url().includes("/api/")) writes.push(request.url());
    });
    await page.goto(`/templates/${entry.id}`);
    await expect(page.locator(".playbook-player")).toBeVisible();
    const script = JSON.parse(fs.readFileSync(entry.playbookPath, "utf8"));
    const dots = page.getByRole("group", { name: "步骤导航" }).getByRole("button");
    await expect(dots).toHaveCount(script.steps.length);
    for (let i = 0; i < script.steps.length; i++) {
      if (i) await page.getByRole("button", { name: "下一步", exact: true }).click();
      await expect(dots.nth(i)).toHaveClass(/is-active/);
      await expect(page.locator(".playbook-player__stage")).toBeVisible();
    }
    await expect(page.getByRole("button", { name: "下一步", exact: true })).toBeDisabled();
    await dots.first().click();
    await params(page);
    const control = page.locator(".mv-template-params input, .mv-template-params select").first();
    if (await control.count()) {
      const before = await control.inputValue();
      if (await control.evaluate((node) => node.tagName === "SELECT")) {
        const options = await control.locator("option").evaluateAll((nodes) => nodes.map((n) => (n as HTMLOptionElement).value));
        const next = options.find((value) => value !== before);
        if (next) await control.selectOption(next);
      } else {
        await control.focus();
        await control.press("ArrowRight");
      }
      await params(page);
      await page.getByRole("button", { name: "恢复默认参数" }).click();
      await params(page);
      await expect(control).toHaveValue(before);
    }
    await followup(page);
    const question = page.locator(".mv-static-followup__questions button").first();
    await expect(question).toBeVisible();
    await question.click();
    await expect(page.locator(".mv-static-followup__message.is-assistant")).toBeVisible();
    expect(errors).toEqual([]);
    expect(writes).toEqual([]);
    await page.screenshot({ path: info.outputPath(`${entry.id}.png`) });
  });
}

test("followup parameter changes are cleared by restore defaults", async ({ page }) => {
  await page.goto("/templates/ellipse-focus-definition");
  await params(page);
  const inputs = page.locator(".mv-template-params input");
  const before = await inputs.evaluateAll((nodes) => nodes.map((node) => (node as HTMLInputElement).value));
  await followup(page);
  await page.getByRole("button", { name: /^调整 / }).click();
  await closeSheet(page);
  await params(page);
  await expect.poll(() => inputs.evaluateAll((nodes) => nodes.map((node) => (node as HTMLInputElement).value))).not.toEqual(before);
  await page.getByRole("button", { name: "恢复默认参数" }).click();
  await params(page);
  await expect.poll(() => inputs.evaluateAll((nodes) => nodes.map((node) => (node as HTMLInputElement).value))).toEqual(before);
});

test("real HTTP pipeline, persisted followup patch, reload and history", async ({ page, request }, info) => {
  const prompt = `E2E-${info.project.name}-${Date.now()} 请解释定积分与曲线下面积`;
  await page.goto("/create");
  await page.locator(".mv-intake-input").fill(prompt);
  const submitted = page.waitForResponse((r) => r.url().endsWith("/api/v1/pipeline") && r.request().method() === "POST");
  await page.getByRole("button", { name: "生成讲解" }).click();
  const response = await submitted;
  expect(response.status()).toBe(202);
  const { run_id: runId } = await response.json();
  await expect(page).toHaveURL(new RegExp(`/run/${runId}$`));
  await expect(page.locator(".playbook-player")).toBeVisible({ timeout: 30_000 });
  await followup(page);
  await page.locator(".mv-chat-input").fill("E2E 修改课程标题");
  const patched = page.waitForResponse((r) => r.url().endsWith("/follow-up") && r.request().method() === "POST");
  await page.getByRole("button", { name: "发送 ↵", exact: true }).click();
  const patchResponse = await patched;
  expect(patchResponse.ok()).toBeTruthy();
  expect((await patchResponse.json()).version_id).toBeTruthy();
  await expect(page.locator(".mv-chat-stream")).toContainText("E2E：已修改课程标题。");
  await page.reload();
  await expect(page.locator(".playbook-player")).toBeVisible();
  expect((await (await request.get(`/api/v1/runs/${runId}`)).json()).playbook.title).toBe("E2E 修改后的课程");
  await page.goto("/history");
  const item = page.locator(".mv-history-item").filter({ hasText: prompt });
  await expect(item).toBeVisible();
  await item.getByRole("button", { name: "在工作台打开", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/run/${runId}$`));
  await expect(page.locator(".playbook-player")).toBeVisible();
});

test("saved sandbox version remains exportable without reloading", async ({ page }, info) => {
  await page.goto(`/run/e2e-sandbox-${info.project.name}`);
  await expect(page.locator(".playbook-player")).toBeVisible();
  await params(page);
  const slider = page.getByRole("slider", { name: "切点 x", exact: true });
  await slider.focus();
  await slider.press("ArrowRight");
  await expect(page.getByRole("button", { name: "应用到新版本", exact: true })).toBeEnabled();
  const saved = page.waitForResponse((r) => r.url().endsWith("/interaction-version"));
  await page.getByRole("button", { name: "应用到新版本", exact: true }).click();
  const result = await saved;
  expect(result.ok(), await result.text()).toBeTruthy();
  expect((await result.json()).version_id).toBeTruthy();
  await expect(page.locator(".mv-chat-stream")).toContainText("已将沙盒操作应用为新版本");
  await closeSheet(page);
  await page.getByRole("button", { name: "导出 MP4", exact: true }).click();
  await expect(page.getByRole("button", { name: "开始导出", exact: true })).toBeEnabled();
  await expect(page.getByText("当前预览还没有保存为版本，不能静默导出旧版本。", { exact: true })).toHaveCount(0);
  // Deliberately do not start a render in this acceptance check.
});
