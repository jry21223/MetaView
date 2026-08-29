#!/usr/bin/env node
/**
 * Visual regression gate for Gold template cases (#270).
 *
 * For every step of the selected cases it renders the settled-entrance frame
 * (step start + 66) and the mid-step frame, then asserts:
 *
 *  1. Stage blankness — the central stage region must contain a minimum share
 *     of non-background pixels (catches "figure adrift in an empty frame").
 *  2. Annotation geometry (math_scene only) — KaTeX annotations must not land
 *     in the title/caption bands at the window edges, and their estimated
 *     boxes must not overlap each other (catches "label collides with the
 *     caption row / another panel").
 *
 *   node apps/web/scripts/visual-regression.mjs [caseId ...]
 *
 * Requires data/template-previews/ (run `npm run template-previews:export`).
 * Failing frames are kept under data/visual-regression/ for inspection.
 * Env: REMOTION_BROWSER_EXECUTABLE — see render-shots.mjs.
 */
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import zlib from "node:zlib";

const FLAGSHIP = [
  "derivative-tangent",
  "integral-area",
  "projectile",
  "spring-shm",
  "logistic-growth",
  "rabbit-chaos",
];
const requested = process.argv.slice(2);
const caseIds = requested.length > 0 ? requested : FLAGSHIP;

const previewsDir = path.resolve("../../data/template-previews");
const outDir = path.resolve("../../data/visual-regression");
const entryPoint = path.resolve("src/remotion/index.ts");
const publicDir = path.resolve("public");
const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE || undefined;

// Stage region of the 960×540 composition (excludes title row and the
// caption/subtitle bands) and the acceptance thresholds.
const STAGE = { left: 48, right: 912, top: 60, bottom: 420 };
// A frame is flagged only when it is BOTH faint and clustered: legitimately
// sparse teaching frames (eight Galileo dots, an n=4 staircase) spread their
// little ink across the stage, while a broken frame leaves a couple of
// slivers in one corner. Calibrated against both corpora — see
// scripts/visual-regression-calibration.md.
const MIN_CONTENT_RATIO = 0.013;
const MIN_CONTENT_SPREAD = 0.35;
const BG_TOLERANCE = 26;
const EDGE_BAND = 0.045;
// Rough KaTeX metrics in window-relative units for overlap estimation.
const CHAR_WIDTH_REL = 0.011;
const TEXT_HALF_HEIGHT_REL = 0.032;

/** Minimal PNG decoder: 8-bit RGB/RGBA, non-interlaced (what renderStill emits). */
export function decodePng(buffer) {
  let pos = 8;
  let width = 0;
  let height = 0;
  let colorType = 6;
  const idat = [];
  while (pos < buffer.length) {
    const length = buffer.readUInt32BE(pos);
    const type = buffer.toString("ascii", pos + 4, pos + 8);
    const data = buffer.subarray(pos + 8, pos + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8 || data[12] !== 0) throw new Error("unsupported PNG layout");
      colorType = data[9];
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    pos += 12 + length;
  }
  const channels = colorType === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = pixels.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? out[x - channels] : 0;
      const up = prev ? prev[x] : 0;
      const upLeft = prev && x >= channels ? prev[x - channels] : 0;
      let value = row[x];
      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        value += pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      }
      out[x] = value & 0xff;
    }
  }
  return { width, height, channels, pixels };
}

/**
 * Ink ratio plus how far that ink spreads: the fraction of the stage covered
 * by the content's bounding box. Sparse-but-healthy frames score low ink and
 * HIGH spread; broken frames score low on both.
 */
