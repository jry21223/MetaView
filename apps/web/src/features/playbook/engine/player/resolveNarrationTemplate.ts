import type {
  NarrationBranch,
  NarrationCondition,
  NarrationSegment,
  NarrationTemplate,
  NarrationToken,
} from "../types";

export function resolveNarrationTemplate(
  template: NarrationTemplate,
  tokens: NarrationToken[],
): string {
  return resolveSegments(template, tokens);
}

function resolveSegments(segments: NarrationSegment[], tokens: NarrationToken[]): string {
  return segments.map((seg) => resolveSegment(seg, tokens)).join("");
}

function resolveSegment(seg: NarrationSegment, tokens: NarrationToken[]): string {
  if (typeof seg === "string") return seg;

  if (isTokenRef(seg)) {
    return tokens.find((t) => t.id === seg.t)?.label ?? seg.t;
  }

  if (Array.isArray(seg)) {
    for (const branch of seg as NarrationBranch[]) {
      const [condition, result] = branch;
      if (isDefaultCondition(condition) || evaluateCondition(condition, tokens)) {
        return resolveSegments(result, tokens);
      }
    }
    return "";
  }

  return "";
}

function isTokenRef(seg: NarrationSegment): seg is { t: string } {
  return typeof seg === "object" && !Array.isArray(seg) && "t" in seg;
}

function isDefaultCondition(cond: NarrationCondition): boolean {
  return typeof cond === "object" && !Array.isArray(cond) && Object.keys(cond).length === 0;
}

function evaluateCondition(cond: NarrationCondition, tokens: NarrationToken[]): boolean {
  if (isDefaultCondition(cond)) return true;

  const c = cond as { a: string; op: string; b?: string; v?: number | string };
  const aToken = tokens.find((t) => t.id === c.a);
  if (!aToken) return false;

  const aRaw = aToken.label;
  const bRaw: string =
    c.b !== undefined
      ? (tokens.find((t) => t.id === c.b)?.label ?? "")
      : String(c.v ?? "");

  const aNum = Number(aRaw);
  const bNum = Number(bRaw);
  const numeric = !isNaN(aNum) && !isNaN(bNum);

  const a = numeric ? aNum : aRaw;
  const b = numeric ? bNum : bRaw;

  switch (c.op) {
    case "lt":  return a < b;
    case "gt":  return a > b;
    case "eq":  return a === b;
    case "lte": return a <= b;
    case "gte": return a >= b;
    case "neq": return a !== b;
    default:    return false;
  }
}
