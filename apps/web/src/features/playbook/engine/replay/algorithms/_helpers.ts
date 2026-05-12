import type { AlgorithmArraySnapshot, AlgorithmBarsSnapshot } from "../../types";

/**
 * Insert `idx` into `sorted` keeping the array in ascending order (no duplicates).
 * Mutates and returns `sorted` for ergonomic call-site chaining inside replay loops.
 *
 * Why: replay algorithms must emit `sorted_indices` in a deterministic ascending
 * order. Using `Set<number>` and relying on insertion order is a latent bug — see
 * issue #35. Callers should hold a `number[]` and use this helper.
 */
export function addSortedIndex(sorted: number[], idx: number): number[] {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < idx) lo = mid + 1;
    else hi = mid;
  }
  if (sorted[lo] === idx) return sorted;
  sorted.splice(lo, 0, idx);
  return sorted;
}

export function range(lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let i = lo; i < hi; i++) out.push(i);
  return out;
}

export function compareValues(a: string, b: string): number {
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  return a < b ? -1 : a > b ? 1 : 0;
}

function parseNumeric(values: readonly string[]): number[] | null {
  if (values.length === 0) return null;
  const out: number[] = [];
  for (const v of values) {
    const n = Number(v);
    if (Number.isNaN(n)) return null;
    out.push(n);
  }
  return out;
}

/**
 * Build a per-step snapshot. When every element parses as a number the snapshot
 * is emitted as a height-encoded bar block (`algorithm_bars`); otherwise it
 * falls back to the flat-cell `algorithm_array` form.
 */
export function snapshot(
  arr: readonly string[],
  active: number[],
  sorted: number[],
  swap: number[] = [],
  pointers: Record<string, number> = {},
): AlgorithmArraySnapshot | AlgorithmBarsSnapshot {
  const sortedIndices = [...sorted].sort((a, b) => a - b);
  const numeric = parseNumeric(arr);
  if (numeric) {
    return {
      kind: "algorithm_bars",
      array_values: [...arr],
      numeric_values: numeric,
      active_indices: active,
      swap_indices: swap,
      sorted_indices: sortedIndices,
      pointers,
    };
  }
  return {
    kind: "algorithm_array",
    array_values: [...arr],
    active_indices: active,
    swap_indices: swap,
    sorted_indices: sortedIndices,
    pointers,
  };
}
