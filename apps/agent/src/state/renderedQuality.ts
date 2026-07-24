import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { inflateSync } from "node:zlib";

import type { PlaybookOutput } from "./types.js";

export interface RenderedQualityIssue {
  code: string;
  severity: "warning" | "error";
  step_index?: number;
  frame?: number;
  message: string;
  suggestion: string;
}

export interface RenderedQualityReport {
  status: "clean" | "warnings" | "blocked";
  issues: RenderedQualityIssue[];
  metrics: {
    frame_count: number;
    minimum_content_occupancy: number;
    maximum_edge_content_ratio: number;
    minimum_consecutive_pixel_delta: number;
    exact_duplicate_pair_count: number;
  };
  frames: Array<{
    step_index: number;
    frame: number;
    width: number;
    height: number;
    content_occupancy: number;
    edge_content_ratio: number;
    sha256: string;
  }>;
}

export interface RenderedQualityOptions {
  enabled?: boolean;
  repoRoot?: string;
  theme?: "dark" | "light";
  maximumFrames?: number;
}

const execFileAsync = promisify(execFile);

export async function validateRenderedQuality(
  playbook: PlaybookOutput,
  options: RenderedQualityOptions = {},
): Promise<RenderedQualityReport> {
  if (options.enabled === false) return emptyReport();
  const repoRoot = resolve(options.repoRoot ?? process.cwd());
  const scriptPath = join(repoRoot, "apps", "web", "scripts", "render-shots.mjs");
  const workspaceRoot = join(repoRoot, "eval", "shots");
  await mkdir(workspaceRoot, { recursive: true });
  const runDir = await mkdtemp(join(workspaceRoot, "agent-quality-")).catch(async () => {
    return mkdtemp(join(tmpdir(), "metaview-agent-quality-"));
  });
  const playbookPath = join(runDir, "playbook.json");
  await writeFile(playbookPath, `${JSON.stringify(playbook, null, 2)}\n`, "utf8");

  const selections = representativeFrames(playbook, options.maximumFrames ?? 14);
  const decoded: DecodedFrame[] = [];
  for (const selection of selections) {
    const outDir = join(runDir, `step-${String(selection.stepIndex + 1).padStart(2, "0")}`);
    await mkdir(outDir, { recursive: true });
    await execFileAsync(process.execPath, [scriptPath, playbookPath, outDir], {
      cwd: repoRoot,
      env: {
        ...process.env,
        SHOT_FRAME: String(selection.frame),
        SHOT_LABEL: `agent-quality-${selection.stepIndex + 1}`,
        SHOT_THEME: options.theme ?? "dark",
      },
      maxBuffer: 20 * 1024 * 1024,
    });
    const files = (await readdir(outDir)).filter((file) => file.endsWith(".png")).sort();
    if (!files[0]) throw new Error(`rendered quality gate produced no PNG for step ${selection.stepIndex}`);
    const png = await readFile(join(outDir, files[0]));
    const image = decodePng(png);
    decoded.push({ ...selection, ...image, sha256: createHash("sha256").update(png).digest("hex") });
  }
  return analyzeRenderedFrames(decoded, playbook);
}

export interface DecodedFrame {
  stepIndex: number;
  frame: number;
  width: number;
  height: number;
  rgba: Uint8Array;
  sha256?: string;
}