export function stageContentMetrics(image) {
  const { width, channels, pixels } = image;
  // Background sample: the top-left corner of the stage region.
  const bgIndex = (STAGE.top * width + STAGE.left) * channels;
  const bg = [pixels[bgIndex], pixels[bgIndex + 1], pixels[bgIndex + 2]];
  let content = 0;
  let total = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let y = STAGE.top; y < STAGE.bottom; y += 2) {
    for (let x = STAGE.left; x < STAGE.right; x += 2) {
      const index = (y * width + x) * channels;
      const delta = Math.max(
        Math.abs(pixels[index] - bg[0]),
        Math.abs(pixels[index + 1] - bg[1]),
        Math.abs(pixels[index + 2] - bg[2]),
      );
      total += 1;
      if (delta > BG_TOLERANCE) {
        content += 1;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  const spread = content === 0
    ? 0
    : ((maxX - minX) * (maxY - minY)) /
      ((STAGE.right - STAGE.left) * (STAGE.bottom - STAGE.top));
  return { ratio: content / total, spread };
}

function annotationFindings(snapshot) {
  if (snapshot.kind !== "math_scene") return [];
  const { x_min, x_max, y_min, y_max } = snapshot;
  const spanX = x_max - x_min;
  const spanY = y_max - y_min;
  if (!(spanX > 0) || !(spanY > 0)) return [];
  const boxes = (snapshot.annotations ?? []).map((annotation) => {
    const xRel = (annotation.x - x_min) / spanX;
    const yRel = (annotation.y - y_min) / spanY;
    const text = String(annotation.text ?? "");
    const chars = text.replace(/[\\${}^_]/g, "").length;
    return {
      role: annotation.semantic_role ?? "annotation",
      text,
      xRel,
      yRel,
      halfW: Math.max(0.02, (chars * CHAR_WIDTH_REL) / 2),
      halfH: TEXT_HALF_HEIGHT_REL,
    };
  });
  const findings = [];
  for (const box of boxes) {
    if (box.yRel < EDGE_BAND || box.yRel > 1 - EDGE_BAND || box.xRel < 0.02 || box.xRel > 0.98) {
      findings.push(
        `annotation "${box.text}" (${box.role}) sits in the chrome band at rel (${box.xRel.toFixed(2)}, ${box.yRel.toFixed(2)})`,
      );
    }
  }
  for (let a = 0; a < boxes.length; a += 1) {
    for (let b = a + 1; b < boxes.length; b += 1) {
      const first = boxes[a];
      const second = boxes[b];
      if (
        Math.abs(first.xRel - second.xRel) < first.halfW + second.halfW &&
        Math.abs(first.yRel - second.yRel) < first.halfH + second.halfH
      ) {
        findings.push(
          `annotations "${first.text}" and "${second.text}" overlap near rel (${first.xRel.toFixed(2)}, ${first.yRel.toFixed(2)})`,
        );
      }
    }
  }
  return findings;
}

// Importable as a library (calibration harness) or runnable as the gate.
const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? "").href;
if (!isMain) {
  // eslint-disable-next-line no-empty-function
} else {
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
const serveUrl = await bundle({ entryPoint, publicDir });
const failures = [];
let framesChecked = 0;

for (const caseId of caseIds) {
  const playbookPath = path.join(previewsDir, `${caseId}.playbook.json`);
  if (!fs.existsSync(playbookPath)) {
    failures.push(`${caseId}: missing ${playbookPath} — run template-previews:export first`);
    continue;
  }
  const script = JSON.parse(fs.readFileSync(playbookPath, "utf8"));
  const inputProps = { script, director: null, theme: "light", showSubtitles: true, audioFiles: [] };
  const composition = await selectComposition({ serveUrl, id: "playbook", inputProps, browserExecutable });

  let stepStart = 0;
  for (const [index, step] of script.steps.entries()) {
    const settled = Math.min(stepStart + 66, step.end_frame - 1);
    const middle = Math.min(stepStart + Math.floor((step.end_frame - stepStart) / 2), step.end_frame - 1);
    for (const frame of new Set([settled, middle])) {
      const output = path.join(outDir, `${caseId}-step${index}-f${frame}.png`);
      await renderStill({ composition, serveUrl, output, frame, inputProps, imageFormat: "png", browserExecutable });
      framesChecked += 1;
      const image = decodePng(fs.readFileSync(output));
      const { ratio, spread } = stageContentMetrics(image);
      const problems = [];
      if (ratio < MIN_CONTENT_RATIO && spread < MIN_CONTENT_SPREAD) {
        problems.push(
          `stage nearly blank (ink ${(ratio * 100).toFixed(2)}%, spread ${(spread * 100).toFixed(1)}%)`,
        );
      }
      problems.push(...annotationFindings(step.snapshot));
      if (problems.length > 0) {
        for (const problem of problems) {
          failures.push(`${caseId} step ${index + 1} (${step.step_id}) @${frame}: ${problem}`);
        }
      } else {
        fs.rmSync(output, { force: true });
      }
    }
    stepStart = step.end_frame;
  }
  console.log(`[visual] ${caseId}: checked`);
}

console.log(`[visual] ${framesChecked} frames checked across ${caseIds.length} case(s)`);
if (failures.length > 0) {
  console.error(`[visual] ${failures.length} finding(s):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  console.error(`[visual] offending frames kept in ${outDir}`);
  process.exit(1);
}
console.log("[visual] all clear");
}
