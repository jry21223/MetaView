"""
HTML Coder prompt — completely independent from the Manim coder pipeline.

Instructs the LLM to produce a single self-contained HTML file with embedded
CSS/JS that renders an interactive, step-by-step educational animation from a
CIR (Curriculum Intermediate Representation) document.

The generated HTML communicates with the parent frame via postMessage so the
MetaView frontend can drive step navigation and parameter changes.
"""

from __future__ import annotations

HTML_CODER_PROMPT_VERSION = "2.0.0"

# ──────────────────────────────────────────────────────────────────────────────
# Layer 1: Base Runtime Contract
# ──────────────────────────────────────────────────────────────────────────────
_BASE_RUNTIME_CONTRACT = """\
## Base Runtime Contract

Generate a **single, self-contained HTML file** that implements the following
unified runtime skeleton. The file must start with `<!DOCTYPE html>` and end
with `</html>`.

### Required Global State
```javascript
const runtime = {
  state: {
    currentStep: 0,      // 0-based index
    totalSteps: N,       // from cir.steps.length
    autoplay: false,     // boolean
    speed: 1.0,          // 0.5 - 2.0
    paused: true,        // boolean
    params: {},          // Record<string, string>
  },
  // Core API methods (must be implemented)
  notifyParent(type, payload = {}) {},  // postMessage to parent
  applyTheme(theme) {},                 // "dark" | "light"
  renderStep(step, prevStep, api) {},   // render current step
  goToStep(index, reason) {},           // navigate to step
  setParam(key, value) {},              // update parameter
  setPlayback(update) {},               // { autoplay?, paused?, speed? }
};
```

### Required API Methods

**notifyParent(type, payload)**
- Must call `window.parent.postMessage({ type, ...payload }, "*")`
- Required message types to emit:
  - `ready`: { totalSteps, supportedParams, capabilities }
  - `step`: { index }
  - `playback`: { paused, autoplay, speed }
  - `paramChange`: { key, value }

**applyTheme(theme)**
- Set `document.body.dataset.theme = theme`
- theme is either "dark" or "light"

**renderStep(step, prevStep, api)**
- Must read `step.visual_kind` and call appropriate visual renderer
- Must update DOM to show step.title, step.narration, step.tokens
- Must apply CSS transitions based on `api.state.speed`
- Must call `api.notifyParent("step", { index: api.state.currentStep })`
- Must schedule autoplay if `api.state.autoplay && !api.state.paused`

**goToStep(index, reason)**
- Clamp index to [0, totalSteps-1]
- Call renderStep with new step
- Accept reason: "api", "prev", "next", "autoplay", "setParam"

**setParam(key, value)**
- Update `runtime.state.params[key] = value`
- Call `notifyParent("paramChange", { key, value })`
- Re-render current step (params may affect visual)

**setPlayback(update)**
- Update state: autoplay, paused, speed
- Clamp speed to [0.5, 2.0]
- Update UI controls (play/pause button state, speed input)
- Call `notifyParent("playback", { paused, autoplay, speed })`
- If autoplay and not paused, schedule next step

### Message Handling (window.addEventListener("message"))
Must respond to parent messages:
- `{ type: "goToStep", index: number }` → call `goToStep(index, "api")`
- `{ type: "setParam", key: string, value: any }` → call `setParam(key, value)`
- `{ type: "playback", autoplay?, paused?, speed? }` → call `setPlayback(update)`

### Quality Requirements
- All animation durations must be proportional to `state.speed`
- Default transition: `300ms / speed`, minimum 100ms
- Respect `prefers-reduced-motion`: disable continuous animations, keep discrete state changes
- All user-visible text must be Chinese
"""

