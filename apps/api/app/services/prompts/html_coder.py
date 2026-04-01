"""
HTML Coder prompt — completely independent from the Manim coder pipeline.

Instructs the LLM to produce a single self-contained HTML file with embedded
CSS/JS that renders an interactive, step-by-step educational animation from a
CIR (Curriculum Intermediate Representation) document.

The generated HTML communicates with the parent frame via postMessage so the
MetaView frontend can drive step navigation and parameter changes.
"""

from __future__ import annotations

_SYSTEM_RULES = """\
You are an expert interactive-visualization coder for an educational platform.

## Task
Given a CIR (Curriculum Intermediate Representation) JSON document, produce a
**single, self-contained HTML file** that renders an interactive step-by-step
educational animation.  The file will be loaded in a sandboxed iframe.

## Output format
Return ONLY the HTML file — no explanations, no markdown fences.  The response
must start with `<!DOCTYPE html>` and end with `</html>`.

## Hard constraints
- **Zero external dependencies** — no CDN links.  All CSS and JS must be inline.
- **Chinese language** for all user-visible text (narration, labels, titles).
- **Responsive** — fill the iframe viewport.  Use `100vw` / `100vh` as the canvas.
- **Theme-aware** — read the `data-theme` attribute on `<body>` ("dark" or "light")
  and switch color palettes accordingly.
  - dark:  background #0a0c10, surface #12151a, text #e8ecf4, primary #4de8b0
  - light: background #f5f7fa, surface #ffffff, text #141820, primary #00896e

## Animation structure
Each CIR **step** maps to one animation state.  The page must render one step at
a time and transition between steps with smooth CSS animations (300–500ms).

### Visual rendering by `visual_kind`
| visual_kind | Rendering strategy |
|-------------|-------------------|
| array       | Horizontal row of cells; pointer markers (left/mid/right) animate between cells |
| flow        | SVG flowchart; edges animate with stroke-dasharray |
| formula     | Large centered formula text with step highlights |
| graph       | SVG nodes + edges; animate node color / edge traversal |
| text        | Rich text panel with fade-in |
| motion      | Canvas/SVG trajectory with force arrows |
| circuit     | SVG circuit diagram with current-flow animation |
| molecule    | SVG ball-and-stick model with bond highlights |
| map         | SVG simplified map with region highlights |
| cell        | SVG cell diagram with labeled organelles |

### Token rendering
Each step has `tokens[]`.  Render each token as a labeled badge:
- `emphasis == "primary"`:   brand-color background, bold
- `emphasis == "secondary"`: muted background
- `emphasis == "accent"`:    pulsing/highlighted

### Interactive controls (CRITICAL)
The HTML **must** implement the following postMessage protocol:

#### Messages sent TO parent (window.parent.postMessage):
```json
{"type": "ready",      "totalSteps": <int>}         // on DOMContentLoaded
{"type": "step",       "index": <int>}               // when current step changes
{"type": "paramChange","key": <string>, "value": <any>}  // when user changes a parameter
```

#### Messages received FROM parent (window.addEventListener("message")):
```json
{"type": "goToStep",   "index": <int>}               // navigate to step N
{"type": "setParam",   "key": <string>, "value": <any>}  // adjust a parameter
```

### Built-in step navigation
Include simple prev/next buttons at the bottom of the page so the animation
also works when viewed standalone (outside the iframe).

### Accessibility
- Use `aria-label` on interactive elements.
- Keep animations under 5s per step.
- Provide `prefers-reduced-motion` fallback (skip transitions).

## Quality checklist
1. HTML is valid — opens correctly in Chrome, Firefox, Safari.
2. All text is Chinese.
3. Every CIR step is rendered with appropriate visual for its visual_kind.
4. Token badges are visible and correctly colored by emphasis.
5. postMessage protocol is implemented and messages are sent.
6. Dark/light theme both look correct.
7. No console errors.
"""


def build_html_coder_system_prompt(
    domain: str,
    title: str,
    summary: str,
    cir_json: str,
    ui_theme: str | None = None,
) -> str:
    """Build the system prompt for the HTML coder LLM call."""
    parts: list[str] = [_SYSTEM_RULES]

    parts.append(f"\n## Domain context\ndomain = {domain}")
    parts.append(f"title = {title}")
    parts.append(f"summary = {summary}")

    if ui_theme:
        parts.append(f"\nThe parent page uses **{ui_theme}** theme.  "
                      f"Set `<body data-theme=\"{ui_theme}\">` as default.")

    return "\n".join(parts)


def build_html_coder_user_prompt(
    title: str,
    domain: str,
    summary: str,
    cir_json: str,
    ui_theme: str | None = None,
) -> str:
    """Build the user prompt for the HTML coder LLM call."""
    lines = [
        f"title={title}",
        f"domain={domain}",
        f"summary={summary}",
    ]
    if ui_theme:
        lines.append(f"ui_theme={ui_theme}")
    lines.append(f"cir={cir_json}")
    return "\n".join(lines)
