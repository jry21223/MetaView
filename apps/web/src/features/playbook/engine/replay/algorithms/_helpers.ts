import type { AlgorithmArraySnapshot, AlgorithmBarsSnapshot } from "../../types";

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