# ──────────────────────────────────────────────────────────────────────────────
# Layer 2: Visual Template Spec (10 visual kinds)
# ──────────────────────────────────────────────────────────────────────────────
_VISUAL_TEMPLATE_SPEC = """\
## Visual Template Specification

Each `visual_kind` has a standardized DOM/SVG structure. Implement the
`renderVisual(step, state)` function that returns HTML string based on
`step.visual_kind`.

### Template Structure Requirements

| visual_kind | Required DOM Structure |
|-------------|------------------------|
| array | track + cells + pointer layer + compare/swap highlight layer |
| flow | nodes + directed edges + active path overlay |
| formula | main equation + term emphasis band + derivation note |
| graph | node groups + edge traversal glow + current frontier |
| text | headline + explanation card + key phrase emphasis |
| motion | path + actor + vectors + trail |
| circuit | component symbols + current pulse path + active branch |
| molecule | atoms + bonds + bond-focus ring |
| map | regions + route/path + active callout |
| cell | cell body + organelles + focus label rail |

### Token Rendering Rules

Each step has `tokens[]`. Render each token as a labeled badge:
- `emphasis == "primary"`: brand-color background, bold text
- `emphasis == "secondary"`: muted background
- `emphasis == "accent"`: pulsing/highlighted effect

Token badge HTML structure:
```html
<span class="token token-{emphasis}">
  {token.label}{token.value ? ' = ' + token.value : ''}
</span>
```

### Visual Kind: array
```html
<div class="viz-array">
  <div class="array-track">
    <div class="pointer-row">
      <span class="pointer">left</span>
      <span class="pointer">mid</span>
      <span class="pointer">right</span>
    </div>
    <div class="cells">
      <!-- One cell per token or array element -->
      <div class="cell">{value}</div>
    </div>
    <div class="highlight-layer">
      <!-- Dynamic compare/swap highlights -->
    </div>
  </div>
</div>
```

### Visual Kind: flow
```html
<div class="viz-flow">
  <svg class="flow-svg">
    <!-- Nodes as <g class="flow-node"> with <rect> or <circle> -->
    <!-- Edges as <path class="flow-edge"> with arrow markers -->
    <!-- Active path as <path class="flow-edge active"> -->
  </svg>
</div>
```

### Visual Kind: formula
```html
<div class="viz-formula">
  <div class="formula-main">{main_equation}</div>
  <div class="emphasis-band">{highlighted_term}</div>
  <div class="derivation-note">{step.narration}</div>
</div>
```

### Visual Kind: graph
```html
<div class="viz-graph">
  <svg class="graph-svg">
    <!-- Nodes: <g class="graph-node"> with <circle> -->
    <!-- Edges: <line class="graph-edge"> -->
    <!-- Traversal glow: <circle class="node-glow"> -->
    <!-- Current frontier: highlight specific nodes -->
  </svg>
</div>
```

### Visual Kind: text
```html
<div class="viz-text">
  <h2 class="text-headline">{step.title}</h2>
  <div class="text-explanation">{step.narration}</div>
  <div class="text-keyphrases">
    <!-- Key phrases from tokens with emphasis -->
  </div>
</div>
```

### Visual Kind: motion
```html
<div class="viz-motion">
  <svg class="motion-svg">
    <!-- Path: <path class="motion-path"> -->
    <!-- Actor: <circle class="motion-actor"> animated along path -->
    <!-- Vectors: <line class="motion-vector"> with arrowheads -->
    <!-- Trail: <path class="motion-trail"> fading opacity -->
  </svg>
</div>
```

### Visual Kind: circuit
```html
<div class="viz-circuit">
  <svg class="circuit-svg">
    <!-- Components: <g class="circuit-component"> (R, C, V, etc.) -->
    <!-- Wires: <path class="circuit-wire"> -->
    <!-- Current pulse: <circle class="current-pulse"> animated -->
    <!-- Active branch: <path class="circuit-wire active"> -->
  </svg>
</div>
```

### Visual Kind: molecule
```html
<div class="viz-molecule">
  <svg class="molecule-svg">
    <!-- Atoms: <circle class="atom"> with different colors per element -->
    <!-- Bonds: <line class="bond"> -->
    <!-- Focus ring: <circle class="bond-focus-ring"> pulsing -->
  </svg>
</div>
```

### Visual Kind: map
```html
<div class="viz-map">
  <svg class="map-svg">
    <!-- Regions: <path class="map-region"> -->
    <!-- Route: <path class="map-route"> -->
    <!-- Active callout: <g class="map-callout"> -->
  </svg>
</div>
```

### Visual Kind: cell
```html
<div class="viz-cell">
  <svg class="cell-svg">
    <!-- Cell body: <ellipse class="cell-body"> -->
    <!-- Organelles: <g class="organelle"> (nucleus, mitochondria, etc.) -->
    <!-- Focus label: <text class="organelle-label"> -->
  </svg>
</div>
```

### Fallback Rules
- If `visual_kind` is unknown, default to "text"
- If tokens are empty, show placeholder text
- If step.title is empty, show "步骤 {index+1}"
- Always render something visible, never blank
"""

