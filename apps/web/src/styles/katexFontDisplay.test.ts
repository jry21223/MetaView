import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import fs from "node:fs";

/**
 * Regression test for issue #45 — verify the KaTeX CSS that ships with the
 * package still uses ``font-display: block`` (which makes the Vite plugin's
 * swap rewrite still meaningful) and confirm at least one woff2 reference
 * survives. If KaTeX changes their CSS structure, this test surfaces the
 * drift before users hit the FOIT regression.
 */
describe("KaTeX font CSS regression contract (issue #45)", () => {
  const require = createRequire(import.meta.url);
  // Resolve through Node's module resolution so the test works whether npm
  // hoists katex to the workspace root or installs it locally.
  const cssPath = require.resolve("katex/dist/katex.min.css");

  it("KaTeX still ships @font-face rules", () => {
    const css = fs.readFileSync(cssPath, "utf8");
    expect(css).toMatch(/@font-face/);
  });

  it("KaTeX CSS still uses font-display: block (so our swap rewrite matters)", () => {
    const css = fs.readFileSync(cssPath, "utf8");
    expect(css).toMatch(/font-display:\s*block/);
  });

  it("KaTeX woff2 font references are still present", () => {
    const css = fs.readFileSync(cssPath, "utf8");
    expect(css).toMatch(/KaTeX_\w+-[\w]+\.woff2/);
  });
});
