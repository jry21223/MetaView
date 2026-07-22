#!/usr/bin/env node
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import fs from "node:fs/promises";
import path from "node:path";

const inputDirectory = path.resolve(process.argv[2] ?? "../../data/template-previews");
const outputDirectory = path.resolve(process.argv[3] ?? "public/template-previews");
const requested = new Set(process.argv.slice(4));
const manifest = JSON.parse(await fs.readFile(path.join(inputDirectory, "manifest.json"), "utf8"));
const cases = requested.size > 0 ? manifest.filter((item) => requested.has(item.id)) : manifest;
const entryPoint = path.resolve("src/remotion/index.ts");
const publicDir = path.resolve("public");

console.log(`[template-posters] bundling ${entryPoint}`);
const serveUrl = await bundle({ entryPoint, publicDir });
for (const item of cases) {
  const script = JSON.parse(await fs.readFile(path.resolve(item.playbookPath), "utf8"));
  const inputProps = { script, director: null, theme: "light", showSubtitles: true, audioFiles: [] };
  const composition = await selectComposition({ serveUrl, id: "playbook", inputProps });
  const frame = Math.min(item.posterFrame, composition.durationInFrames - 1);
  const caseDirectory = path.join(outputDirectory, item.id);
  const output = path.join(caseDirectory, "poster.webp");
  await fs.mkdir(caseDirectory, { recursive: true });
  await renderStill({ composition, serveUrl, output, frame, inputProps, imageFormat: "webp" });
  console.log(`[template-posters] ${item.id} @${frame} -> ${output}`);
}
