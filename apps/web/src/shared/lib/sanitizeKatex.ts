import DOMPurify from "dompurify";
import katex from "katex";

export interface SanitizeKatexOptions {
  displayMode?: boolean;
}

const KATEX_FORBID_TAGS = [
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "form",
  // KaTeX never emits these. If they survive into the output, they came from
  // attacker-influenced fragments and have no legitimate role. Issue #65.
  "foreignobject",
  "use",
  "image",
  "audio",
  "video",
  "source",
];

const KATEX_FORBID_ATTR = [
  // Defence in depth: DOMPurify already strips on* by default, but we belt-
  // and-suspender it here in case the upstream allowlist ever loosens.
  "onload",
  "onerror",
  "onclick",
  "onmouseover",
  "onfocus",
  "onblur",
  "onanimationstart",
  "onanimationend",
  "onbegin",
  "onend",
  "formaction",
  // SVG / MathML XSS vectors we don't need for static math output.
  "href",
  "xlink:href",
];

let hookInstalled = false;

/**
 * Install a one-time DOMPurify ``uponSanitizeAttribute`` hook that scrubs
 * every attribute starting with ``on`` (event handlers) plus ``href``-like
 * vectors on SVG / MathML elements. The hook is module-scoped (DOMPurify's
 * hook API is global) so we guard against double-install. Issue #65.
 */
function ensureXssHook(): void {
  if (hookInstalled) return;
  DOMPurify.addHook("uponSanitizeAttribute", (_node, data) => {
    const name = data.attrName.toLowerCase();
    if (name.startsWith("on")) {
      data.keepAttr = false;
      return;
    }
    if (name === "href" || name === "xlink:href") {
      const value = data.attrValue.trim().toLowerCase();
      if (value.startsWith("javascript:") || value.startsWith("data:")) {
        data.keepAttr = false;
      }
    }
  });
  hookInstalled = true;
}

/**
 * Render a LaTeX source string to safe HTML.
 *
 * KaTeX's `renderToString` escapes well-formed input, but `throwOnError: false`
 * makes it fall through to a partial render that can leak hostile fragments
 * if the source is attacker-controlled (LLM-produced playbooks fall into this
 * bucket). Pipe the output through DOMPurify with HTML+MathML+SVG profiles
 * enabled so the structural KaTeX output survives while `<script>`, inline
 * event handlers, ``onload`` SVG vectors, ``href="javascript:"`` etc. are
 * stripped. Issue #65 (extended defence-in-depth on top of #57).
 */
export function sanitizeKatex(
  source: string,
  options: SanitizeKatexOptions = {},
): string {
  ensureXssHook();
  let html: string;
  try {
    html = katex.renderToString(source, {
      throwOnError: false,
      displayMode: options.displayMode ?? false,
    });
  } catch {
    return "";
  }
  const sanitized = DOMPurify.sanitize(html, {
    FORBID_TAGS: KATEX_FORBID_TAGS,
    FORBID_ATTR: KATEX_FORBID_ATTR,
    KEEP_CONTENT: true,
  });
  // DOMPurify may unwrap KaTeX's harmless outer display container in JSDOM
  // while retaining the MathML ``display=block`` payload. Restore that fixed
  // wrapper so display-mode layout remains stable after sanitization.
  if (options.displayMode && !sanitized.includes('class="katex-display"')) {
    return `<span class="katex-display">${sanitized}</span>`;
  }
  return sanitized;
}