export function analyzeRenderedFrames(
  frames: DecodedFrame[],
  playbook?: PlaybookOutput,
): RenderedQualityReport {
  const issues: RenderedQualityIssue[] = [];
  const rows = frames.map((frame) => {
    const metrics = visualMetrics(frame);
    if (metrics.contentOccupancy < 0.015) {
      issues.push({
        code: "visual.content_too_sparse",
        severity: "error",
        step_index: frame.stepIndex,
        frame: frame.frame,
        message: `Rendered content occupancy is ${(metrics.contentOccupancy * 100).toFixed(2)}%.`,
        suggestion: "Increase the visible teaching content or use a more appropriate scene compiler.",
      });
    }
    if (metrics.edgeContentRatio > 0.03) {
      issues.push({
        code: "visual.content_clipped",
        severity: "error",
        step_index: frame.stepIndex,
        frame: frame.frame,
        message: `Too much non-background content touches the viewport edge (${(metrics.edgeContentRatio * 100).toFixed(2)}%).`,
        suggestion: "Recompute layout/camera safe bounds so labels and geometry remain inside the viewport.",
      });
    }
    return {
      step_index: frame.stepIndex,
      frame: frame.frame,
      width: frame.width,
      height: frame.height,
      content_occupancy: round(metrics.contentOccupancy),
      edge_content_ratio: round(metrics.edgeContentRatio),
      sha256: frame.sha256 ?? hashPixels(frame.rgba),
    };
  });

  const deltas: number[] = [];
  let duplicatePairs = 0;
  for (let index = 1; index < frames.length; index += 1) {
    const previous = frames[index - 1];
    const current = frames[index];
    if (previous.width !== current.width || previous.height !== current.height) {
      issues.push({
        code: "visual.viewport_mismatch",
        severity: "error",
        step_index: current.stepIndex,
        frame: current.frame,
        message: "Representative frames were rendered at inconsistent dimensions.",
        suggestion: "Use one canonical composition viewport throughout the lesson.",
      });
      continue;
    }
    const delta = pixelDelta(previous.rgba, current.rgba);
    deltas.push(delta);
    if ((previous.sha256 ?? hashPixels(previous.rgba)) === (current.sha256 ?? hashPixels(current.rgba))) {
      duplicatePairs += 1;
    }
    const narrationChanged = Boolean(
      playbook &&
        playbook.steps[previous.stepIndex]?.voiceover_text.trim() !==
          playbook.steps[current.stepIndex]?.voiceover_text.trim(),
    );
    if (delta < 0.002 && narrationChanged) {
      issues.push({
        code: "scene.progression_missing",
        severity: "error",
        step_index: current.stepIndex,
        frame: current.frame,
        message: `Consecutive rendered frames differ by only ${(delta * 100).toFixed(3)}% of pixels while narration changes.`,
        suggestion: "Add a semantic checkpoint state delta or remove the redundant narrated step.",
      });
    }
  }

  const status = issues.some((issue) => issue.severity === "error")
    ? "blocked"
    : issues.length > 0
      ? "warnings"
      : "clean";
  return {
    status,
    issues,
    metrics: {
      frame_count: frames.length,
      minimum_content_occupancy: round(Math.min(...rows.map((row) => row.content_occupancy), 1)),
      maximum_edge_content_ratio: round(Math.max(...rows.map((row) => row.edge_content_ratio), 0)),
      minimum_consecutive_pixel_delta: round(Math.min(...deltas, 1)),
      exact_duplicate_pair_count: duplicatePairs,
    },
    frames: rows,
  };
}

function representativeFrames(
  playbook: PlaybookOutput,
  maximumFrames: number,
): Array<{ stepIndex: number; frame: number }> {
  const selections: Array<{ stepIndex: number; frame: number }> = [];
  let start = 0;
  for (let index = 0; index < playbook.steps.length; index += 1) {
    const end = playbook.steps[index].end_frame;
    const frame = Math.max(start, Math.min(end - 1, Math.round(start + (end - start) * 0.8)));
    selections.push({ stepIndex: index, frame });
    start = end;
  }
  if (selections.length <= maximumFrames) return selections;
  return Array.from({ length: maximumFrames }, (_, index) => {
    const sourceIndex = Math.round((index * (selections.length - 1)) / (maximumFrames - 1));
    return selections[sourceIndex];
  });
}

function visualMetrics(frame: DecodedFrame): {
  contentOccupancy: number;
  edgeContentRatio: number;
} {
  const { width, height, rgba } = frame;
  const background = cornerBackground(width, height, rgba);
  let content = 0;
  let edge = 0;
  const edgeBand = Math.max(2, Math.round(Math.min(width, height) * 0.008));
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const alpha = rgba[offset + 3];
      const distance =
        Math.abs(rgba[offset] - background[0]) +
        Math.abs(rgba[offset + 1] - background[1]) +
        Math.abs(rgba[offset + 2] - background[2]);
      if (alpha <= 16 || distance <= 30) continue;
      content += 1;
      if (x < edgeBand || y < edgeBand || x >= width - edgeBand || y >= height - edgeBand) {
        edge += 1;
      }
    }
  }
  const total = Math.max(1, width * height);
  return {
    contentOccupancy: content / total,
    edgeContentRatio: content > 0 ? edge / content : 0,
  };
}

