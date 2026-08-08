import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("Landing Director inverse theme", () => {
  it("consumes runtime inverse-theme variables without duplicating palette hex values", () => {
    const contentCss = fs.readFileSync(
      path.resolve(process.cwd(), "src/styles/pages/landing/content.css"),
      "utf8",
    );
    const directorBlock = contentCss.match(/\.mv-landing-director\s*\{([^}]*)\}/)?.[1];

    expect(directorBlock).toBeTruthy();
    expect(directorBlock).not.toMatch(/#[\da-f]{6,8}/i);
    expect(directorBlock).toContain(
      "--director-bg: var(--landing-director-bg)",
    );
    expect(directorBlock).toContain(
      "--director-accent: var(--landing-director-accent)",
    );
    expect(contentCss).not.toMatch(/\.mv-dark \.mv-landing-director\s*\{/);
  });
});
