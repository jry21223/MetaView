import { describe, expect, it } from "vitest";

import { analyzeShowcaseImageQuality, getShowcaseImageQualityIssues } from "./showcaseImageQuality";

const WHITE: readonly [number, number, number, number] = [255, 255, 255, 255];

function makeImage(width: number, height: number, fill: readonly [number, number, number, number]) {
  const channels = 4;
  const pixels = new Uint8Array(width * height * channels);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const index = pixel * channels;
    pixels[index] = fill[0];
    pixels[index + 1] = fill[1];
    pixels[index + 2] = fill[2];
    pixels[index + 3] = fill[3];
  }
  return { width, height, channels, pixels };
}

function paintRect(
  image: ReturnType<typeof makeImage>,
  x: number,
  y: number,
  width: number,
  height: number,
  color: readonly [number, number, number, number],
) {
  for (let row = y; row < y + height; row += 1) {
    for (let column = x; column < x + width; column += 1) {
      const index = (row * image.width + column) * image.channels;
      image.pixels[index] = color[0];
      image.pixels[index + 1] = color[1];
      image.pixels[index + 2] = color[2];
      image.pixels[index + 3] = color[3];
    }
  }
}

describe("showcaseImageQuality", () => {
  it("measures content bounds against the dominant background", () => {
    const image = makeImage(10, 10, WHITE);
    paintRect(image, 4, 3, 2, 2, [210, 36, 36, 255]);

    const stats = analyzeShowcaseImageQuality({ ...image, bytes: 4096 });

    expect(stats.dominantColor).toEqual({ red: 255, green: 255, blue: 255, alpha: 255 });
    expect(stats.contentBounds).toEqual({ x: 4, y: 3, width: 2, height: 2 });
    expect(stats.contentPixelRatio).toBeCloseTo(0.04);
    expect(stats.contentWidthRatio).toBeCloseTo(0.2);
    expect(stats.contentHeightRatio).toBeCloseTo(0.2);
  });

  it("flags tiny content even when the PNG is opaque", () => {
    const image = makeImage(100, 100, WHITE);
    paintRect(image, 3, 4, 5, 5, [24, 88, 170, 255]);

    const stats = analyzeShowcaseImageQuality({ ...image, bytes: 50000 });
    const issues = getShowcaseImageQualityIssues(stats, {
      minWidth: 100,
      minHeight: 100,
      minBytes: 1000,
      minUniqueColors: 1,
      minNonTransparentRatio: 0.95,
      minContentPixelRatio: 0.01,
      minContentWidthRatio: 0.25,
      minContentHeightRatio: 0.2,
    });

    expect(issues).toEqual(
      expect.arrayContaining(["content_pixel_ratio", "content_width_ratio", "content_height_ratio"]),
    );
  });

  it("accepts content that occupies a meaningful central area", () => {
    const image = makeImage(100, 100, WHITE);
    paintRect(image, 20, 25, 60, 40, [20, 116, 160, 255]);

    const stats = analyzeShowcaseImageQuality({ ...image, bytes: 50000 });
    const issues = getShowcaseImageQualityIssues(stats, {
      minWidth: 100,
      minHeight: 100,
      minBytes: 1000,
      minUniqueColors: 2,
      minNonTransparentRatio: 0.95,
      minContentPixelRatio: 0.01,
      minContentWidthRatio: 0.25,
      minContentHeightRatio: 0.2,
    });

    expect(issues).toEqual([]);
  });
});
