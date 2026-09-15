import type { AlgorithmAuxiliaryLane } from "../types";

/**
 * Horizontal room a stack column takes beside the main sequence (index
 * gutter, slot, top marker and the gap to the sequence), so the array or
 * bars can shrink their cell width instead of overflowing the stage.
 */
export const STACK_COLUMN_RESERVE = 220;

/** Slot count for a stack column: the whole input could end up on the stack. */
export function stackColumnCapacity(lane: AlgorithmAuxiliaryLane, sequenceLength: number): number {
  return Math.max(1, lane.items.length, Math.min(8, sequenceLength));
}