function cornerBackground(width: number, height: number, rgba: Uint8Array): [number, number, number] {
  const coordinates = [
    [0, 0],
    [Math.max(0, width - 1), 0],
    [0, Math.max(0, height - 1)],
    [Math.max(0, width - 1), Math.max(0, height - 1)],
  ];
  const sums = [0, 0, 0];
  for (const [x, y] of coordinates) {
    const offset = (y * width + x) * 4;
    sums[0] += rgba[offset];
    sums[1] += rgba[offset + 1];
    sums[2] += rgba[offset + 2];
  }
  return [Math.round(sums[0] / 4), Math.round(sums[1] / 4), Math.round(sums[2] / 4)];
}

function pixelDelta(left: Uint8Array, right: Uint8Array): number {
  const length = Math.min(left.length, right.length);
  if (length === 0) return 0;
  let changedPixels = 0;
  const pixels = Math.floor(length / 4);
  for (let offset = 0; offset < pixels * 4; offset += 4) {
    const distance =
      Math.abs(left[offset] - right[offset]) +
      Math.abs(left[offset + 1] - right[offset + 1]) +
      Math.abs(left[offset + 2] - right[offset + 2]) +
      Math.abs(left[offset + 3] - right[offset + 3]);
    if (distance > 24) changedPixels += 1;
  }
  return changedPixels / Math.max(1, pixels);
}

function hashPixels(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function round(value: number): number {
  return Number(value.toFixed(6));
}

function emptyReport(): RenderedQualityReport {
  return {
    status: "clean",
    issues: [],
    metrics: {
      frame_count: 0,
      minimum_content_occupancy: 1,
      maximum_edge_content_ratio: 0,
      minimum_consecutive_pixel_delta: 1,
      exact_duplicate_pair_count: 0,
    },
    frames: [],
  };
}

function decodePng(buffer: Uint8Array): { width: number; height: number; rgba: Uint8Array } {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!signature.every((value, index) => buffer[index] === value)) {
    throw new Error("rendered quality gate received a non-PNG file");
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat: Uint8Array[] = [];
  while (offset + 12 <= buffer.length) {
    const length = readUint32(buffer, offset);
    const type = String.fromCharCode(...buffer.slice(offset + 4, offset + 8));
    const data = buffer.slice(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = readUint32(data, 0);
      height = readUint32(data, 4);
      bitDepth = data[8];
      colorType = data[9];
      if (data[12] !== 0) throw new Error("interlaced PNG is not supported by the quality gate");
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    offset += length + 12;
  }
  if (!width || !height || bitDepth !== 8 || ![2, 6].includes(colorType)) {
    throw new Error(`unsupported PNG format: ${width}x${height}, depth=${bitDepth}, color=${colorType}`);
  }
  const compressed = concat(idat);
  const raw = inflateSync(compressed);
  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const reconstructed = new Uint8Array(height * stride);
  let rawOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[rawOffset++];
    const rowStart = y * stride;
    for (let x = 0; x < stride; x += 1) {
      const byte = raw[rawOffset++];
      const left = x >= channels ? reconstructed[rowStart + x - channels] : 0;
      const above = y > 0 ? reconstructed[rowStart - stride + x] : 0;
      const upperLeft = y > 0 && x >= channels ? reconstructed[rowStart - stride + x - channels] : 0;
      reconstructed[rowStart + x] = unfilter(filter, byte, left, above, upperLeft);
    }
  }
  const rgba = new Uint8Array(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const source = pixel * channels;
    const target = pixel * 4;
    rgba[target] = reconstructed[source];
    rgba[target + 1] = reconstructed[source + 1];
    rgba[target + 2] = reconstructed[source + 2];
    rgba[target + 3] = channels === 4 ? reconstructed[source + 3] : 255;
  }
  return { width, height, rgba };
}

function unfilter(filter: number, value: number, left: number, above: number, upperLeft: number): number {
  switch (filter) {
    case 0:
      return value;
    case 1:
      return (value + left) & 255;
    case 2:
      return (value + above) & 255;
    case 3:
      return (value + Math.floor((left + above) / 2)) & 255;
    case 4:
      return (value + paeth(left, above, upperLeft)) & 255;
    default:
      throw new Error(`unsupported PNG row filter ${filter}`);
  }
}

function paeth(left: number, above: number, upperLeft: number): number {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left;
  if (aboveDistance <= upperLeftDistance) return above;
  return upperLeft;
}

function readUint32(buffer: Uint8Array, offset: number): number {
  return (
    buffer[offset] * 0x1000000 +
    (buffer[offset + 1] << 16) +
    (buffer[offset + 2] << 8) +
    buffer[offset + 3]
  ) >>> 0;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}
