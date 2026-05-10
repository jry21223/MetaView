import type { AlgorithmArraySnapshot } from "../../types";

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

export function snapshot(
  arr: readonly string[],
  active: number[],
  sorted: number[],
  swap: number[] = [],
  pointers: Record<string, number> = {},
): AlgorithmArraySnapshot {
  return {
    kind: "algorithm_array",
    array_values: [...arr],
    active_indices: active,
    swap_indices: swap,
    sorted_indices: [...sorted].sort((a, b) => a - b),
    pointers,
  };
}
