/**
 * SSML normalizer.
 *
 * Both `window.speechSynthesis` and OpenAI TTS expect plain text input. When a
 * voiceover_text starts with `<speak>`, we normalize the SSML markup down to
 * plain text while preserving rough pause / emphasis hints via punctuation.
 */

const BREAK_PATTERN = /<break\s+[^>]*\/?>/gi;
const TAG_PATTERN = /<\/?[^>]+>/g;

export function isSSML(text: string): boolean {
  return /^\s*<speak[\s>]/i.test(text);
}

export function normalizeSSML(text: string): string {
  if (!isSSML(text)) return text;
  // Convert <break .../> to a punctuation pause first so we don't lose it
  // when the generic tag stripper runs.
  let out = text.replace(BREAK_PATTERN, " , ");
  out = out.replace(TAG_PATTERN, "");
  // Decode the small subset of XML entities we care about; ignore everything
  // else since OpenAI TTS handles plain UTF-8.
  out = out
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
  return out.replace(/\s+/g, " ").trim();
}
