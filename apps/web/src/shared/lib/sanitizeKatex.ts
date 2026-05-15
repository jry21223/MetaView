import DOMPurify from "dompurify";
import katex from "katex";

export interface SanitizeKatexOptions {
  displayMode?: boolean;
}

const KATEX_FORBID_TAGS = ["script", "style", "iframe", "object", "embed", "form"];

/**
 * Render a LaTeX source string to safe HTML.
 *
 * KaTeX's `renderToString` escapes well-formed input, but `throwOnError: false`
 * makes it fall through to a partial render that can leak hostile fragments
 * if the source is attacker-controlled (LLM-produced playbooks fall into this
 * bucket). Pipe the output through DOMPurify with HTML+MathML+SVG profiles
 * enabled so the structural KaTeX output survives while `<script>`, inline
 * event handlers, and other injection vectors are stripped.
 */
export function sanitizeKatex(
  source: string,
  options: SanitizeKatexOptions = {},
): string {
  let html: string;
  try {
    html = katex.renderToString(source, {
      throwOnError: false,
      displayMode: options.displayMode ?? false,
    });
  } catch {
    return "";
  }
  // Rely on DOMPurify's default allowlist (HTML+MathML+SVG, scripts/handlers
  // already forbidden) and add a small extra deny list for tags that could
  // wrap remote content. KEEP_CONTENT keeps the annotation text from KaTeX's
  // MathML mirror even when happy-dom drops unknown elements.
  return DOMPurify.sanitize(html, {
    FORBID_TAGS: KATEX_FORBID_TAGS,
    KEEP_CONTENT: true,
  });
}
