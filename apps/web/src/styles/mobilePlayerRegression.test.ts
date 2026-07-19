import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function read(filePath: string): string {
  return fs.readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");
}

describe("mobile player regression contracts", () => {
  const webRoot = path.resolve(__dirname, "..", "..");
  const indexCss = read(path.join(webRoot, "src/index.css"));
  const fixesCss = read(
    path.join(webRoot, "src/styles/pages/playbook-mobile-fixes.css"),
  );
  const playerSource = read(
    path.join(
      webRoot,
      "src/features/playbook/engine/player/PlaybookPlayer.tsx",
    ),
  );

  it("loads the correction layer after the shared page styles", () => {
    expect(indexCss.trim().endsWith(
      "@import './styles/pages/playbook-mobile-fixes.css';",
    )).toBe(true);
  });

  it("lets portrait lessons own the available inline width", () => {
    expect(fixesCss).toContain(
      ".playbook-player--portrait .playbook-player__stage-shell",
    );
    expect(fixesCss).toContain("container-type: inline-size;");
    expect(fixesCss).toContain(
      ".playbook-player--portrait .playbook-player__stage {\n    width: 100%;",
    );
    expect(fixesCss).toContain("max-width: 100%;");
  });

  it("keeps sticky mobile chrome below the safe area and makes collapse real", () => {
    expect(fixesCss).toContain("top: var(--mv-safe-top);");
    expect(fixesCss).toContain(
      ".mv-top-shell.is-collapsed {\n    grid-template-rows: 0fr;",
    );
    expect(fixesCss).toContain("pointer-events: none;");
  });

  it("centers header icons and replaces platform emoji rendering", () => {
    expect(fixesCss).toContain("display: inline-grid;");
    expect(fixesCss).toContain("place-items: center;");
    expect(fixesCss).toContain(
      '.playbook-ctrl-btn--play[aria-label="播放"]',
    );
    expect(fixesCss).toContain(
      '.playbook-ctrl-btn--play[aria-label="暂停"]',
    );
    expect(fixesCss).toContain("-webkit-mask-image: var(--playbook-transport-icon);");
    expect(playerSource).toContain(
      'aria-label={isPlaying ? "暂停" : "播放"}',
    );
  });
});
