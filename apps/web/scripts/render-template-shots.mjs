#!/usr/bin/env node
/**
 * Render every step of a template preview case to a PNG, so a change to the
 * cases or the renderers can be reviewed as pictures rather than as JSON.
 *
 * Unlike `render-shots.mjs`, which takes an exported playbook file, this one
 * calls the case builders directly — so non-default parameters can be
 * rendered without exporting anything first.
 *
 *   cd apps/web
 *   npx vite-node --script scripts/render-template-shots.mjs -- <caseId...> [options]
 *   npm run template-shots -- <caseId...> [options]
 *
 * Options:
 *   --themes light,dark   themes to render (default: light)
 *   --params <json>       either `{"<caseId>": {...}}` or a flat `{...}`
 *                         applied to every case; merged over the defaults
 *   --out <dir>           output root (default: ../../eval/shots)
 *   --frame-ratio <0..1>  where inside each step to sample (default: 0.85,
 *                         after the reveal has settled, before the next step)
 *
 * Env:
 *   REMOTION_BROWSER_EXECUTABLE  path to a Chromium headless shell. Required
 *     here: this sandbox cannot download Remotion's own, and the Chromium on
 *     PATH has had its old headless mode removed, so it fails to start.
 *
 * Output: <out>/<caseId>/<theme>/step-NN.png
 */
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import fs from "node:fs/promises";
import path from "node:path";

import {
  TEMPLATE_PREVIEW_CASE_IDS,
  getTemplatePreviewCase,
} from "../src/pages/Templates/templatePreviewCases";

const VALID_THEMES = new Set(["light", "dark"]);

function parseArgs(argv) {
  const caseIds = [];
  const options = { themes: ["light"], params: {}, out: "../../eval/shots", frameRatio: 0.85 };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    // npm inserts its own `--` before the forwarded arguments.
    if (arg === "--") continue;
    if (!arg.startsWith("--")) {
      caseIds.push(arg);
      continue;
    }
    const value = argv[index + 1];
    index += 1;
    if (value === undefined) throw new Error(`${arg} needs a value`);
    if (arg === "--themes") {
      options.themes = value.split(",").map((item) => item.trim()).filter(Boolean);
    } else if (arg === "--params") {
      options.params = JSON.parse(value);
    } else if (arg === "--out") {
      options.out = value;
    } else if (arg === "--frame-ratio") {
      options.frameRatio = Number(value);
    } else {
      throw new Error(`unknown option ${arg}`);
    }
  }
  return { caseIds, options };
}

/** `{"bst-search": {...}}` keys by case id; anything else applies to every case. */
function paramsFor(caseId, declared) {
  const values = Object.values(declared);
  const perCase = values.length > 0
    && values.every((value) => value !== null && typeof value === "object" && !Array.isArray(value));
  return perCase ? (declared[caseId] ?? {}) : declared;
}

/** A frame inside each step where its reveal animation has settled. */
function stepShots(script, frameRatio) {
  const shots = [];
  let start = 0;
  script.steps.forEach((step, index) => {
    const end = step.end_frame;
    const frame = Math.max(start, Math.min(end - 1, Math.round(start + (end - start) * frameRatio)));
    shots.push({ label: `step-${String(index + 1).padStart(2, "0")}`, frame, title: step.title });
    start = end;
  });
  return shots;
}

const { caseIds, options } = parseArgs(process.argv.slice(2));
if (caseIds.length === 0) {
  console.error("usage: render-template-shots.mjs <caseId...> [--themes light,dark] [--params <json>] [--out <dir>]");
  console.error(`known case ids: ${TEMPLATE_PREVIEW_CASE_IDS.join(", ")}`);
  process.exit(1);
}
for (const theme of options.themes) {
  if (!VALID_THEMES.has(theme)) {
    console.error(`[template-shots] unknown theme ${theme}; expected light or dark`);
    process.exit(1);
  }
}
const unknown = caseIds.filter((id) => !getTemplatePreviewCase(id));
if (unknown.length > 0) {
  console.error(`[template-shots] unknown case id(s): ${unknown.join(", ")}`);
  console.error(`known case ids: ${TEMPLATE_PREVIEW_CASE_IDS.join(", ")}`);
  process.exit(1);
}

const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE || undefined;
if (!browserExecutable) {
  console.warn(
    "[template-shots] REMOTION_BROWSER_EXECUTABLE is not set; Remotion will try to "
    + "download or discover a browser, which usually fails in this sandbox. "
    + "See docs/template-previews.md for the path to use.",
  );
}

const entryPoint = path.resolve("src/remotion/index.ts");
const publicDir = path.resolve("public");
const outputRoot = path.resolve(options.out);

console.log(`[template-shots] bundling ${entryPoint}`);
const serveUrl = await bundle({ entryPoint, publicDir });

let rendered = 0;
for (const caseId of caseIds) {
  const item = getTemplatePreviewCase(caseId);
  const params = { ...item.defaultParams, ...paramsFor(caseId, options.params) };
  const script = item.buildScript(params);
  const shots = stepShots(script, options.frameRatio);
  const composition = await selectComposition({
    serveUrl,
    id: "playbook",
    inputProps: { script, director: null, theme: options.themes[0], showSubtitles: true, audioFiles: [] },
    browserExecutable,
  });

  for (const theme of options.themes) {
    const inputProps = { script, director: null, theme, showSubtitles: true, audioFiles: [] };
    const directory = path.join(outputRoot, caseId, theme);
    await fs.mkdir(directory, { recursive: true });
    for (const shot of shots) {
      const frame = Math.min(shot.frame, composition.durationInFrames - 1);
      const output = path.join(directory, `${shot.label}.png`);
      await renderStill({ composition, serveUrl, output, frame, inputProps, browserExecutable });
      rendered += 1;
      console.log(`[template-shots] ${caseId}/${theme}/${shot.label} @${frame}  ${shot.title}`);
    }
    console.log(`[template-shots] ${caseId} ${theme}: ${shots.length} stills -> ${directory}`);
  }
}
console.log(`[template-shots] done: ${rendered} stills in ${outputRoot}`);
