#!/usr/bin/env node
/**
 * Render every subject-visual showcase fixture once and fail if the PNG output
 * is missing, tiny, visually blank, or below its fixture-specific baseline.
 *
 * This is a smoke/golden-adjacent gate: it does not compare committed images,
 * but it proves every flagship fixture still reaches the Remotion renderer and
 * produces a nonblank frame from the checked-in asset metadata.
 */
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

import { visualQualityGate } from "../src/features/playbook/engine/assets/visualQualityGate.ts";
import {
  analyzeShowcaseImageQuality,
  getShowcaseImageQualityIssues,
} from "../src/features/playbook/engine/fixtures/showcaseImageQuality.ts";
import { listSubjectVisualShowcaseEntries } from "../src/features/playbook/engine/fixtures/subjectVisualShowcase.ts";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const outDir = path.resolve(process.argv[2] ?? "../../eval/shots/subject-visual-showcase-smoke");
const theme = process.env.SHOWCASE_SMOKE_THEME ?? "light";
const entry = process.env.REMOTION_ENTRY ?? path.resolve("../../apps/web/src/remotion/index.ts");
const publicDir = process.env.REMOTION_PUBLIC_DIR ?? path.resolve("../../apps/web/public");

function paethPredictor(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function readPng(buffer) {
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error("invalid PNG signature");
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatChunks = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;

    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data.readUInt8(8);
      colorType = data.readUInt8(9);
    } else if (type === "IDAT") {
      idatChunks.push(data);
    } else if (type === "IEND") {
      break;
    }
  }

  if (bitDepth !== 8 || ![2, 6].includes(colorType)) {
    throw new Error(`unsupported PNG format: bitDepth=${bitDepth} colorType=${colorType}`);
  }

  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const inflated = zlib.inflateSync(Buffer.concat(idatChunks));
  const pixels = Buffer.alloc(width * height * channels);
  let source = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[source];
    source += 1;
    const rowStart = y * stride;
    const prevRowStart = rowStart - stride;
    for (let x = 0; x < stride; x += 1) {
      const raw = inflated[source + x];
      const left = x >= channels ? pixels[rowStart + x - channels] : 0;
      const up = y > 0 ? pixels[prevRowStart + x] : 0;
      const upLeft = y > 0 && x >= channels ? pixels[prevRowStart + x - channels] : 0;
      let value = raw;
      if (filter === 1) value = raw + left;
      else if (filter === 2) value = raw + up;
      else if (filter === 3) value = raw + Math.floor((left + up) / 2);
      else if (filter === 4) value = raw + paethPredictor(left, up, upLeft);
      else if (filter !== 0) throw new Error(`unsupported PNG filter: ${filter}`);
      pixels[rowStart + x] = value & 0xff;
    }
    source += stride;
  }

  return { width, height, channels, pixels };
}

function pngStats(filePath) {
  const file = fs.readFileSync(filePath);
  const png = readPng(file);
  return analyzeShowcaseImageQuality({
    width: png.width,
    height: png.height,
    channels: png.channels,
    pixels: png.pixels,
    bytes: file.length,
  });
}

function representativeFrame(script) {
  const firstStep = Array.isArray(script.steps) ? script.steps[0] : null;
  const endFrame = Number(firstStep?.end_frame ?? script.total_frames ?? 1);
  return Math.max(0, Math.min(Math.max(0, endFrame - 1), Math.round(endFrame * 0.85)));
}

fs.mkdirSync(outDir, { recursive: true });
const entries = listSubjectVisualShowcaseEntries();
const selectedIds = new Set(
  (process.env.SHOWCASE_SMOKE_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean),
);
const selectedEntries = selectedIds.size
  ? entries.filter((entryItem) => selectedIds.has(entryItem.id))
  : entries;

if (selectedEntries.length === 0) {
  console.error("[showcase:smoke] no showcase entries selected");
  process.exit(1);
}

console.log(`[showcase:smoke] bundling ${entry} ...`);
const serveUrl = await bundle({ entryPoint: entry, publicDir });

const summary = [];
for (const showcaseEntry of selectedEntries) {
  const warnings = visualQualityGate(showcaseEntry.script);
  if (warnings.length > 0) {
    throw new Error(`[showcase:smoke] ${showcaseEntry.id} visualQualityGate warnings: ${JSON.stringify(warnings)}`);
  }

  const inputProps = {
    script: showcaseEntry.script,
    theme,
    showInlineCode: showcaseEntry.showInlineCode,
    showSubtitles: false,
    audioFiles: [],
  };
  const composition = await selectComposition({ serveUrl, id: "playbook", inputProps });
  const frame = Math.min(representativeFrame(showcaseEntry.script), Math.max(0, composition.durationInFrames - 1));
  const output = path.join(outDir, `${showcaseEntry.id}.png`);
  await renderStill({ composition, serveUrl, output, frame, inputProps });

  const stats = pngStats(output);
  const imageQualityIssues = getShowcaseImageQualityIssues(stats, showcaseEntry.imageQuality);
  if (imageQualityIssues.length > 0) {
    throw new Error(
      `[showcase:smoke] ${showcaseEntry.id} rendered suspicious PNG: ${JSON.stringify({
        issues: imageQualityIssues,
        thresholds: showcaseEntry.imageQuality,
        stats,
      })}`,
    );
  }

  summary.push({ id: showcaseEntry.id, frame, output, imageQuality: showcaseEntry.imageQuality, ...stats });
  console.log(
    `[showcase:smoke] ${showcaseEntry.id} @frame ${frame} -> ${output} ` +
      `(${stats.width}x${stats.height}, ${stats.uniqueColors} colors, ` +
      `${(stats.contentPixelRatio * 100).toFixed(1)}% content)`,
  );
}

const summaryPath = path.join(outDir, "summary.json");
fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
console.log(`[showcase:smoke] passed ${summary.length} fixtures -> ${summaryPath}`);
