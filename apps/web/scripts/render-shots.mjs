#!/usr/bin/env node
/**
 * Headless still-render for the playbook eval loop.
 *
 * Reuses the existing registered Remotion composition ("playbook" in
 * apps/web/src/remotion/index.ts) — no new render path. Given a PlaybookScript
 * JSON it renders one representative frame per step (near the end of the step,
 * where its reveal animation has settled) to PNGs you can hand to a reviewer.
 *
 *   node apps/web/scripts/render-shots.mjs <playbook.json> [outDir]
 *
 * Env:
 *   SHOT_THEME       "dark" | "light"   (default dark)
 *   REMOTION_ENTRY   override entry path (default apps/web/src/remotion/index.ts from cwd)
 */
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import fs from "node:fs";
import path from "node:path";

const playbookPath = process.argv[2];
const outDir = process.argv[3] ?? "eval/shots/out";
if (!playbookPath) {
  console.error("usage: node apps/web/scripts/render-shots.mjs <playbook.json> [outDir]");
  process.exit(1);
}

const theme = process.env.SHOT_THEME ?? "dark";
const entry = process.env.REMOTION_ENTRY ?? path.resolve("apps/web/src/remotion/index.ts");

const script = JSON.parse(fs.readFileSync(playbookPath, "utf8"));
fs.mkdirSync(outDir, { recursive: true });

console.log(`[render-shots] bundling ${entry} ...`);
const serveUrl = await bundle({ entryPoint: entry });

const inputProps = { script, theme, showSubtitles: true, audioFiles: [] };
const composition = await selectComposition({ serveUrl, id: "playbook", inputProps });

// Pick a representative frame per step: 85% into the step's window, where the
// reveal/fade animations have settled but before the next step begins.
const steps = Array.isArray(script.steps) ? script.steps : [];
const shots = [];
let start = 0;
if (steps.length === 0) {
  shots.push({ label: "frame-000", frame: 0, title: script.title ?? "" });
} else {
  steps.forEach((s, i) => {
    const end = s.end_frame;
    const frame = Math.max(start, Math.min(end - 1, Math.round(start + (end - start) * 0.85)));
    shots.push({ label: `step-${String(i + 1).padStart(2, "0")}`, frame, title: s.title ?? "" });
    start = end;
  });
}

for (const { label, frame, title } of shots) {
  const output = path.join(outDir, `${label}.png`);
  await renderStill({ composition, serveUrl, output, frame, inputProps });
  console.log(`[render-shots] ${label} @frame ${frame}  ${title} -> ${output}`);
}
console.log(`[render-shots] done: ${shots.length} stills in ${outDir}`);
