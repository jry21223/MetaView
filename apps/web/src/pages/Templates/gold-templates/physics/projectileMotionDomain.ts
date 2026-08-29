export const PROJECTILE_DEFAULTS = Object.freeze({
  speed: 20,
  angle: 45,
  gravity: 9.8,
});

export const PROJECTILE_LIMITS = Object.freeze({
  speed: Object.freeze({ min: 0, max: 50 }),
  angle: Object.freeze({ min: 0, max: 90 }),
  gravity: Object.freeze({ min: 1.6, max: 20 }),
});

const EPSILON = 1e-9;

export type ProjectileBoundaryCase =
  | "regular"
  | "stationary"
  | "ground-tangent"
  | "vertical-launch";

export interface ProjectileInput {
  speed: number;
  angle: number;
  gravity: number;
}

export interface ProjectileState extends ProjectileInput {
  radians: number;
  vx: number;
  vy0: number;
  apexTime: number;
  flightTime: number;
  range: number;
  maxHeight: number;
  boundaryCase: ProjectileBoundaryCase;
}

export interface ProjectileKinematics {
  time: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  speed: number;
}

function finiteOr(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function cleanZero(value: number): number {
  return Math.abs(value) < EPSILON ? 0 : value;
}

export function normalizeProjectileInput(
  input: Partial<Record<keyof ProjectileInput, unknown>>,
): ProjectileInput {
  return {
    speed: clamp(
      finiteOr(input.speed, PROJECTILE_DEFAULTS.speed),
      PROJECTILE_LIMITS.speed.min,
      PROJECTILE_LIMITS.speed.max,
    ),
    angle: clamp(
      finiteOr(input.angle, PROJECTILE_DEFAULTS.angle),
      PROJECTILE_LIMITS.angle.min,
      PROJECTILE_LIMITS.angle.max,
    ),
    gravity: clamp(
      finiteOr(input.gravity, PROJECTILE_DEFAULTS.gravity),
      PROJECTILE_LIMITS.gravity.min,
      PROJECTILE_LIMITS.gravity.max,
    ),
  };
}

export function solveProjectile(
  input: Partial<Record<keyof ProjectileInput, unknown>>,
): ProjectileState {
  const normalized = normalizeProjectileInput(input);
  const radians = normalized.angle * Math.PI / 180;
  const vx = cleanZero(normalized.speed * Math.cos(radians));
  const vy0 = cleanZero(normalized.speed * Math.sin(radians));
  const apexTime = vy0 / normalized.gravity;
  const flightTime = 2 * apexTime;
  const range = cleanZero(vx * flightTime);
  const maxHeight = cleanZero(vy0 ** 2 / (2 * normalized.gravity));
  const boundaryCase: ProjectileBoundaryCase = normalized.speed === 0
    ? "stationary"
    : vy0 === 0
      ? "ground-tangent"
      : vx === 0
        ? "vertical-launch"
        : "regular";

  return {
    ...normalized,
    radians,
    vx,
    vy0,
    apexTime,
    flightTime,
    range,
    maxHeight,
    boundaryCase,
  };
}

export function projectileAtTime(
  state: ProjectileState,
  requestedTime: number,
): ProjectileKinematics {
  const upperBound = Math.max(0, state.flightTime);
  const time = clamp(finiteOr(requestedTime, 0), 0, upperBound);
  const vy = cleanZero(state.vy0 - state.gravity * time);
  return {
    time,
    x: cleanZero(state.vx * time),
    y: cleanZero(Math.max(0, state.vy0 * time - 0.5 * state.gravity * time ** 2)),
    vx: state.vx,
    vy,
    speed: Math.hypot(state.vx, vy),
  };
}

export function projectileAtFraction(
  state: ProjectileState,
  fraction: number,
): ProjectileKinematics {
  const normalizedFraction = clamp(finiteOr(fraction, 0), 0, 1);
  return projectileAtTime(state, state.flightTime * normalizedFraction);
}

export function sampleProjectile(
  state: ProjectileState,
  sampleCount = 49,
): ProjectileKinematics[] {
  const count = Math.max(2, Math.min(241, Math.round(finiteOr(sampleCount, 49))));
  return Array.from({ length: count }, (_, index) =>
    projectileAtFraction(state, index / (count - 1))
  );
}

/**
 * The physics stage is 16:9, so the scene declares a matching 168-wide space
 * (see PhysicsForceSceneSnapshot.scene_width) instead of the legacy square:
 * a flat trajectory now uses the whole frame rather than its middle third.
 */
export const PROJECTILE_SCENE_WIDTH = 168;
/** Vertical band left free by the title and caption chrome. */
const SCENE_TOP = 26;
const SCENE_BOTTOM_MAX = 80;
const SCENE_WIDTH = PROJECTILE_SCENE_WIDTH - 20;

interface ProjectileSceneLayout {
  scale: number;
  baseline: number;
  startX: number;
}

/**
 * Shared scene layout: one common metre scale on both axes (so steep and
 * shallow launches stay visually honest), sized to the full usable band and
 * vertically centred in it — a flat 45° arc no longer hugs the bottom edge.
 */
function projectileSceneLayout(state: ProjectileState): ProjectileSceneLayout {
  const horizontalExtent = state.range;
  const verticalExtent = state.maxHeight;
  const band = SCENE_BOTTOM_MAX - SCENE_TOP;
  const extentScale = Math.min(
    horizontalExtent > EPSILON ? SCENE_WIDTH / horizontalExtent : Number.POSITIVE_INFINITY,
    verticalExtent > EPSILON ? band / verticalExtent : Number.POSITIVE_INFINITY,
  );
  const scale = Number.isFinite(extentScale) ? extentScale : 1;
  const usedHeight = verticalExtent * scale;
  const baseline = SCENE_BOTTOM_MAX - (band - usedHeight) / 2;
  const startX = PROJECTILE_SCENE_WIDTH / 2 - (horizontalExtent * scale) / 2;
  return { scale, baseline, startX };
}

/** Scene-space y of the ground for this launch (the trajectory's baseline). */
export function projectileSceneBaseline(state: ProjectileState): number {
  return Number(projectileSceneLayout(state).baseline.toFixed(4));
}

/** Converts real metre coordinates into the renderer's 0-100 teaching canvas. */
export function projectileSceneTrajectory(
  state: ProjectileState,
  sampleCount = 49,
): Array<[number, number]> {
  const { scale, baseline, startX } = projectileSceneLayout(state);
  return sampleProjectile(state, sampleCount).map((point) => [
    Number((startX + point.x * scale).toFixed(4)),
    Number((baseline - point.y * scale).toFixed(4)),
  ]);
}

export function projectileScenePoint(
  state: ProjectileState,
  fraction: number,
): [number, number] {
  const trajectory = projectileSceneTrajectory(state);
  const index = Math.round(
    clamp(finiteOr(fraction, 0), 0, 1) * (trajectory.length - 1),
  );
  return trajectory[index];
}