# ──────────────────────────────────────────────────────────────────────────────
# Layer 3: Interaction Contract
# ──────────────────────────────────────────────────────────────────────────────
_INTERACTION_CONTRACT = """\
## Interaction Contract (postMessage Protocol)

### Messages TO Parent (must emit)

1. **ready** — emitted on DOMContentLoaded
   ```json
   {
     "type": "ready",
     "totalSteps": 5,
     "supportedParams": ["arraySize", "targetValue"],
     "capabilities": {
       "playback": true,
       "params": true,
       "theme": true,
       "reducedMotionAware": true
     }
   }
   ```

2. **step** — emitted when current step changes
   ```json
   { "type": "step", "index": 2 }
   ```

3. **playback** — emitted when playback state changes
   ```json
   {
     "type": "playback",
     "paused": false,
     "autoplay": true,
     "speed": 1.5
   }
   ```

4. **paramChange** — emitted when parameter changes
   ```json
   { "type": "paramChange", "key": "arraySize", "value": "10" }
   ```

### Messages FROM Parent (must handle)

1. **goToStep** — navigate to specific step
   ```json
   { "type": "goToStep", "index": 3 }
   ```

2. **setParam** — update parameter value
   ```json
   { "type": "setParam", "key": "target", "value": "42" }
   ```

3. **playback** — control playback state
   ```json
   {
     "type": "playback",
     "paused": false,
     "autoplay": true,
     "speed": 2.0
   }
   ```

### Built-in Controls
Include prev/next buttons and basic controls at the bottom so the animation
works standalone (outside iframe). Position fixed at bottom center.
"""

# ──────────────────────────────────────────────────────────────────────────────
# Layer 4: Quality Rubric
# ──────────────────────────────────────────────────────────────────────────────
_QUALITY_RUBRIC = """\
## Quality Rubric (Hard Rules)

1. **Single File**: All CSS and JS must be inline. No external CDN links.
2. **Valid HTML**: Must open correctly in Chrome, Firefox, Safari.
3. **Chinese Text**: All user-visible text must be Chinese.
4. **Every Step Rendered**: Each CIR step must be rendered with appropriate visual.
5. **Token Badges Visible**: All tokens must be visible with correct emphasis styling.
6. **postMessage Protocol**: Must implement all required message types.
7. **Theme Support**: Both dark and light themes must look correct.
8. **No Console Errors**: window.onerror should remain empty.
9. **Speed Affects Transitions**: CSS animation durations must be `baseDuration / speed`.
10. **Paused Freezes**: When paused, autoplay must stop, no automatic step changes.
11. **Reduced Motion**: When prefers-reduced-motion is true, disable continuous animations.
12. **Graceful Degradation**: When tokens are missing or malformed, still render valid HTML.
"""

# ──────────────────────────────────────────────────────────────────────────────
# Complete System Prompt
# ──────────────────────────────────────────────────────────────────────────────
_SYSTEM_RULES = """\
You are an expert interactive-visualization coder for an educational platform.

## Task
Given a CIR (Curriculum Intermediate Representation) JSON document, produce a
**single, self-contained HTML file** that renders an interactive step-by-step
educational animation. The file will be loaded in a sandboxed iframe.

## Output format
Return ONLY the HTML file — no explanations, no markdown fences. The response
must start with `<!DOCTYPE html>` and end with `</html>`.

## Hard constraints
- **Zero external dependencies** — no CDN links. All CSS and JS must be inline.
- **Chinese language** for all user-visible text (narration, labels, titles).
- **Responsive** — fill the iframe viewport. Use `100vw` / `100vh` as the canvas.
- **Theme-aware** — read the `data-theme` attribute on `<body>` ("dark" or "light")
  and switch color palettes accordingly.
  - dark:  background #0a0c10, surface #12151a, text #e8ecf4, primary #4de8b0
  - light: background #f5f7fa, surface #ffffff, text #141820, primary #00896e

## Animation structure
Each CIR **step** maps to one animation state. The page must render one step at
a time and transition between steps with smooth CSS animations (300–500ms base).

""" + _BASE_RUNTIME_CONTRACT + "\n\n" + _VISUAL_TEMPLATE_SPEC + "\n\n" + _INTERACTION_CONTRACT + "\n\n" + _QUALITY_RUBRIC


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


