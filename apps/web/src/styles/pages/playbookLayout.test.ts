import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const cssPath = path.resolve(__dirname, "playbook.css");
const templatesCssPath = path.resolve(__dirname, "templates.css");
const studioCssPath = path.resolve(__dirname, "studio.css");

function ruleBody(selector: string, sourcePath = cssPath): string {
  const css = fs.readFileSync(sourcePath, "utf8");
  const match = css.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`));
  if (!match) throw new Error(`Missing CSS rule for ${selector}`);
  return match[1];
}

describe("playbook layout CSS", () => {
  it("fits the 16:9 stage to both available width and height", () => {
    const shell = ruleBody(".playbook-player__stage-shell");
    const stage = ruleBody(".playbook-player__stage");

    expect(shell).toContain("container-type: size;");
    expect(stage).toContain("width: min(100cqw, calc(100cqh * 16 / 9));");
    expect(stage).toContain("aspect-ratio: 16 / 9;");
  });

  it("keeps the caption above controls and aligns the controls to the console bottom inset", () => {
    const controls = ruleBody(".playbook-player__controls");
    const caption = ruleBody(".playbook-player__caption");

    expect(controls).toContain("margin: 0 var(--player-workspace-x) 16px;");
    expect(caption).toContain("margin: 0 var(--player-workspace-x) 12px;");
  });

  it("lets follow-up stretch while related context stays pinned to the rail bottom", () => {
    const follow = ruleBody(".playbook-player__follow-card");
    const relatedRow = ruleBody(".playbook-player__related-row");
    const relatedCard = ruleBody(".playbook-player__related-card");

    expect(follow).toContain("flex: 1 1 auto;");
    expect(follow).not.toContain("max-height: min(318px, 35vh);");
    expect(relatedRow).toContain("margin-top: auto;");
    expect(relatedRow).toContain("flex: 0 0 auto;");
    expect(relatedCard).toContain("margin-top: auto;");
    expect(relatedCard).toContain("flex: 0 0 auto;");
  });

  it("renders deterministic follow-up as one dialog with pills above its input", () => {
    const followup = ruleBody(".mv-static-followup", templatesCssPath);
    const questions = ruleBody(".mv-static-followup__questions", templatesCssPath);
    const input = ruleBody(".mv-static-followup__input-row", templatesCssPath);

    expect(followup).toContain("width: 100%;");
    expect(followup).toContain("display: flex;");
    expect(followup).toContain("flex-direction: column;");
    expect(questions).toContain("flex-wrap: wrap;");
    expect(input).toContain("grid-template-columns: minmax(0, 1fr) auto;");
  });

  it("uses a light semantic track for deterministic range controls", () => {
    const range = ruleBody('.mv-template-param input[type="range"]', templatesCssPath);

    expect(range).toContain("appearance: none;");
    expect(range).toContain("background: var(--line-2);");
    expect(range).toContain("accent-color: var(--accent);");
  });

  it("bridges light and dark math scenes into Mafs semantic theme variables", () => {
    const dark = ruleBody('.math-scene-renderer[data-theme="dark"]');
    const light = ruleBody('.math-scene-renderer[data-theme="light"]');
    const mafs = ruleBody(".math-scene-renderer__stage .MafsView");

    expect(dark).toContain("--msr-bg: var(--surface-2, #0e1412);");
    expect(dark).toContain("--msr-text: var(--ink, #e8efe9);");
    expect(light).toContain("--msr-bg: var(--surface-2, #faf8f3);");
    expect(light).toContain("--msr-text: var(--ink, #161a18);");
    expect(mafs).toContain("--mafs-bg: var(--msr-bg);");
    expect(mafs).toContain("--mafs-fg: var(--msr-text);");
    expect(mafs).toContain("--mafs-origin-color: var(--canvas-axis);");
    expect(mafs).toContain("--mafs-line-color: var(--canvas-grid);");
    expect(mafs).not.toContain("--mafs-fg-color");
  });

  it("wraps real follow-up suggestion pills above the chat input", () => {
    const suggestions = ruleBody(".mv-followup-panel .mv-suggestions", studioCssPath);
    const suggestion = ruleBody(".mv-followup-panel .mv-suggestion", studioCssPath);

    expect(suggestions).toContain("display: flex;");
    expect(suggestions).toContain("flex-wrap: wrap;");
    expect(suggestions).toContain("white-space: normal;");
    expect(suggestion).toContain("flex: 0 1 auto;");
    expect(suggestion).toContain("border-radius: 999px;");
    expect(suggestion).toContain("white-space: normal;");
  });
});
