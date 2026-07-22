import { expect, test, type Page } from "@playwright/test";

const CASES = [
  ["ellipse-focus-definition", ["conic_curve", "focus"]],
  ["parabola-focus-directrix", ["conic_curve", "focus", "directrix"]],
  ["hyperbola-asymptotes", ["conic_curve", "focus"]],
  ["line-ellipse-position", ["conic_curve", "moving_line"]],
  ["ellipse-chord-midpoint-locus", ["chord", "chord_midpoint"]],
  ["pole-polar", ["conic_curve", "moving_point"]],
] as const;

const MATRICES = [
  { name: "desktop-light", viewport: { width: 1440, height: 900 }, theme: "light" },
  { name: "desktop-dark", viewport: { width: 1440, height: 900 }, theme: "dark" },
  { name: "mobile-light", viewport: { width: 390, height: 844 }, theme: "light" },
  { name: "mobile-dark", viewport: { width: 390, height: 844 }, theme: "dark" },
] as const;

for (const matrix of MATRICES) {
  test.describe(matrix.name, () => {
    test.use({ viewport: matrix.viewport, colorScheme: matrix.theme });

    for (const [caseId, openingRoles] of CASES) {
      test(`${caseId} keeps the teacher player visible and unclipped`, async ({ page }, testInfo) => {
        await installTheme(page, matrix.theme);
        await page.goto(`/templates/${caseId}`);
        await expect(page.locator(".playbook-player")).toHaveAttribute("data-theme", matrix.theme);
        await expect(page.locator(".playbook-player__stage")).toBeVisible();
        await expect(page.locator(".playbook-player__controls")).toBeVisible();

        for (const role of openingRoles) {
          const semanticObject = page.locator(`[data-semantic-role='${role}']`).first();
          await expect(semanticObject).toBeAttached();
          expect(await semanticObject.evaluate((element) => {
            const rect = element.getBoundingClientRect();
            return rect.width > 0 || rect.height > 0;
          })).toBe(true);
        }

        const layout = await page.evaluate(() => {
          const viewportWidth = window.innerWidth;
          const overflow = document.documentElement.scrollWidth - viewportWidth;
          const clipped = Array.from(
            document.querySelectorAll<HTMLElement>(
              ".playbook-player__stage, .playbook-player__controls, .mv-static-followup, .katex",
            ),
          ).filter((element) => {
            const rect = element.getBoundingClientRect();
            return rect.left < -1 || rect.right > viewportWidth + 1;
          }).map((element) => element.className || element.tagName);
          return { overflow, clipped };
        });
        expect(layout.overflow).toBeLessThanOrEqual(1);
        expect(layout.clipped).toEqual([]);

        const paramsCard = page.locator(".playbook-player__params-card");
        if (matrix.viewport.width === 390) {
          await expect(paramsCard).toBeHidden();
          await expect(page.getByRole("tab", { name: "参数" })).toBeVisible();
          await page.getByRole("tab", { name: "追问" }).click();
          await expect(page.locator(".mv-static-followup")).toBeVisible();
          await expect(page.locator(".mv-static-followup__questions button")).toHaveCount(5);
          await expect(
            page.getByRole("button", { name: /返回导航|显示顶部栏/ }),
          ).toBeVisible();
        } else {
          await expect(paramsCard).toBeVisible();
          await expect(page.locator(".mv-static-followup")).toBeVisible();
          await expect(page.locator(".mv-static-followup__questions button")).toHaveCount(5);
          const topbarToggle = page.getByRole("button", { name: /显示顶部栏|隐藏顶部栏/ });
          await expect(topbarToggle).toBeVisible();
          const initialLabel = await topbarToggle.getAttribute("aria-label");
          await topbarToggle.click();
          await expect(page.getByRole("button", {
            name: initialLabel === "显示顶部栏" ? "隐藏顶部栏" : "显示顶部栏",
          })).toBeVisible();
        }

        await page.screenshot({
          path: testInfo.outputPath(`${caseId}-${matrix.name}.png`),
          fullPage: true,
        });
      });
    }
  });
}

async function installTheme(page: Page, theme: "light" | "dark") {
  await page.addInitScript(({ selectedTheme, accent }) => {
    window.localStorage.setItem("mv_tweaks", JSON.stringify({
      theme: selectedTheme,
      accent,
      layout: "drawer",
      density: "regular",
    }));
  }, { selectedTheme: theme, accent: theme === "dark" ? "#9fb48d" : "#82976f" });
}