def build_html_fallback_document(cir, ui_theme: str | None = None) -> str:
    """Build a robust fallback HTML document directly from CIR data.

    This implements the 4-layer architecture with runtime contract,
    visual templates for all 10 kinds, and full postMessage protocol.
    """
    import html as html_lib
    import json

    theme = ui_theme or "dark"
    payload = json.dumps(cir.model_dump() if hasattr(cir, 'model_dump') else cir, ensure_ascii=False)
    title = html_lib.escape(getattr(cir, 'title', '教育动画'))
    summary = html_lib.escape(getattr(cir, 'summary', ''))

    return f"""\
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title}</title>
<style>
:root {{
  --bg-dark: #0a0c10;
  --surface-dark: #12151a;
  --text-dark: #e8ecf4;
  --primary-dark: #4de8b0;
  --bg-light: #f5f7fa;
  --surface-light: #ffffff;
  --text-light: #141820;
  --primary-light: #00896e;
  --duration-ms: 320ms;
}}
body[data-theme="dark"] {{
  background: var(--bg-dark);
  color: var(--text-dark);
  --bg: var(--bg-dark);
  --surface: var(--surface-dark);
  --text: var(--text-dark);
  --primary: var(--primary-dark);
}}
body[data-theme="light"] {{
  background: var(--bg-light);
  color: var(--text-light);
  --bg: var(--bg-light);
  --surface: var(--surface-light);
  --text: var(--text-light);
  --primary: var(--primary-light);
}}
* {{ box-sizing: border-box; margin: 0; padding: 0; }}
html, body {{ height: 100%; overflow: hidden; }}
body {{
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans CJK SC", "PingFang SC", "Microsoft YaHei", sans-serif;
  transition: background 0.3s, color 0.3s;
}}
.shell {{
  height: 100vh;
  display: grid;
  grid-template-rows: auto 1fr auto;
  gap: 12px;
  padding: 16px;
}}
.header {{ text-align: center; padding: 8px 0; }}
.title {{ font-size: 1.25rem; font-weight: 700; margin-bottom: 6px; }}
.summary {{ font-size: 0.85rem; opacity: 0.7; }}
.panel {{
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: 16px;
  min-height: 0;
}}
.stage-wrap {{
  background: var(--surface);
  border-radius: 16px;
  padding: 16px;
  position: relative;
  overflow: auto;
}}
.stage {{ min-height: 100%; display: flex; align-items: center; justify-content: center; }}
.meta {{
  display: flex;
  flex-direction: column;
  gap: 12px;
}}
.card {{
  background: var(--surface);
  border-radius: 12px;
  padding: 14px;
  border: 1px solid rgba(127,127,127,0.1);
}}
.kind {{
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  opacity: 0.6;
  margin-bottom: 6px;
}}
.step-title {{ font-weight: 700; font-size: 1.05rem; margin-bottom: 8px; }}
.narration {{ font-size: 0.9rem; line-height: 1.6; opacity: 0.85; }}
.tokens {{ display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }}
.token {{
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
}}
.token-primary {{ background: rgba(77,232,176,0.18); color: var(--primary); }}
.token-secondary {{ background: rgba(127,127,127,0.12); color: inherit; opacity: 0.8; }}
.token-accent {{ background: rgba(255,158,138,0.15); color: #ff9e8a; }}
body[data-theme="light"] .token-primary {{ background: rgba(0,137,110,0.12); }}
body[data-theme="light"] .token-accent {{ background: rgba(150,70,60,0.1); color: #96463c; }}
.param-list {{ display: flex; flex-direction: column; gap: 8px; }}
.param-row {{ display: flex; flex-direction: column; gap: 4px; }}
.param-row label {{ font-size: 0.75rem; opacity: 0.7; }}
.param-row input {{
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid rgba(127,127,127,0.2);
  background: var(--bg);
  color: inherit;
  font-size: 0.85rem;
}}
.controls {{
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 12px;
  background: var(--surface);
  border-radius: 12px;
}}
.controls button {{
  padding: 8px 16px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  font-size: 0.85rem;
  background: rgba(127,127,127,0.15);
  color: inherit;
  transition: transform 0.1s;
}}
.controls button:active {{ transform: scale(0.96); }}
.controls button:disabled {{ opacity: 0.4; cursor: not-allowed; }}
.controls button.primary {{ background: var(--primary); color: #0a0c10; }}
.controls input[type="range"] {{ width: 120px; }}
.step-counter {{ font-size: 0.85rem; opacity: 0.7; min-width: 3em; text-align: center; }}

/* Visual kind: array */
.viz-array .array-track {{ display: flex; flex-direction: column; gap: 8px; align-items: center; }}
.viz-array .pointer-row {{ display: flex; gap: 40px; font-size: 0.75rem; opacity: 0.7; }}
.viz-array .cells {{ display: flex; gap: 8px; }}
.viz-array .cell {{
  width: 48px; height: 48px;
  display: flex; align-items: center; justify-content: center;
  background: rgba(127,127,127,0.1);
  border-radius: 8px;
  font-weight: 600;
  transition: all var(--duration-ms);
}}
.viz-array .cell.active {{ background: var(--primary); color: #0a0c10; }}

/* Visual kind: flow */
.viz-flow .flow-grid {{ display: flex; flex-direction: column; align-items: center; gap: 12px; }}
.viz-flow .flow-nodes {{ display: flex; align-items: center; gap: 16px; }}
.viz-flow .node {{
  padding: 10px 18px;
  background: rgba(127,127,127,0.1);
  border-radius: 8px;
  font-weight: 600;
  transition: all var(--duration-ms);
}}
.viz-flow .node.active {{ background: var(--primary); color: #0a0c10; }}
.viz-flow .flow-edge {{
  width: 40px; height: 2px;
  background: rgba(127,127,127,0.3);
  position: relative;
}}
.viz-flow .flow-edge::after {{
  content: "";
  position: absolute;
  right: 0; top: -4px;
  border: 5px solid transparent;
  border-left: 8px solid rgba(127,127,127,0.3);
}}

/* Visual kind: formula */
.viz-formula {{ text-align: center; }}
.viz-formula .formula-main {{
  font-size: 1.6rem;
  font-weight: 700;
  margin-bottom: 12px;
  font-family: "KaTeX_Main", "Times New Roman", serif;
}}
.viz-formula .emphasis-band {{
  display: inline-block;
  padding: 4px 16px;
  background: rgba(77,232,176,0.12);
  border-radius: 8px;
  font-weight: 600;
  margin-bottom: 12px;
}}

/* Visual kind: graph */
.viz-graph .graph-box {{ display: flex; flex-direction: column; align-items: center; gap: 12px; }}
.viz-graph .graph-nodes {{ display: flex; align-items: center; gap: 24px; }}
.viz-graph .node {{
  width: 44px; height: 44px;
  border-radius: 50%;
  background: rgba(127,127,127,0.15);
  display: flex; align-items: center; justify-content: center;
  font-weight: 600;
  transition: all var(--duration-ms);
}}
.viz-graph .node.active {{ background: var(--primary); color: #0a0c10; box-shadow: 0 0 20px rgba(77,232,176,0.4); }}
.viz-graph .graph-edge {{
  width: 50px; height: 2px;
  background: rgba(127,127,127,0.3);
}}

/* Visual kind: text */
.viz-text {{ max-width: 560px; }}
.viz-text h2 {{ font-size: 1.4rem; margin-bottom: 12px; }}
.viz-text .narration {{ line-height: 1.7; opacity: 0.9; }}

/* Visual kind: motion */
.viz-motion .motion-box {{ width: 100%; max-width: 400px; }}
.viz-motion .motion-path {{
  height: 60px;
  background: linear-gradient(90deg, rgba(127,127,127,0.1) 0%, rgba(127,127,127,0.1) 100%);
  border-radius: 8px;
  position: relative;
  display: flex; align-items: center;
}}
.viz-motion .actor {{
  width: 24px; height: 24px;
  background: var(--primary);
  border-radius: 50%;
  position: absolute;
  left: 10%;
  transition: left var(--duration-ms);
}}

/* Visual kind: circuit */
.viz-circuit .circuit-box {{ display: flex; flex-direction: column; align-items: center; gap: 16px; }}
.viz-circuit .circuit-row {{ display: flex; align-items: center; gap: 20px; }}
.viz-circuit .node {{
  width: 36px; height: 36px;
  border-radius: 50%;
  background: rgba(127,127,127,0.15);
  display: flex; align-items: center; justify-content: center;
  font-weight: 600;
  font-size: 0.85rem;
}}
.viz-circuit .branch {{
  width: 60px; height: 2px;
  background: rgba(127,127,127,0.3);
  position: relative;
}}

/* Visual kind: molecule */
.viz-molecule .molecule-box {{ display: flex; flex-direction: column; align-items: center; gap: 12px; }}
.viz-molecule .molecule-row {{ display: flex; align-items: center; gap: 8px; }}
.viz-molecule .orb {{
  width: 32px; height: 32px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}}
.viz-molecule .bond {{
  width: 40px; height: 4px;
  background: rgba(127,127,127,0.4);
  border-radius: 2px;
}}

/* Visual kind: map */
.viz-map .map-box {{ display: flex; flex-direction: column; align-items: center; gap: 12px; }}
.viz-map .map-row {{ display: flex; gap: 12px; }}
.viz-map .region {{
  padding: 12px 24px;
  background: rgba(127,127,127,0.1);
  border-radius: 8px;
  font-weight: 600;
  transition: all var(--duration-ms);
}}
.viz-map .region.active {{ background: var(--primary); color: #0a0c10; }}
.viz-map .route {{
  width: 200px; height: 4px;
  background: linear-gradient(90deg, var(--primary) 0%, transparent 100%);
  border-radius: 2px;
}}

/* Visual kind: cell */
.viz-cell .cell-box {{ display: flex; flex-direction: column; align-items: center; gap: 12px; }}
.viz-cell .cell-row {{ display: flex; gap: 16px; }}
.viz-cell .organelle {{
  width: 48px; height: 48px;
  border-radius: 50%;
  background: rgba(127,127,127,0.15);
  display: flex; align-items: center; justify-content: center;
  font-size: 0.75rem;
}}

@media (max-width: 920px) {{
  .panel {{ grid-template-columns: 1fr; }}
  .meta {{ display: none; }}
}}
@media (prefers-reduced-motion: reduce) {{
  * {{ animation: none !important; transition: none !important; }}
}}
</style>
</head>
<body data-theme="{theme}">
<div class="shell">
  <header class="header">
    <h1 class="title">{title}</h1>
    <p class="summary">{summary}</p>
  </header>
  <main class="panel">
    <section class="stage-wrap">
      <div id="stage" class="stage" aria-live="polite"></div>
    </section>
    <aside class="meta">
      <section class="card">
        <span id="kind" class="kind">text</span>
        <h2 id="step-title" class="step-title"></h2>
        <p id="narration" class="narration"></p>
        <div id="tokens" class="tokens"></div>
      </section>
      <section class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;">
          <strong>参数</strong>
          <span id="step-counter" class="step-counter">0 / 0</span>
        </div>
        <div id="params" class="param-list" style="margin-top:12px;"></div>
      </section>
    </aside>
  </main>
  <nav class="controls" aria-label="播放控制">
    <button id="prev-btn" type="button" aria-label="上一步">上一步</button>
    <button id="play-btn" class="primary" type="button" aria-label="播放或暂停">播放</button>
    <button id="next-btn" type="button" aria-label="下一步">下一步</button>
    <label style="display:flex;align-items:center;gap:8px;">
      <span>速度</span>
      <input id="speed-input" type="range" min="0.5" max="2" step="0.25" value="1" aria-label="播放速度">
    </label>
  </nav>
</div>
<script>
const cir = {payload};
const steps = Array.isArray(cir.steps) ? cir.steps : [];
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const supportedParams = Array.from(new Set(
  steps.flatMap((step) => (step.tokens || []).map((token) => token.id || token.label)).filter(Boolean)
)).slice(0, 6);
let autoplayTimer = null;

const runtime = {{
  state: {{
    currentStep: 0,
    totalSteps: steps.length,
    autoplay: false,
    speed: 1,
    paused: true,
    params: {{}},
  }},
  notifyParent(type, payload = {{}}) {{
    if (window.parent && window.parent !== window) {{
      window.parent.postMessage({{ type, ...payload }}, "*");
    }}
  }},
  applyTheme(theme) {{
    document.body.dataset.theme = theme === "light" ? "light" : "dark";
  }},
  renderStep(step, prevStep, api) {{
    if (!step) return;
    const stage = document.getElementById("stage");
    document.documentElement.style.setProperty("--duration-ms", prefersReducedMotion.matches ? "0ms" : `${{Math.max(160, Math.round(420 / Math.max(api.state.speed, 0.25)))}}ms`);
    stage.innerHTML = renderVisual(step, api.state);
    document.getElementById("kind").textContent = step.visual_kind || "text";
    document.getElementById("step-title").textContent = step.title || "";
    document.getElementById("narration").textContent = step.narration || "";
    document.getElementById("tokens").innerHTML = (step.tokens || []).map((token) => {{
      const emphasis = ["primary", "secondary", "accent"].includes(token.emphasis) ? token.emphasis : "secondary";
      const text = token.value ? `${{token.label}} = ${{token.value}}` : token.label;
      return `<span class="token token-${{emphasis}}">${{escapeHtml(text || "")}}</span>`;
    }}).join("");
    document.getElementById("step-counter").textContent = `${{api.state.currentStep + 1}} / ${{api.state.totalSteps}}`;
    syncButtons();
    api.notifyParent("step", {{ index: api.state.currentStep }});
    scheduleAutoplay();
  }},
  goToStep(index, reason = "api") {{
    if (!steps.length) return;
    const nextIndex = Math.max(0, Math.min(index, steps.length - 1));
    const prevStep = steps[this.state.currentStep] || null;
    this.state.currentStep = nextIndex;
    this.renderStep(steps[nextIndex], prevStep, this);
  }},
  setParam(key, value) {{
    this.state.params[key] = value;
    syncParams();
    this.notifyParent("paramChange", {{ key, value }});
    this.goToStep(this.state.currentStep, "setParam");
  }},
  setPlayback(update) {{
    if (typeof update.autoplay === "boolean") this.state.autoplay = update.autoplay;
    if (typeof update.paused === "boolean") this.state.paused = update.paused;
    if (typeof update.speed === "number" && Number.isFinite(update.speed)) {{
      this.state.speed = Math.max(0.5, Math.min(update.speed, 2));
    }}
    document.getElementById("speed-input").value = String(this.state.speed);
    document.getElementById("play-btn").textContent = this.state.paused ? "播放" : "暂停";
    this.notifyParent("playback", {{
      paused: this.state.paused,
      autoplay: this.state.autoplay,
      speed: this.state.speed,
    }});
    scheduleAutoplay();
  }},
}};

function escapeHtml(value) {{
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}}

function renderVisual(step, state) {{
  const labels = (step.tokens || []).map((token) => token.value || token.label);
  const safeTitle = escapeHtml(step.title || "");
  const safeNarration = escapeHtml(step.narration || "");
  const first = escapeHtml(labels[0] || "A");
  const second = escapeHtml(labels[1] || "B");
  const third = escapeHtml(labels[2] || "C");
  switch (step.visual_kind) {{
    case "array":
      return `<div class="viz-array"><div class="array-track"><div class="cells">${{labels.slice(0, 8).map((label) => `<div class="cell">${{escapeHtml(label)}}</div>`).join("") || '<div class="cell">0</div><div class="cell">1</div><div class="cell">2</div>'}}</div></div></div>`;
    case "flow":
      return `<div class="viz-flow"><div class="flow-grid"><div class="flow-nodes"><div class="node">${{first}}</div><div class="flow-edge"></div><div class="node">${{second}}</div><div class="flow-edge"></div><div class="node">${{third}}</div></div></div></div>`;
    case "formula":
      return `<div class="viz-formula"><div class="formula-main">${{first}}</div><div class="emphasis-band">${{second || "关键项"}}</div></div>`;
    case "graph":
      return `<div class="viz-graph"><div class="graph-box"><div class="graph-nodes"><div class="node">${{first}}</div><div class="graph-edge"></div><div class="node">${{second}}</div><div class="graph-edge"></div><div class="node">${{third}}</div></div></div></div>`;
    case "motion":
      return `<div class="viz-motion"><div class="motion-box"><div class="motion-path"><div class="actor" style="left:${{10 + ((state.currentStep + 1) / Math.max(state.totalSteps, 1)) * 70}}%;"></div></div></div></div>`;
    case "circuit":
      return `<div class="viz-circuit"><div class="circuit-box"><div class="circuit-row"><div class="node">R</div><div class="branch"></div><div class="node">C</div><div class="branch"></div><div class="node">V</div></div></div></div>`;
    case "molecule":
      return `<div class="viz-molecule"><div class="molecule-box"><div class="molecule-row"><div class="orb"></div><div class="bond"></div><div class="orb"></div><div class="bond"></div><div class="orb"></div></div></div></div>`;
    case "map":
      return `<div class="viz-map"><div class="map-box"><div class="map-row"><div class="region">${{first}}</div><div class="region">${{second}}</div><div class="region">${{third}}</div></div></div></div>`;
    case "cell":
      return `<div class="viz-cell"><div class="cell-box"><div class="cell-row"><div class="organelle">核</div><div class="organelle">线粒体</div><div class="organelle">ER</div></div></div></div>`;
    case "text":
    default:
      return `<div class="viz-text"><h2>${{safeTitle}}</h2><p class="narration">${{safeNarration}}</p></div>`;
  }}
}}

function scheduleAutoplay() {{
  window.clearTimeout(autoplayTimer);
  if (runtime.state.paused || !runtime.state.autoplay || prefersReducedMotion.matches) return;
  if (runtime.state.currentStep >= runtime.state.totalSteps - 1) return;
  const interval = Math.max(240, Math.round(1200 / Math.max(runtime.state.speed, 0.25)));
  autoplayTimer = window.setTimeout(() => runtime.goToStep(runtime.state.currentStep + 1, "autoplay"), interval);
}}

function syncButtons() {{
  document.getElementById("prev-btn").disabled = runtime.state.currentStep <= 0;
  document.getElementById("next-btn").disabled = runtime.state.currentStep >= runtime.state.totalSteps - 1;
}}

function syncParams() {{
  const root = document.getElementById("params");
  root.innerHTML = supportedParams.map((key) => {{
    const value = runtime.state.params[key] ?? "";
    return `<div class="param-row"><label>${{escapeHtml(key)}}</label><input data-param-key="${{escapeHtml(key)}}" value="${{escapeHtml(value)}}" /></div>`;
  }}).join("") || '<div style="opacity:0.6;font-size:0.8rem;">无参数</div>';
}}

document.addEventListener("input", (event) => {{
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  if (target.matches("[data-param-key]")) runtime.setParam(target.dataset.paramKey, target.value);
  if (target.id === "speed-input") runtime.setPlayback({{ speed: Number(target.value), autoplay: runtime.state.autoplay, paused: runtime.state.paused }});
}});

window.addEventListener("message", (event) => {{
  const message = event.data;
  if (!message || typeof message !== "object" || typeof message.type !== "string") return;
  if (message.type === "goToStep") {{
    runtime.goToStep(Number(message.index || 0), message.type);
    return;
  }}
  if (message.type === "setParam" && typeof message.key === "string") {{
    runtime.setParam(message.key, message.value);
    return;
  }}
  if (message.type === "playback") {{
    runtime.setPlayback({{
      autoplay: typeof message.autoplay === "boolean" ? message.autoplay : runtime.state.autoplay,
      paused: typeof message.paused === "boolean" ? message.paused : runtime.state.paused,
      speed: typeof message.speed === "number" ? message.speed : runtime.state.speed,
    }});
  }}
}});

document.getElementById("prev-btn").addEventListener("click", () => runtime.goToStep(runtime.state.currentStep - 1, "prev"));
document.getElementById("next-btn").addEventListener("click", () => runtime.goToStep(runtime.state.currentStep + 1, "next"));
document.getElementById("play-btn").addEventListener("click", () => {{
  runtime.setPlayback({{
    autoplay: true,
    paused: !runtime.state.paused,
    speed: runtime.state.speed,
  }});
}});

document.addEventListener("DOMContentLoaded", () => {{
  runtime.applyTheme(document.body.dataset.theme || "{theme}");
  syncParams();
  runtime.goToStep(0, "init");
  runtime.notifyParent("ready", {{
    totalSteps: runtime.state.totalSteps,
    supportedParams,
    capabilities: {{
      playback: true,
      params: true,
      theme: true,
      reducedMotionAware: true,
    }},
  }});
  runtime.notifyParent("playback", {{
    paused: runtime.state.paused,
    autoplay: runtime.state.autoplay,
    speed: runtime.state.speed,
  }});
}});
</script>
</body>
</html>"""
