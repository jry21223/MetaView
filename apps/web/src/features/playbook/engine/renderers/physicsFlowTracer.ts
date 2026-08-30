/**
 * The clock a physics flow tracer cruises on.
 *
 * Split out from the renderer so it can be reasoned about — and pinned by
 * tests — without pulling in a React component.
 */

/** Frames a tracer waits for the trajectory to finish drawing beneath it. */
export const CRUISE_START_FRAMES = 50;
/** One full pass along the path, uniform in sample index. */
export const CRUISE_TRAVEL_FRAMES = 96;
/** A rest at the endpoint before the replay. */
export const CRUISE_HOLD_FRAMES = 27;
/**
 * How many passes a tracer makes before parking at the end of the path.
 *
 * It used to replay forever. At 30fps a cycle is 123 frames, so a 44-second
 * step sent the same ball round the same arc ten times and the projectile
 * lesson replayed fifty times end to end. Past the second pass it stops
 * reading as motion and starts reading as a metronome, which is what a
 * viewer noticed first about the lesson.
 */
export const CRUISE_MAX_PASSES = 2;

const CYCLE_FRAMES = CRUISE_TRAVEL_FRAMES + CRUISE_HOLD_FRAMES;

/**
 * Where along its path a tracer sits at `slotFrame`, or `null` before it
 * appears. Every tracer shares this clock, so paths spanning the same time
 * interval stay synchronized on screen.
 */
export function cruiseFraction(slotFrame: number): number | null {
  const elapsed = slotFrame - CRUISE_START_FRAMES;
  if (elapsed < 0) return null;
  // Once the passes are spent the tracer parks at the end of the path, so a
  // long step settles into a readable final state instead of restarting.
  if (elapsed >= CYCLE_FRAMES * CRUISE_MAX_PASSES) return 1;
  return Math.min(1, (elapsed % CYCLE_FRAMES) / CRUISE_TRAVEL_FRAMES);
}
