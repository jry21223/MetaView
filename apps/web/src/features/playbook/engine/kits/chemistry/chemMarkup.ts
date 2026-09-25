/**
 * Formula markup for chemistry labels.
 *
 * Unicode sub/superscript digits render from whatever fallback font happens
 * to carry them, so `H₂O` and `Zn²⁺` wobble in size and baseline between the
 * browser and the Remotion export. Labels are therefore written in a tiny
 * markup and drawn as real SVG `tspan`s:
 *
 *   `_x` / `_{…}` → subscript    `CH_3COOH`, `SO_4^{2-}`
 *   `^x` / `^{…}` → superscript  `Zn^{2+}`, `^{18}O`, `e^-`
 *
 * Unicode input is normalised to the same segments, so data written either
 * way draws identically. A single `^`/`_` takes one character, except that a
 * run of digits followed by a sign (`^2+`) is taken whole.
 */

export type ChemTextShift = "sub" | "sup" | null;

export interface ChemTextSegment {
  text: string;
  shift: ChemTextShift;
}

const SUPERSCRIPT: Record<string, string> = {
  "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4",
  "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9",
  "⁺": "+", "⁻": "-",
};
const SUBSCRIPT: Record<string, string> = {
  "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4",
  "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9",
};

/** Rewrite Unicode sub/superscript runs into `_{…}` / `^{…}` markup. */
export function unicodeToChemMarkup(text: string): string {
  let out = "";
  let index = 0;
  const chars = [...text];
  while (index < chars.length) {
    const char = chars[index];
    const table = SUPERSCRIPT[char] !== undefined ? SUPERSCRIPT : SUBSCRIPT[char] !== undefined ? SUBSCRIPT : null;
    if (!table) {
      out += char;
      index += 1;
      continue;
    }
    let run = "";
    while (index < chars.length && table[chars[index]] !== undefined) {
      run += table[chars[index]];
      index += 1;
    }
    out += `${table === SUPERSCRIPT ? "^" : "_"}{${run}}`;
  }
  return out;
}

function pushSegment(segments: ChemTextSegment[], text: string, shift: ChemTextShift): void {
  if (!text) return;
  const last = segments.at(-1);
  if (last && last.shift === shift) {
    last.text += text;
    return;
  }
  segments.push({ text, shift });
}

/** Read the operand of `^` / `_` starting at `index`; returns [text, nextIndex]. */
function readOperand(chars: string[], index: number, shift: "sub" | "sup"): [string, number] {
  if (chars[index] === "{") {
    const close = chars.indexOf("}", index + 1);
    const end = close === -1 ? chars.length : close;
    return [chars.slice(index + 1, end).join(""), end + 1];
  }
  if (shift === "sup") {
    // `^2+` / `^2-` / `^18`: digits plus an optional trailing sign.
    let end = index;
    while (end < chars.length && /[0-9]/.test(chars[end])) end += 1;
    if (end > index && (chars[end] === "+" || chars[end] === "-")) end += 1;
    if (end > index) return [chars.slice(index, end).join(""), end];
  }
  if (shift === "sub") {
    let end = index;
    while (end < chars.length && /[0-9]/.test(chars[end])) end += 1;
    if (end > index) return [chars.slice(index, end).join(""), end];
  }
  return [chars[index] ?? "", index + 1];
}

/** Split markup (or Unicode) into baseline / subscript / superscript runs. */
export function parseChemMarkup(input: string): ChemTextSegment[] {
  const chars = [...unicodeToChemMarkup(input)];
  const segments: ChemTextSegment[] = [];
  let index = 0;
  let plain = "";
  while (index < chars.length) {
    const char = chars[index];
    if ((char === "_" || char === "^") && index + 1 < chars.length) {
      pushSegment(segments, plain, null);
      plain = "";
      const shift = char === "_" ? "sub" : "sup";
      const [operand, next] = readOperand(chars, index + 1, shift);
      // A superscript minus reads better as a true minus sign.
      pushSegment(segments, shift === "sup" ? operand.replace(/-/g, "−") : operand, shift);
      index = next;
      continue;
    }
    plain += char;
    index += 1;
  }
  pushSegment(segments, plain, null);
  return segments;
}

/** The markup as plain text (for accessibility labels and width estimates). */
export function chemPlainText(input: string): string {
  return parseChemMarkup(input).map((segment) => segment.text).join("");
}

const WIDE = /[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF\u3000-\u303F]/;

/** Advance width of one character in em, for a proportional Latin + CJK font. */
function charEm(char: string): number {
  if (WIDE.test(char)) return 1;
  // Arrows usually come from the CJK fallback font, which sets them full width.
  if (/[→←⇌⇋↑↓≡]/.test(char)) return 1;
  if (char === "×") return 0.62;
  if (/[ilI.,:;|'!·]/.test(char)) return 0.3;
  if (/[mwMW]/.test(char)) return 0.86;
  if (/[A-Z0-9]/.test(char)) return 0.64;
  if (char === " ") return 0.3;
  return 0.54;
}

/** Scripts render at this fraction of the base size. */
export const CHEM_SCRIPT_SCALE = 0.68;

/**
 * Estimated rendered width of a markup label at `fontSize`. Deterministic, so
 * label layout is identical in the browser, in Remotion and in tests.
 */
export function estimateChemTextWidth(input: string, fontSize: number, weight = 400): number {
  let em = 0;
  for (const segment of parseChemMarkup(input)) {
    const scale = segment.shift ? CHEM_SCRIPT_SCALE : 1;
    for (const char of segment.text) em += charEm(char) * scale;
  }
  // Semibold runs wider than regular; err on the wide side so boxes contain it.
  return em * fontSize * (weight >= 600 ? 1.1 : 1);
}

const TO_SUPERSCRIPT: Record<string, string> = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "+": "⁺", "-": "⁻", "−": "⁻",
};
const TO_SUBSCRIPT: Record<string, string> = {
  "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉",
};

/**
 * Markup as Unicode text, for plain-text surfaces (Follow-up answers, alt
 * text) that cannot draw tspans. Characters with no Unicode script form are
 * kept on the baseline.
 */
export function chemMarkupToUnicode(input: string): string {
  return parseChemMarkup(input)
    .map((segment) => {
      if (!segment.shift) return segment.text;
      const table = segment.shift === "sup" ? TO_SUPERSCRIPT : TO_SUBSCRIPT;
      return [...segment.text].map((char) => table[char] ?? char).join("");
    })
    .join("");
}
