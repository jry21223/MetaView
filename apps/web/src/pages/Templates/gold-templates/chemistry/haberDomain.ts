/**
 * N₂ + 3H₂ ⇌ 2NH₃ in a closed vessel: mass-action kinetics and equilibrium.
 *
 * Honest scope: ΔH = −92.4 kJ/mol is the textbook value, and the effect of
 * temperature on K follows the van 't Hoff equation with it. The absolute
 * K (0.1829 at the reference temperature) and the rate constant are teaching
 * values chosen so the default equilibrium is the round 0.6 / 1.8 / 0.8
 * mol/L; the time axis is schematic. Everything the lesson asserts —
 * direction of each shift, Q versus K, "weakens but does not cancel" — holds
 * for any positive K and k.
 */

export const HABER_DELTA_H_KJ = -92.4;
export const GAS_CONSTANT = 8.314;
/** Reference temperature for the teaching K, kelvin (≈ 427 °C). */
export const HABER_T_REF = 700;
/** K at T_REF, (mol/L)^-2: makes 1.0/3.0/0 relax to 0.6/1.8/0.8. */
export const HABER_K_REF = 0.64 / (0.6 * 1.8 ** 3);
/** Forward rate constant at T_REF (teaching value; time axis in schematic minutes). */
export const HABER_K_FORWARD = 0.012;

export interface HaberState {
  n2: number;
  h2: number;
  nh3: number;
}

export function reactionQuotient(state: HaberState): number {
  return (state.nh3 * state.nh3) / (state.n2 * state.h2 ** 3);
}

/** K at temperature T by van 't Hoff: higher T → smaller K for this exothermic reaction. */
export function equilibriumConstant(temperatureK: number): number {
  const exponent = ((-HABER_DELTA_H_KJ * 1000) / GAS_CONSTANT) * (1 / temperatureK - 1 / HABER_T_REF);
  return HABER_K_REF * Math.exp(exponent);
}

/** Equilibrium state reached from `start` at constant volume (bisection on the extent). */
export function solveEquilibrium(start: HaberState, k: number): HaberState {
  const at = (x: number): HaberState => ({ n2: start.n2 - x, h2: start.h2 - 3 * x, nh3: start.nh3 + 2 * x });
  let low = -start.nh3 / 2 + 1e-12;
  let high = Math.min(start.n2, start.h2 / 3) - 1e-12;
  // g(x) = ln Q(x) − ln K rises monotonically with the extent x.
  for (let i = 0; i < 200; i += 1) {
    const mid = (low + high) / 2;
    if (Math.log(reactionQuotient(at(mid))) < Math.log(k)) low = mid;
    else high = mid;
  }
  return at((low + high) / 2);
}

export interface HaberSegment {
  /** Time the segment starts at. */
  t0: number;
  t1: number;
  start: HaberState;
  k: number;
  /** Forward rate constant (catalyst or temperature can raise it). */
  kf: number;
}

/** RK4 integration of d[NH3]/dt = 2(kf[N2][H2]³ − kf/K [NH3]²). */
export function integrateSegment(segment: HaberSegment, dt = 0.01): Array<[number, HaberState]> {
  const kr = segment.kf / segment.k;
  const rate = (s: HaberState) => segment.kf * s.n2 * s.h2 ** 3 - kr * s.nh3 * s.nh3;
  const step = (s: HaberState, r: number, h: number): HaberState => ({ n2: s.n2 - r * h, h2: s.h2 - 3 * r * h, nh3: s.nh3 + 2 * r * h });
  const samples: Array<[number, HaberState]> = [[segment.t0, segment.start]];
  let state = segment.start;
  const count = Math.round((segment.t1 - segment.t0) / dt);
  for (let i = 1; i <= count; i += 1) {
    const k1 = rate(state);
    const k2 = rate(step(state, k1, dt / 2));
    const k3 = rate(step(state, k2, dt / 2));
    const k4 = rate(step(state, k3, dt));
    state = step(state, (k1 + 2 * k2 + 2 * k3 + k4) / 6, dt);
    samples.push([segment.t0 + i * dt, state]);
  }
  return samples;
}

export function scaleState(state: HaberState, factor: number): HaberState {
  return { n2: state.n2 * factor, h2: state.h2 * factor, nh3: state.nh3 * factor };
}

/** Kelvin to a rounded Celsius figure for narration. */
export function kelvinToCelsius(kelvin: number): number {
  return Math.round(kelvin - 273.15);
}
