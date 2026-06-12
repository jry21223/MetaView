export const BRAND_LOGO_LOOP_FPS = 30;
export const BRAND_LOGO_LOOP_SECONDS = 4;
export const BRAND_LOGO_LOOP_DURATION_FRAMES =
  BRAND_LOGO_LOOP_FPS * BRAND_LOGO_LOOP_SECONDS;
export const BRAND_LOGO_LOOP_SIZE = 640;

type Point = {
  x: number;
  y: number;
};

export type BrandLogoLoopState = {
  borderProgress: number;
  markProgress: number;
  guideOpacity: number;
  logoOpacity: number;
  dot: Point;
  dotScale: number;
  ringOpacity: number;
  ringScale: number;
};

export const BRAND_LOGO_LOOP_FINAL_DOT: Point = { x: 530, y: 300 };
const BORDER_START: Point = { x: 108, y: 54 };
const MARK_START: Point = { x: 150, y: 430 };

const MARK_ROUTE: Point[] = [
  { x: 150, y: 430 },
  { x: 150, y: 210 },
  { x: 255, y: 345 },
  { x: 360, y: 210 },
  { x: 470, y: 430 },
  { x: 530, y: 300 },
];

function makeRoundedRectRoute(): Point[] {
  const left = 54;
  const top = 54;
  const right = 586;
  const bottom = 586;
  const radius = 54;
  const samples = 8;
  const points: Point[] = [
    { x: left + radius, y: top },
    { x: right - radius, y: top },
  ];
  const addArc = (cx: number, cy: number, from: number, to: number) => {
    for (let i = 1; i <= samples; i += 1) {
      const t = i / samples;
      const angle = from + (to - from) * t;
      points.push({
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius,
      });
    }
  };

  addArc(right - radius, top + radius, -Math.PI / 2, 0);
  points.push({ x: right, y: bottom - radius });
  addArc(right - radius, bottom - radius, 0, Math.PI / 2);
  points.push({ x: left + radius, y: bottom });
  addArc(left + radius, bottom - radius, Math.PI / 2, Math.PI);
  points.push({ x: left, y: top + radius });
  addArc(left + radius, top + radius, Math.PI, (Math.PI * 3) / 2);

  return points;
}

const BORDER_ROUTE = makeRoundedRectRoute();

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function easeInCubic(value: number): number {
  return value * value * value;
}

function easeOutCubic(value: number): number {
  return 1 - Math.pow(1 - value, 3);
}

function easeInOutCubic(value: number): number {
  return value < 0.5
    ? 4 * value * value * value
    : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function progressBetween(
  seconds: number,
  startSeconds: number,
  endSeconds: number,
  easing: (value: number) => number = easeInOutCubic,
): number {
  return easing(clamp01((seconds - startSeconds) / (endSeconds - startSeconds)));
}

function lerp(from: number, to: number, progress: number): number {
  return from + (to - from) * progress;
}

function lerpPoint(from: Point, to: Point, progress: number): Point {
  return {
    x: lerp(from.x, to.x, progress),
    y: lerp(from.y, to.y, progress),
  };
}

export function pointOnPolyline(points: readonly Point[], progress: number): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return points[0];

  const segments = points.slice(1).map((point, index) => {
    const previous = points[index];
    const length = Math.hypot(point.x - previous.x, point.y - previous.y);
    return { from: previous, to: point, length };
  });
  const totalLength = segments.reduce((sum, segment) => sum + segment.length, 0);
  const target = clamp01(progress) * totalLength;
  let travelled = 0;

  for (const segment of segments) {
    if (travelled + segment.length >= target) {
      const local =
        segment.length === 0 ? 0 : (target - travelled) / segment.length;
      return lerpPoint(segment.from, segment.to, local);
    }
    travelled += segment.length;
  }

  return points[points.length - 1];
}

export function getBrandLogoLoopState(
  frame: number,
  fps = BRAND_LOGO_LOOP_FPS,
): BrandLogoLoopState {
  const durationFrames = BRAND_LOGO_LOOP_SECONDS * fps;
  const cycleFrame = ((frame % durationFrames) + durationFrames) % durationFrames;
  const seconds = cycleFrame / fps;
  const launch = progressBetween(seconds, 0.28, 0.58, easeInOutCubic);
  const borderProgress = progressBetween(seconds, 0.58, 1.42, easeInOutCubic);
  const dive = progressBetween(seconds, 1.42, 1.68, easeInOutCubic);
  const markProgress = progressBetween(seconds, 1.68, 3.08, easeInOutCubic);
  const settle = progressBetween(seconds, 3.08, 3.5, easeOutCubic);
  const fade = progressBetween(
    seconds,
    3.52,
    BRAND_LOGO_LOOP_SECONDS,
    easeInCubic,
  );

  let dot = BRAND_LOGO_LOOP_FINAL_DOT;
  if (seconds >= 0.28 && seconds < 0.58) {
    dot = lerpPoint(BRAND_LOGO_LOOP_FINAL_DOT, BORDER_START, launch);
  } else if (seconds >= 0.58 && seconds < 1.42) {
    dot = pointOnPolyline(BORDER_ROUTE, borderProgress);
  } else if (seconds >= 1.42 && seconds < 1.68) {
    dot = lerpPoint(BORDER_START, MARK_START, dive);
  } else if (seconds >= 1.68 && seconds < 3.08) {
    dot = pointOnPolyline(MARK_ROUTE, markProgress);
  }

  const drawPresence = Math.max(borderProgress * 0.7, markProgress);
  const logoOpacity = clamp01(drawPresence) * (1 - fade);
  const guideOpacity = lerp(0.16, 0.05, clamp01(drawPresence)) + fade * 0.12;
  const ringOpacity =
    (0.28 + settle * 0.46 + fade * 0.16) *
    (seconds < 0.28 ? 1 : 1 - fade * 0.25);

  return {
    borderProgress,
    markProgress,
    guideOpacity,
    logoOpacity,
    dot,
    dotScale: 0.92 + settle * 0.14 - fade * 0.08,
    ringOpacity: clamp01(ringOpacity),
    ringScale: 1 + settle * 0.18 + fade * 0.08,
  };
}
