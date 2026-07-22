import { expect, test, type Page } from "@playwright/test";

const CASES = [
  ["ellipse-focus-definition", 6, ["conic_curve", "focus"], { focus: 2, focal_distance: 2 }],
  ["parabola-focus-directrix", 5, ["conic_curve", "focus", "directrix"], { focus: 1, directrix: 1, projection_foot: 1 }],
  ["hyperbola-asymptotes", 6, ["conic_curve"], { conic_curve: 2, focus: 2, asymptote: 2 }],
  ["line-ellipse-position", 6, ["conic_curve", "moving_line"], { moving_line: 1, discriminant_panel: 1 }],
  ["ellipse-chord-midpoint-locus", 6, ["chord", "fixed_point"], { intersection_point: 2, chord_midpoint: 1, theoretical_locus: 1 }],
  ["pole-polar", 6, ["conic_curve", "moving_point"], { tangent_point: 2, tangent: 2, polar_line: 1 }],
] as const;

const MATRICES = [
  { name: "desktop-light", viewport: { width: 1440, height: 900 }, theme: "light" },
  { name: "desktop-dark", viewport: { width: 1440, height: 900 }, theme: "dark" },
  { name: "windows-small-light", viewport: { width: 1366, height: 768 }, theme: "light" },
  { name: "windows-small-dark", viewport: { width: 1366, height: 768 }, theme: "dark" },
  { name: "full-hd-light", viewport: { width: 1920, height: 1080 }, theme: "light" },
  { name: "full-hd-dark", viewport: { width: 1920, height: 1080 }, theme: "dark" },
  { name: "tablet-light", viewport: { width: 1024, height: 768 }, theme: "light" },
  { name: "tablet-dark", viewport: { width: 1024, height: 768 }, theme: "dark" },
  { name: "narrow-light", viewport: { width: 720, height: 900 }, theme: "light" },
  { name: "narrow-dark", viewport: { width: 720, height: 900 }, theme: "dark" },
  { name: "mobile-light", viewport: { width: 390, height: 844 }, theme: "light" },
  { name: "mobile-dark", viewport: { width: 390, height: 844 }, theme: "dark" },
  { name: "mobile-narrow-light", viewport: { width: 320, height: 700 }, theme: "light" },
  { name: "mobile-narrow-dark", viewport: { width: 320, height: 700 }, theme: "dark" },
] as const;

for (const matrix of MATRICES) {
  test.describe(matrix.name, () => {
    test.use({ viewport: matrix.viewport, colorScheme: matrix.theme });

    for (const [caseId, stepCount, openingRoles, finalRoleCounts] of CASES) {
      test(`${caseId} keeps the teacher player visible and unclipped`, async ({ page }, testInfo) => {
        await installTheme(page, matrix.theme);
        await page.goto(`/templates/${caseId}`);
        await expect(page.locator(".playbook-player")).toHaveAttribute("data-theme", matrix.theme);
        await expect(page.locator(".playbook-player__stage")).toBeVisible();
        await expect(page.locator(".playbook-player__controls")).toBeVisible();
        const isPortrait = await page.locator(".playbook-player").evaluate((element) =>
          element.classList.contains("playbook-player--portrait"));

        for (const role of openingRoles) {
          const semanticObject = page.locator(`[data-semantic-role='${role}']`).first();
          await expect(semanticObject).toBeAttached();
          expect(await semanticObject.evaluate((element) => {
            const rect = element.getBoundingClientRect();
            return rect.width > 0 || rect.height > 0;
          })).toBe(true);
        }

        await expectLayoutUnclipped(page);

        const paramsCard = page.locator(".playbook-player__params-card");
        if (isPortrait) {
          await expect(paramsCard).toBeHidden();
          await expect(page.getByRole("tab", { name: "参数" })).toBeVisible();
          await page.getByRole("tab", { name: "参数" }).click();
        } else {
          await expect(paramsCard).toBeVisible();
        }

        const firstSlider = page.locator("input[type='range']").first();
        await expect(firstSlider).toBeVisible();
        const initialValue = await firstSlider.inputValue();
        await firstSlider.press("ArrowRight");
        await expect(firstSlider).not.toHaveValue(initialValue);
        await expectLayoutUnclipped(page);

        for (let index = 1; index < stepCount; index += 1) {
          await page.getByRole("button", { name: "下一步" }).click();
          await expect(page.locator(".playbook-player__stage")).toBeVisible();
          await expectLayoutUnclipped(page);
        }
        for (const [role, expectedCount] of Object.entries(finalRoleCounts)) {
          await expect(page.locator(`[data-semantic-role='${role}']`)).toHaveCount(expectedCount);
        }

        if (isPortrait) {
          await page.getByRole("tab", { name: "追问" }).click();
          await expect(page.locator(".mv-static-followup")).toBeVisible();
          await expect(page.locator(".mv-static-followup__questions button")).toHaveCount(5);
          await expect(
            page.getByRole("button", { name: /返回导航|显示顶部栏/ }),
          ).toBeVisible();
        } else {
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

async function expectLayoutUnclipped(page: Page) {
  const layout = await page.evaluate(() => {
    const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
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
}
