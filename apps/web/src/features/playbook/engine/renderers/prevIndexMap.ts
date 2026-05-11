/**
 * Greedy index map: for each currentIndex find a unique prevIndex with the same
 * value (so that real cell migration can be animated). Newly written values
 * (no remaining match) yield -1, signalling a "pop-in".
 */
export function buildPrevIndexMap(
  current: readonly string[],
  prev: readonly string[] | null,
): number[] {
  if (!prev) return current.map(() => -1);
  const used = new Array(prev.length).fill(false) as boolean[];
  const result: number[] = [];
  for (let i = 0; i < current.length; i++) {
    if (i < prev.length && !used[i] && prev[i] === current[i]) {
      result.push(i);
      used[i] = true;
    } else {
      result.push(-2);
    }
  }
  for (let i = 0; i < current.length; i++) {
    if (result[i] !== -2) continue;
    let best = -1;
    let bestDist = Infinity;
    for (let j = 0; j < prev.length; j++) {
      if (used[j]) continue;
      if (prev[j] !== current[i]) continue;
      const d = Math.abs(j - i);
      if (d < bestDist) {
        bestDist = d;
        best = j;
      }
    }
    if (best >= 0) {
      result[i] = best;
      used[best] = true;
    } else {
      result[i] = -1;
    }
  }
  return result;
}
