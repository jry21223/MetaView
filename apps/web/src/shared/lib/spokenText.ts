/**
 * Narration that a speech engine can actually read.
 *
 * `voiceover_text` is written for the screen, but it is also the text that
 * reaches TTS. Probing the corpus with espeak-ng showed what that costs: a
 * glyph the engine does not know is dropped **silently**, so `1 → 2 → ∅`
 * comes back as "一 二" and the lesson quietly loses its point.
 *
 * The API rewrites what it can on the way to the synthesizer
 * (`apps/api/app/infrastructure/tts/narration.py`, `to_spoken`) — squares,
 * roots, Greek letters, arrows. Everything else has to be written as words in
 * the first place, which is what the helpers here are for: a screen form and
 * a spoken form, from the same data.
 *
 * `unreadableGlyphs` is the check. Its readable set is the API's: alphanumerics
 * (any script), CJK, the punctuation `test_narration_speech.py` accepts, and
 * the glyphs `to_spoken` rewrites. `apps/api/tests/test_narration_speech.py`
 * reads this file and fails if the two drift apart.
 */

/**
 * Punctuation a synthesizer reads or safely ignores.
 * Mirrors `readable_punctuation` in `apps/api/tests/test_narration_speech.py`.
 */
export const READABLE_PUNCTUATION =
  "。，、；：？！“”‘’（）()【】[]《》—…/+-*=<>.,:;%'\"$&#@_ \n\t";

/**
 * Glyphs `to_spoken` turns into words before synthesis, so narration may use
 * them: superscripts and subscripts, Greek letters, maths operators, the
 * prime suffixes, ion charges, arrows and magnitude bars.
 * Mirrors the rewrite tables in `apps/api/app/infrastructure/tts/narration.py`.
 */
export const SPOKEN_REWRITTEN_GLYPHS =
  "⁰¹²³⁴⁵⁶⁷⁸⁹" +
  "₀₁₂₃₄₅₆₇₈₉" +
  "ₓᵧᵢⱼₙₖₐₑₒₚₛₜₘ" +
  "αβγδΔεθΘλΛμπΠρσΣτφΦωΩ" +
  "√−×÷·≈≤≥≠±∓∫∞⋯∈°⊥" +
  "′″" +
  "⁺⁻" +
  "→" +
  "|";

const READABLE_SET = new Set([...READABLE_PUNCTUATION, ...SPOKEN_REWRITTEN_GLYPHS]);
const ALPHANUMERIC = /[\p{L}\p{N}]/u;

function isReadableCharacter(char: string): boolean {
  return ALPHANUMERIC.test(char) || READABLE_SET.has(char);
}

/**
 * Glyphs in `text` that would reach the synthesizer unreadable, in order of
 * first appearance and without repeats. An empty array means the line is safe
 * to speak.
 */
export function unreadableGlyphs(text: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  for (const char of text) {
    if (isReadableCharacter(char) || seen.has(char)) continue;
    seen.add(char);
    found.push(char);
  }
  return found;
}

/** The enumeration comma; a synthesizer reads it as the pause between items. */
export const SPOKEN_LIST_SEPARATOR = "、";

/** Items read one after another — `4、2、5` rather than `[4, 2, 5]`. */
export function spokenList(items: ReadonlyArray<string | number>): string {
  return items.join(SPOKEN_LIST_SEPARATOR);
}

/**
 * A path read as the nodes it passes through. The screen draws `8 → 3 → 6`;
 * the arrow is silent, so speech gets the nodes separated by pauses instead.
 */
export function spokenPath(nodes: ReadonlyArray<string | number>): string {
  return spokenList(nodes);
}

/** How each bracket glyph is read aloud. */
export const BRACKET_SPOKEN_NAMES: Readonly<Record<string, string>> = {
  "(": "左圆括号",
  ")": "右圆括号",
  "[": "左方括号",
  "]": "右方括号",
  "{": "左花括号",
  "}": "右花括号",
};

/** Spoken name of a bracket glyph; anything else is returned unchanged. */
export function bracketSpokenName(char: string): string {
  return BRACKET_SPOKEN_NAMES[char] ?? char;
}

/** How the empty-set glyph `∅` is read; it is dropped silently otherwise. */
export const SPOKEN_NULL = "空";
