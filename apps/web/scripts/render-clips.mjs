#!/usr/bin/env node
/**
 * Batch-render playbook frame ranges to H.264 MP4 clips (one bundle, many
 * clips). Used for promo cuts and full-length case videos.
 *
 *   node apps/web/scripts/render-clips.mjs <jobs.json>
 *
 * jobs.json: [{ playbook, out, from?, to?, tempo?, theme?, scale? }]
 *   playbook  path to a PlaybookScript JSON (e.g. data/template-previews/*.playbook.json)
 *   out       output mp4 path
 *   from/to   frame range AFTER tempo scaling (defaults: whole timeline)
 *   tempo     playback speed, e.g. 2 renders the lesson at double speed
 *             (end_frames divide by tempo, min one frame per step); default 1
 *   theme     "light" (default) | "dark"
 *   scale     render scale over the 960×540 composition; default 2 (1080p)
 *
 * Env: REMOTION_BROWSER_EXECUTABLE — preinstalled Chromium for sandboxes that
 * cannot download Remotion's headless shell.
 *
 * Run from apps/web so the Remotion entry resolves.
 */
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import fs from "node:fs";
import path from "node:path";

const jobsPath = process.argv[2];
if (!jobsPath) {
  console.error("usage: node render-clips.mjs <jobs.json>");
  process.exit(1);
}
const jobs = JSON.parse(fs.readFileSync(path.resolve(jobsPath), "utf8"));
const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE || undefined;
const entryPoint = path.resolve("src/remotion/index.ts");
const publicDir = path.resolve("public");

/** Same transform as the backend's silent-export tempo (export_video._apply_tempo). */
function applyTempo(script, tempo) {
  if (!tempo || tempo === 1) return script;
  const scaled = { ...script, steps: script.steps.map((step) => ({ ...step })) };
  let previousEnd = 0;
  for (const step of scaled.steps) {
    step.end_frame = Math.max(previousEnd + 1, Math.round(step.end_frame / tempo));
    previousEnd = step.end_frame;
  }
  scaled.total_frames = previousEnd;
  return scaled;
}

const serveUrl = await bundle({ entryPoint, publicDir });
for (const job of jobs) {
  const raw = JSON.parse(fs.readFileSync(path.resolve(job.playbook), "utf8"));
  const script = applyTempo(raw, job.tempo);
  const inputProps = {
    script,
    director: null,
    theme: job.theme ?? "light",
    showSubtitles: true,
    audioFiles: [],
  };
  const composition = await selectComposition({ serveUrl, id: "playbook", inputProps, browserExecutable });
  const from = job.from ?? 0;
  const last = Math.min(job.to ?? composition.durationInFrames - 1, composition.durationInFrames - 1);
  fs.mkdirSync(path.dirname(path.resolve(job.out)), { recursive: true });
  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    outputLocation: path.resolve(job.out),
    inputProps,
    frameRange: [from, last],
    browserExecutable,
    muted: true,
    scale: job.scale ?? 2,
  });
  console.log(`[clips] done ${job.out} (${from}-${last}, tempo ${job.tempo ?? 1})`);
}
