import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const cssPath = path.resolve(__dirname, "playbook.css");

function ruleBody(selector: string): string {
  const css = fs.readFileSync(cssPath, "utf8");
  const match = css.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`));
  if (!match) throw new Error(`Missing CSS rule for ${selector}`);
  return match[1];
}

describe("playbook layout CSS", () => {
  it("keeps the caption above controls and aligns the controls to the console bottom inset", () => {
    const controls = ruleBody(".playbook-player__controls");
    const caption = ruleBody(".playbook-player__caption");

    expect(controls).toContain("margin: 0 var(--player-workspace-x) 16px;");
    expect(caption).toContain("margin: 0 var(--player-workspace-x) 12px;");
  });
});
