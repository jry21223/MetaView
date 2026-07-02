export interface ShowcaseImageQualityInput {
  width: number;
  height: number;
  channels: number;
  pixels: Uint8Array;
  bytes?: number;
}

export interface ShowcaseImageBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ShowcaseImageColor {
  red: number;
  green: number;
  blue: number;
  alpha: number;
}

export interface ShowcaseImageQualityStats {
  width: number;
  height: number;
  bytes: number;
  uniqueColors: number;
  nonTransparentRatio: number;
  dominantColor: ShowcaseImageColor;
  contentBounds: ShowcaseImageBounds | null;
  contentPixelRatio: number;
  contentWidthRatio: number;
  contentHeightRatio: number;
}

export interface ShowcaseImageQualityThresholds {
  minWidth: number;
  minHeight: number;
  minBytes: number;
  minUniqueColors: number;
  minNonTransparentRatio: number;
  minContentPixelRatio: number;
  minContentWidthRatio: number;
  minContentHeightRatio: number;
}

export type ShowcaseImageQualityIssue =
  | "width"
  | "height"
  | "bytes"
  | "unique_colors"
  | "non_transparent_ratio"
  | "content_pixel_ratio"
  | "content_width_ratio"
  | "content_height_ratio";

export const DEFAULT_SHOWCASE_IMAGE_QUALITY_THRESHOLDS: ShowcaseImageQualityThresholds = {
  minWidth: 400,
  minHeight: 250,
  minBytes: 20000,
  minUniqueColors: 24,
  minNonTransparentRatio: 0.95,
  minContentPixelRatio: 0.012,
  minContentWidthRatio: 0.25,
  minContentHeightRatio: 0.18,
};

const SAMPLE_LIMIT = 5000;
const BACKGROUND_TOLERANCE = 22;

function getChannel(input: ShowcaseImageQualityInput, pixel: number, channel: number) {
  return input.pixels[pixel * input.channels + channel] ?? (channel === 3 ? 255 : 0);
}

function quantizeColor(value: number) {
  if (value >= 248) return 255;
  if (value <= 7) return 0;
  return Math.round(value / 16) * 16;
}

function colorKey(color: ShowcaseImageColor) {
  return `${quantizeColor(color.red)},${quantizeColor(color.green)},${quantizeColor(color.blue)},${
    color.alpha > 8 ? 255 : 0
  }`;
}

function colorFromKey(key: string): ShowcaseImageColor {
  const [red, green, blue, alpha] = key.split(",").map((part) => Number(part));
  return { red, green, blue, alpha };
}

function colorDistance(a: ShowcaseImageColor, b: ShowcaseImageColor) {
  return Math.max(Math.abs(a.red - b.red), Math.abs(a.green - b.green), Math.abs(a.blue - b.blue));
}

function pixelColor(input: ShowcaseImageQualityInput, pixel: number): ShowcaseImageColor {
  return {
    red: getChannel(input, pixel, 0),
    green: getChannel(input, pixel, 1),
    blue: getChannel(input, pixel, 2),
    alpha: input.channels >= 4 ? getChannel(input, pixel, 3) : 255,
  };
}

function findDominantColor(input: ShowcaseImageQualityInput, step: number) {
  const counts = new Map<string, number>();
  let dominantKey = "255,255,255,255";
  let dominantCount = 0;

  for (let pixel = 0; pixel < input.width * input.height; pixel += step) {
    const key = colorKey(pixelColor(input, pixel));
    const count = (counts.get(key) ?? 0) + 1;
    counts.set(key, count);
    if (count > dominantCount) {
      dominantKey = key;
      dominantCount = count;
    }
  }

  return colorFromKey(dominantKey);
}

export function analyzeShowcaseImageQuality(input: ShowcaseImageQualityInput): ShowcaseImageQualityStats {
  const pixelCount = Math.max(0, input.width * input.height);
  const step = Math.max(1, Math.floor(pixelCount / SAMPLE_LIMIT));
  const colors = new Set<string>();
  let nonTransparentSamples = 0;
  let samples = 0;
  const dominantColor = findDominantColor(input, step);
  let contentPixels = 0;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = -1;
  let maxY = -1;

  for (let pixel = 0; pixel < pixelCount; pixel += step) {
    const color = pixelColor(input, pixel);
    if (color.alpha > 8) nonTransparentSamples += 1;
    colors.add(`${color.red},${color.green},${color.blue},${color.alpha}`);
    samples += 1;
  }

  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const color = pixelColor(input, pixel);
    const isContent = color.alpha > 8 && colorDistance(color, dominantColor) > BACKGROUND_TOLERANCE;
    if (!isContent) continue;

    const x = pixel % input.width;
    const y = Math.floor(pixel / input.width);
    contentPixels += 1;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  const contentBounds =
    contentPixels > 0
      ? {
          x: minX,
          y: minY,
          width: maxX - minX + 1,
          height: maxY - minY + 1,
        }
      : null;

  return {
    width: input.width,
    height: input.height,
    bytes: input.bytes ?? 0,
    uniqueColors: colors.size,
    nonTransparentRatio: samples > 0 ? nonTransparentSamples / samples : 0,
    dominantColor,
    contentBounds,
    contentPixelRatio: pixelCount > 0 ? contentPixels / pixelCount : 0,
    contentWidthRatio: contentBounds ? contentBounds.width / input.width : 0,
    contentHeightRatio: contentBounds ? contentBounds.height / input.height : 0,
  };
}

export function getShowcaseImageQualityIssues(
  stats: ShowcaseImageQualityStats,
  thresholds: ShowcaseImageQualityThresholds = DEFAULT_SHOWCASE_IMAGE_QUALITY_THRESHOLDS,
): ShowcaseImageQualityIssue[] {
  const issues: ShowcaseImageQualityIssue[] = [];

  if (stats.width < thresholds.minWidth) issues.push("width");
  if (stats.height < thresholds.minHeight) issues.push("height");
  if (stats.bytes < thresholds.minBytes) issues.push("bytes");
  if (stats.uniqueColors < thresholds.minUniqueColors) issues.push("unique_colors");
  if (stats.nonTransparentRatio < thresholds.minNonTransparentRatio) issues.push("non_transparent_ratio");
  if (stats.contentPixelRatio < thresholds.minContentPixelRatio) issues.push("content_pixel_ratio");
  if (stats.contentWidthRatio < thresholds.minContentWidthRatio) issues.push("content_width_ratio");
  if (stats.contentHeightRatio < thresholds.minContentHeightRatio) issues.push("content_height_ratio");

  return issues;
}
