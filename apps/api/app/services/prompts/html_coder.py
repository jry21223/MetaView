"""HTML coder prompt + fixed scaffold assembly for interactive previews."""

from __future__ import annotations

import html as html_lib
import json
import math
import re

from app.schemas import (
    CirDocument,
    HtmlAnimationKind,
    HtmlAnimationPayload,
    HtmlAnimationParam,
)

HTML_CODER_PROMPT_VERSION = "5.0.0"

_SYSTEM_RULES = """\
You are an expert educational animation designer.

## Goal
Return a compact JSON animation payload for a fixed local HTML scaffold.
The backend already owns the HTML shell, styles, GSAP/p5 imports,
postMessage bridge, theme sync, and playback controls.

## Output format
Return ONLY a single JSON object.
Do not return markdown explanations.
You may wrap the JSON in ```json fences, but the payload itself must remain one
valid JSON object.

## Forbidden
- Do NOT output <!DOCTYPE html>, <html>, <head>, <body>, <script>, or <style>
- Do NOT output window.parent.postMessage, addEventListener("message"), or any
  iframe communication code
- Do NOT reference external URLs, network requests, storage APIs, cookies, or
  browser persistence
- Do NOT emit English student-facing UI copy unless it is part of source code
  identifiers or formulas

## Animation priority
- Prefer a real animation process over static summary cards
- Keep each step focused on one visible transition
- For flow topics, show progression, branching, comparison, activation, and
  return paths when the material implies them
- Reuse the provided CIR as subject matter only; do not mechanically mirror it
  into a straight vertical stack

## Required payload schema
{
  "kind": "generic|logic_flow",
  "title": "string",
  "summary": "string",
  "steps": [
    {
      "id": "string",
      "title": "string",
      "narration": "string",
      "visual_kind": "array|flow|formula|graph|text|motion|circuit|molecule|map|cell",
      "tokens": [
        {
          "id": "string",
          "label": "string",
          "value": "string or null",
          "emphasis": "primary|secondary|accent"
        }
      ],
      "duration_ms": 600,
      "emphasis_token_ids": ["token-id"]
    }
  ],
  "params": [
    {
      "key": "string",
      "label": "string",
      "value": "string"
    }
  ],
  "flow_nodes": [
    {
      "id": "n1",
      "x": 400,
      "y": 60,
      "label": "初始化",
      "kind": "start|process|decision|end"
    }
  ],
  "flow_links": [
    {
      "id": "l1",
      "from": "n1",
      "to": "n2",
      "label": "是"
    }
  ],
  "flow_steps": [
    {
      "id": "fs1",
      "message": "第一步：初始化变量",
      "highlight_node": "n1",
      "pulse_link_ids": ["l1"],
      "activate_node_ids": ["n1"],
      "duration_ms": 700
    }
  ]
}

## Logic-flow rules
- `logic_flow` 适合**线性/分支的判定流程**：排序的一轮比较、BFS/DFS 访问序列、状态机转换、if-else/while 执行路径
- **不适合 logic_flow 的场景**（改用 `generic`）：
  - 递归算法（汉诺塔、斐波那契、快排分治）——用 `motion` 或 `array` 展示每步调用栈/状态
  - 物理运动过程——用 `motion`
  - 数学公式推导——用 `formula`
  - steps 超过 8 个的长流程——拆分成关键决策节点，不要逐行翻译代码
- `logic_flow` 必须提供 `flow_nodes`、`flow_links`、`flow_steps`
- `flow_steps` 必须描述逐步动画，而不是静态解说
- flow_nodes 总数不超过 8 个；节点 label 最多 6 个汉字或 8 个 ASCII 字符，超过截断
- 坐标范围：x 在 [50, 750]，y 在 [50, 370]；节点之间 x 间距 ≥ 160，y 间距 ≥ 80
- `flow_links`、`pulse_link_ids`、`highlight_node` 必须引用已存在的 id
- 避免把所有节点堆成同一列；优先形成可读的拓扑结构
- 链路标签应有语义，如”进入判断””是””否””继续循环””输出结果”

## Content rules
- 所有面向学生的文案必须使用中文
- steps 只保留真正影响动画展示的内容
- narration 要简短、可讲解
- tokens 数量保持精简，优先 2-6 个
- 如果信息不完整，也要给出可运行的占位内容，不要返回空 steps
"""

_DEFAULT_LAYOUT = {"x": 64, "y": 96, "width": 640, "height": 120}
_DECISION_HINTS = ("判断", "是否", "?", "？", "比较", "条件", "检查", "命中")
_TERMINAL_HINTS = ("结束", "完成", "输出", "停止", "终止", "有序", "结果")
_RECURSIVE_HINTS = ("汉诺塔", "Hanoi", "hanoi")
_LOOP_HINTS = ("继续", "下一轮", "重复", "回到", "循环", "迭代", "再次")


def _looks_recursive(cir: CirDocument) -> bool:
    haystack = " ".join(
        [cir.title, cir.summary, *[step.title for step in cir.steps], *[step.narration for step in cir.steps]]
    )
    return any(hint.lower() in haystack.lower() for hint in _RECURSIVE_HINTS)


def _build_hanoi_steps(cir: CirDocument) -> list[dict[str, object]]:
    rod_names = ["A 柱", "B 柱", "C 柱"]
    parsed_moves: list[tuple[str, str, str]] = []
    for step in cir.steps:
        values = [str(token.value or token.label or "") for token in step.tokens]
        joined = " ".join([step.title, step.narration, *values])
        match = re.search(r"([ABC])\s*(?:→|->|到)\s*([ABC])", joined, flags=re.IGNORECASE)
        if match:
            from_rod = match.group(1).upper()
            to_rod = match.group(2).upper()
            disk_match = re.search(r"(?:盘子|圆盘|盘|disk)\s*([1-9])", joined, flags=re.IGNORECASE)
            disk = disk_match.group(1) if disk_match else str((len(parsed_moves) % 3) + 1)
            parsed_moves.append((disk, from_rod, to_rod))

    if not parsed_moves:
        parsed_moves = [("1", "A", "C"), ("2", "A", "B"), ("1", "C", "B")]

    rendered_steps: list[dict[str, object]] = []
    for index, (disk, from_rod, to_rod) in enumerate(parsed_moves[:12]):
        rendered_steps.append(
            {
                "id": cir.steps[index].id if index < len(cir.steps) else f"step-{index + 1}",
                "title": f"第 {index + 1} 步：{from_rod}→{to_rod}",
                "narration": f"将 {disk} 号盘从 {from_rod} 柱移动到 {to_rod} 柱。",
                "visual_kind": "motion",
                "tokens": [
                    {"id": f"disk-{index + 1}", "label": "移动盘", "value": disk, "emphasis": "primary"},
                    {"id": f"from-{index + 1}", "label": "起点", "value": f"{from_rod} 柱", "emphasis": "secondary"},
                    {"id": f"to-{index + 1}", "label": "终点", "value": f"{to_rod} 柱", "emphasis": "accent"},
                ],
                "duration_ms": 900,
                "emphasis_token_ids": [f"disk-{index + 1}"],
            }
        )

    return rendered_steps


def _compact_mapping(data: dict[str, object]) -> dict[str, object]:
    compact: dict[str, object] = {}
    for key, value in data.items():
        if value is None:
            continue
        if isinstance(value, str) and not value:
            continue
        if isinstance(value, (list, tuple, dict)) and not value:
            continue
        compact[key] = value
    return compact


def _serialize_json_block(data: dict[str, object]) -> str:
    return json.dumps(data, ensure_ascii=False, indent=2)


def build_html_coder_cir_context_json(cir: CirDocument) -> str:
    return _serialize_json_block(
        {
            "title": cir.title,
            "domain": cir.domain.value,
            "summary": cir.summary,
            "step_count": len(cir.steps),
            "steps": [
                _compact_mapping(
                    {
                        "id": step.id,
                        "title": step.title,
                        "narration": step.narration,
                        "visual_kind": step.visual_kind.value,
                        "layout": step.layout.model_dump(mode="json"),
                        "tokens": [token.model_dump(mode="json") for token in step.tokens[:6]],
                        "annotations": step.annotations[:4],
                    }
                )
                for step in cir.steps[:12]
            ],
        }
    )


def build_html_coder_system_prompt(
    domain: str,
    title: str,
    summary: str,
    cir_context_json: str,
    ui_theme: str | None = None,
    original_prompt: str | None = None,
    skill_id: str | None = None,
    skill_label: str | None = None,
    skill_notes: list[str] | tuple[str, ...] | None = None,
    source_code_language: str | None = None,
    source_image_name: str | None = None,
    supports_image_input: bool | None = None,
) -> str:
    runtime_metadata = _compact_mapping(
        {
            "prompt_version": HTML_CODER_PROMPT_VERSION,
            "domain": domain,
            "title": title,
            "ui_theme": ui_theme,
            "supports_image_input": supports_image_input,
            "skill_id": skill_id,
            "skill_label": skill_label,
            "source_code_language": source_code_language,
            "source_image_name": source_image_name,
            "skill_note_count": len(skill_notes or []),
            "has_original_prompt": bool(original_prompt),
            "has_summary": bool(summary),
            "cir_context_bytes": len(cir_context_json),
        }
    )
    return f"{_SYSTEM_RULES}\n\n## Runtime metadata\n{_serialize_json_block(runtime_metadata)}"


def build_html_coder_user_prompt(
    title: str,
    domain: str,
    summary: str,
    cir_context_json: str,
    ui_theme: str | None = None,
    original_prompt: str | None = None,
    source_code: str | None = None,
    source_code_language: str | None = None,
    source_image: str | None = None,
    source_image_name: str | None = None,
    skill_id: str | None = None,
    skill_label: str | None = None,
    skill_notes: list[str] | tuple[str, ...] | None = None,
) -> str:
    prompt_context = _compact_mapping(
        {
            "request": _compact_mapping(
                {
                    "title": title,
                    "domain": domain,
                    "summary": summary,
                    "ui_theme": ui_theme,
                    "original_prompt": original_prompt,
                }
            ),
            "skill_context": _compact_mapping(
                {
                    "id": skill_id,
                    "label": skill_label,
                    "notes": list(skill_notes or []),
                }
            ),
            "source_context": _compact_mapping(
                {
                    "code_language": source_code_language,
                    "code": source_code,
                    "image_name": source_image_name,
                    "image": source_image,
                }
            ),
            "cir": json.loads(cir_context_json),
            "design_goal": {
                "prefer_dynamic_runtime": True,
                "prefer_semantic_flow_topology": True,
                "avoid_static_vertical_stack": True,
                "keep_student_copy_in_chinese": True,
            },
        }
    )
    return _serialize_json_block(prompt_context)


# ── Free-form HTML generation (no schema / scaffold constraints) ─────────────

FREE_HTML_PROMPT_VERSION = "1.0.0"

_FREE_HTML_SYSTEM_PROMPT = """\
You are a world-class educational visualization engineer.

## Task
Generate a complete, self-contained, animated HTML page that visually explains the given educational topic.

## Output
Return ONLY the raw HTML document. Start with <!DOCTYPE html> and end with </html>.
No markdown code fences. No explanations. Just the HTML.

## Required iframe postMessage bridge (MANDATORY)
The page runs inside a sandboxed iframe. You MUST implement both sides:

### 1. Announce readiness on DOMContentLoaded
window.parent.postMessage({ type: "ready", totalSteps: N }, "*");
// N = actual number of animation steps (minimum 1)

### 2. Listen for host commands
window.addEventListener("message", function(e) {
  var d = e.data;
  if (!d || !d.type) return;
  if (d.type === "goToStep")  { /* jump to animation step d.index (0-based) */ }
  if (d.type === "theme")     { /* switch to d.theme: "dark" or "light" */ }
  if (d.type === "playback")  { /* d.autoplay: bool, d.speed: number */ }
});

## Allowed external libraries (no other external URLs allowed)
- GSAP 3.13: https://cdn.jsdelivr.net/npm/gsap@3.13/dist/gsap.min.js
- p5.js 1.11.8: https://cdn.jsdelivr.net/npm/p5@1.11.8/lib/p5.min.js
Both are optional — only include what you actually use.

## Design requirements
- Rich, fluid animations — not static text boxes or placeholder diagrams
- Every step must show a meaningful visual transition or state change
- All student-facing text in Chinese
- Fits within 800×600 viewport, no scrollbars
- Support dark and light themes using the CSS variables provided
- At least 3 animation steps
- Use event listeners (addEventListener), NOT inline HTML event attributes (onclick=, onload=, etc.)
"""


def build_free_html_system_prompt() -> str:
    return _FREE_HTML_SYSTEM_PROMPT


def build_free_html_user_prompt(
    title: str,
    domain: str,
    ui_theme: str | None = None,
) -> str:
    theme = ui_theme if ui_theme in ("dark", "light") else "dark"
    if theme == "dark":
        colors = [
            ("--bg", "#0a0c10"),
            ("--surface", "#12151a"),
            ("--text", "#e8ecf4"),
            ("--primary", "#4de8b0"),
            ("--accent", "#ff9e8a"),
        ]
    else:
        colors = [
            ("--bg", "#f5f7fa"),
            ("--surface", "#ffffff"),
            ("--text", "#141820"),
            ("--primary", "#00896e"),
            ("--accent", "#96463c"),
        ]
    color_block = "\n".join(f"  {k}: {v};" for k, v in colors)
    return (
        f"题目：{title}\n"
        f"学科：{domain}\n"
        f"主题：{theme}\n\n"
        f"配色（在 :root 中使用这些变量）：\n"
        f":root {{\n{color_block}\n}}"
    )


def _flow_node_kind(title: str, index: int, total_steps: int) -> str:
    if index == 0:
        return "start"
    if any(hint in title for hint in _TERMINAL_HINTS) or index == total_steps - 1:
        return "end"
    if any(hint in title for hint in _DECISION_HINTS):
        return "decision"
    return "process"


def _flow_link_label(current_title: str, next_title: str, next_kind: str) -> str:
    if next_kind == "decision":
        return "进入判断"
    if next_kind == "end":
        return "输出结果"
    if any(hint in current_title or hint in next_title for hint in _LOOP_HINTS):
        return "继续循环"
    return "进入下一步"


def _build_logic_flow_topology(cir: CirDocument) -> tuple[list[dict[str, object]], list[dict[str, object]], list[dict[str, object]]]:
    total_steps = max(len(cir.steps), 1)
    # Layout: distribute nodes across 800×420 viewBox with at most 4 columns
    max_cols = min(4, total_steps)
    col_spacing = min(200, 760 // max(max_cols, 1))
    row_spacing = min(100, 380 // max(math.ceil(total_steps / max_cols), 1))
    margin_x = (800 - col_spacing * (max_cols - 1)) // 2
    top_y = 60
    flow_nodes: list[dict[str, object]] = []
    flow_links: list[dict[str, object]] = []
    flow_steps: list[dict[str, object]] = []
    node_ids: list[str] = []

    for index, step in enumerate(cir.steps):
        node_id = f"node-{index + 1}"
        node_ids.append(node_id)
        labels = [token.value or token.label for token in step.tokens if (token.value or token.label)]
        fallback_label = step.title.strip() or (labels[0] if labels else f"步骤 {index + 1}")
        node_kind = _flow_node_kind(fallback_label, index, total_steps)

        col = index % max_cols
        row = index // max_cols
        x = margin_x + col * col_spacing
        y = top_y + row * row_spacing

        flow_nodes.append(
            {
                "id": node_id,
                "x": x,
                "y": y,
                "label": fallback_label[:14],
                "kind": node_kind,
            }
        )

        if index > 0:
            previous_step = cir.steps[index - 1]
            previous_title = previous_step.title.strip() or f"步骤 {index}"
            previous_kind = flow_nodes[index - 1]["kind"]
            link_id = f"link-{index}"
            flow_links.append(
                {
                    "id": link_id,
                    "from": node_ids[index - 1],
                    "to": node_id,
                    "label": _flow_link_label(previous_title, fallback_label, node_kind),
                }
            )
            if previous_kind == "decision" and node_kind != "end":
                branch_link_id = f"link-branch-{index}"
                flow_links.append(
                    {
                        "id": branch_link_id,
                        "from": node_ids[index - 1],
                        "to": node_id,
                        "label": "是" if index % 2 else "否",
                    }
                )

        pulse_link_ids = [link["id"] for link in flow_links if link["to"] == node_id][-2:]
        message = step.narration.strip() or step.title.strip() or f"步骤 {index + 1}"
        flow_steps.append(
            {
                "id": f"flow-step-{index + 1}",
                "message": message[:400],
                "highlight_node": node_id,
                "pulse_link_ids": pulse_link_ids,
                "activate_node_ids": node_ids[: index + 1],
                "duration_ms": 880 if index == 0 else 760,
            }
        )

    return flow_nodes, flow_links, flow_steps



def build_html_animation_payload_from_cir(cir: CirDocument) -> HtmlAnimationPayload:
    params = []
    seen_keys: set[str] = set()
    for step in cir.steps:
        for token in step.tokens:
            key = (token.id or token.label).strip()
            if not key or key in seen_keys:
                continue
            seen_keys.add(key)
            params.append(
                HtmlAnimationParam(
                    key=key,
                    label=token.label or key,
                    value=token.value or "",
                )
            )
            if len(params) >= 6:
                break
        if len(params) >= 6:
            break

    generic_steps = [
        {
            "id": step.id,
            "title": step.title,
            "narration": step.narration,
            "visual_kind": step.visual_kind,
            "tokens": [token.model_dump(mode="json") for token in step.tokens],
            "duration_ms": 700,
            "emphasis_token_ids": [token.id for token in step.tokens[:2] if token.id],
        }
        for step in cir.steps
    ]

    if _looks_recursive(cir):
        generic_steps = _build_hanoi_steps(cir)
        return HtmlAnimationPayload.model_validate(
            {
                "kind": HtmlAnimationKind.GENERIC,
                "title": cir.title,
                "summary": cir.summary,
                "steps": generic_steps,
                "params": [param.model_dump(mode="json") for param in params],
            }
        )

    should_use_logic_flow = any(
        getattr(step.visual_kind, "value", step.visual_kind) == "flow" for step in cir.steps
    )
    if should_use_logic_flow:
        flow_nodes, flow_links, flow_steps = _build_logic_flow_topology(cir)
        return HtmlAnimationPayload.model_validate(
            {
                "kind": HtmlAnimationKind.LOGIC_FLOW,
                "title": cir.title,
                "summary": cir.summary,
                "steps": generic_steps,
                "params": [param.model_dump(mode="json") for param in params],
                "flow_nodes": flow_nodes,
                "flow_links": flow_links,
                "flow_steps": flow_steps,
            }
        )

    return HtmlAnimationPayload.model_validate(
        {
            "kind": HtmlAnimationKind.GENERIC,
            "title": cir.title,
            "summary": cir.summary,
            "steps": generic_steps,
            "params": [param.model_dump(mode="json") for param in params],
        }
    )


def _escape_script_json(value: object) -> str:
    return (
        json.dumps(value, ensure_ascii=False)
        .replace("<", "\\u003c")
        .replace(">", "\\u003e")
        .replace("&", "\\u0026")
        .replace("\u2028", "\\u2028")
        .replace("\u2029", "\\u2029")
    )


def build_html_scaffold_document(
    payload: HtmlAnimationPayload | dict,
    ui_theme: str | None = None,
    *,
    is_fallback: bool = False,
) -> str:
    animation_payload = HtmlAnimationPayload.model_validate(payload)
    theme = "light" if ui_theme == "light" else "dark"
    template = """<!DOCTYPE html>
<html lang="zh-CN" data-metaview-runtime="scaffold"__FALLBACK_ATTR__>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>__TITLE__</title>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.13/dist/gsap.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/p5@1.11.8/lib/p5.min.js"></script>
<style>
:root {
  --bg-dark: #0a0c10;
  --surface-dark: #12151a;
  --surface-elevated-dark: rgba(18, 21, 26, 0.84);
  --text-dark: #e8ecf4;
  --primary-dark: #4de8b0;
  --accent-dark: #ff9e8a;
  --glow-dark: rgba(77, 232, 176, 0.24);
  --bg-light: #f5f7fa;
  --surface-light: #ffffff;
  --surface-elevated-light: rgba(255, 255, 255, 0.9);
  --text-light: #141820;
  --primary-light: #00896e;
  --accent-light: #96463c;
  --glow-light: rgba(0, 137, 110, 0.12);
  --duration-ms: 320ms;
  --flow-link: rgba(127,127,127,0.28);
  --flow-link-active: rgba(77,232,176,0.92);
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; overflow: hidden; }
body {
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
  transition: background 0.25s ease, color 0.25s ease;
}
body[data-theme="dark"] {
  background:
    radial-gradient(circle at top left, rgba(77, 232, 176, 0.12), transparent 32%),
    radial-gradient(circle at 88% 16%, rgba(255, 158, 138, 0.12), transparent 24%),
    linear-gradient(180deg, #0d1118 0%, var(--bg-dark) 100%);
  color: var(--text-dark);
  --bg: var(--bg-dark);
  --surface: var(--surface-dark);
  --surface-elevated: var(--surface-elevated-dark);
  --text: var(--text-dark);
  --primary: var(--primary-dark);
  --accent: var(--accent-dark);
  --glow: var(--glow-dark);
  --panel-outline: rgba(255,255,255,0.08);
  --panel-shadow: 0 22px 48px rgba(0, 0, 0, 0.32);
}
body[data-theme="light"] {
  background:
    radial-gradient(circle at top left, rgba(0, 137, 110, 0.09), transparent 30%),
    radial-gradient(circle at 88% 18%, rgba(150, 70, 60, 0.1), transparent 22%),
    linear-gradient(180deg, #fbfcfe 0%, var(--bg-light) 100%);
  color: var(--text-light);
  --bg: var(--bg-light);
  --surface: var(--surface-light);
  --surface-elevated: var(--surface-elevated-light);
  --text: var(--text-light);
  --primary: var(--primary-light);
  --accent: var(--accent-light);
  --glow: var(--glow-light);
  --panel-outline: rgba(20,24,32,0.08);
  --panel-shadow: 0 20px 44px rgba(31, 48, 78, 0.12);
}
.shell {
  height: 100vh;
  display: grid;
  grid-template-rows: auto 1fr auto;
  gap: 14px;
  padding: 18px;
}
.header {
  text-align: center;
  padding: 12px 18px 6px;
  backdrop-filter: blur(18px);
}
.title {
  font-size: 1.3rem;
  font-weight: 800;
  letter-spacing: 0.01em;
  margin-bottom: 8px;
}
.summary {
  font-size: 0.88rem;
  opacity: 0.72;
  max-width: 720px;
  margin: 0 auto;
  line-height: 1.7;
}
.panel { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 18px; min-height: 0; }
.stage-wrap {
  position: relative;
  background: linear-gradient(180deg, var(--surface-elevated) 0%, var(--surface) 100%);
  border-radius: 24px;
  padding: 18px;
  overflow: hidden;
  border: 1px solid var(--panel-outline);
  box-shadow: var(--panel-shadow);
}
.stage-wrap::before {
  content: "";
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at top, color-mix(in srgb, var(--glow) 78%, transparent), transparent 56%);
  pointer-events: none;
}
.stage {
  min-height: 100%;
  position: relative;
  border-radius: 20px;
  overflow: hidden;
  isolation: isolate;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--surface) 72%, transparent), color-mix(in srgb, var(--bg) 80%, transparent)),
    radial-gradient(circle at top, color-mix(in srgb, var(--glow) 55%, transparent), transparent 40%);
  border: 1px solid color-mix(in srgb, var(--panel-outline) 84%, transparent);
}
.p5-stage { position: absolute; inset: 0; z-index: 0; opacity: 0.94; }
.p5-stage canvas { width: 100% !important; height: 100% !important; display: block; }
.dom-stage {
  position: relative;
  z-index: 1;
  min-height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 28px;
}
.meta { display: flex; flex-direction: column; gap: 14px; }
.card {
  background: linear-gradient(180deg, var(--surface-elevated) 0%, var(--surface) 100%);
  border-radius: 18px;
  padding: 16px;
  border: 1px solid var(--panel-outline);
  box-shadow: var(--panel-shadow);
  backdrop-filter: blur(18px);
}
.kind { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; opacity: 0.58; margin-bottom: 8px; }
.step-title { font-weight: 800; font-size: 1.1rem; margin-bottom: 10px; }
.narration { font-size: 0.92rem; line-height: 1.72; opacity: 0.84; }
.tokens { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.token {
  padding: 6px 11px;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 700;
  border: 1px solid transparent;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.08);
}
.token-primary {
  background: color-mix(in srgb, var(--primary) 16%, transparent);
  color: var(--primary);
  border-color: color-mix(in srgb, var(--primary) 18%, transparent);
}
.token-secondary {
  background: rgba(127,127,127,0.1);
  color: inherit;
  opacity: 0.84;
  border-color: rgba(127,127,127,0.14);
}
.token-accent {
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 18%, transparent);
}
.param-list { display: flex; flex-direction: column; gap: 10px; margin-top: 12px; }
.param-row { display: flex; flex-direction: column; gap: 6px; }
.param-row label { font-size: 0.76rem; opacity: 0.72; }
.param-row input {
  padding: 8px 11px;
  border-radius: 10px;
  border: 1px solid rgba(127,127,127,0.18);
  background: color-mix(in srgb, var(--bg) 88%, transparent);
  color: inherit;
  font-size: 0.86rem;
}
.param-row input:focus {
  outline: none;
  border-color: color-mix(in srgb, var(--primary) 36%, transparent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 14%, transparent);
}
.controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 12px 14px;
  background: linear-gradient(180deg, var(--surface-elevated) 0%, var(--surface) 100%);
  border-radius: 16px;
  border: 1px solid var(--panel-outline);
  box-shadow: var(--panel-shadow);
}
.controls button {
  padding: 9px 16px;
  border: 1px solid rgba(127,127,127,0.16);
  border-radius: 10px;
  cursor: pointer;
  font-weight: 700;
  font-size: 0.85rem;
  background: rgba(127,127,127,0.12);
  color: inherit;
  transition: transform 0.18s ease, background 0.18s ease, border-color 0.18s ease;
}
.controls button:hover:not(:disabled) {
  transform: translateY(-1px);
  background: rgba(127,127,127,0.18);
}
.controls button.primary {
  background: linear-gradient(135deg, var(--primary) 0%, color-mix(in srgb, var(--primary) 74%, var(--accent)) 100%);
  color: #0a0c10;
  border-color: transparent;
}
.controls button:disabled { opacity: 0.4; cursor: not-allowed; }
.controls input[type="range"] { width: 120px; accent-color: var(--primary); }
.step-counter { font-size: 0.85rem; opacity: 0.7; min-width: 3em; text-align: center; }
#canvas-flow {
  width: 100%;
  height: 100%;
  min-height: 360px;
  overflow: visible;
}
.flow-canvas-shell {
  width: 100%;
  padding: 16px;
  border-radius: 24px;
  background: radial-gradient(circle at top, color-mix(in srgb, var(--primary) 12%, transparent), transparent 48%), linear-gradient(180deg, color-mix(in srgb, var(--surface) 82%, transparent), color-mix(in srgb, var(--bg) 88%, transparent));
  border: 1px solid color-mix(in srgb, var(--primary) 12%, var(--panel-outline));
  box-shadow: 0 24px 64px rgba(0,0,0,0.16), inset 0 1px 0 rgba(255,255,255,0.05);
}
.flow-link-base {
  stroke: var(--flow-link);
  stroke-width: 4;
  fill: none;
  stroke-linecap: round;
  opacity: 0.76;
}
.flow-link-pulse {
  stroke: var(--flow-link-active);
  stroke-width: 6;
  fill: none;
  stroke-linecap: round;
  stroke-dasharray: 16 12;
  opacity: 0;
  filter: drop-shadow(0 0 8px color-mix(in srgb, var(--primary) 38%, transparent));
}
.flow-node-shape {
  fill: color-mix(in srgb, var(--surface) 86%, transparent);
  stroke: color-mix(in srgb, var(--text) 16%, transparent);
  stroke-width: 2;
}
.flow-node-label {
  font-size: 14px;
  font-weight: 700;
  fill: var(--text);
  text-anchor: middle;
  dominant-baseline: middle;
}
.flow-node { transform-box: fill-box; transform-origin: center; }
.flow-node.is-active .flow-node-shape {
  fill: color-mix(in srgb, var(--primary) 18%, var(--surface));
  stroke: color-mix(in srgb, var(--primary) 88%, white);
  stroke-width: 3;
}
.flow-node.is-visited .flow-node-shape {
  fill: color-mix(in srgb, var(--primary) 10%, var(--surface));
}
.flow-node.is-highlighted .flow-node-shape {
  filter: drop-shadow(0 0 18px color-mix(in srgb, var(--primary) 38%, transparent));
}
.flow-runtime-top {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.flow-progress-stack {
  flex: 1 1 240px;
  min-width: 220px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.flow-progress-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 0.76rem;
  opacity: 0.76;
  letter-spacing: 0.02em;
}
.flow-progress-track {
  width: 100%;
  height: 10px;
  border-radius: 999px;
  overflow: hidden;
  background: color-mix(in srgb, var(--text) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--primary) 18%, transparent);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.05);
}
.flow-progress-bar {
  height: 100%;
  width: 0;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--primary) 0%, color-mix(in srgb, var(--primary) 68%, var(--accent)) 100%);
  box-shadow: 0 0 22px color-mix(in srgb, var(--glow) 88%, transparent);
  transform-origin: left center;
}
.flow-desc {
  margin: 0;
  text-align: left;
  font-size: 0.97rem;
  line-height: 1.72;
  opacity: 0.9;
}
.flow-message-card {
  width: 100%;
  max-width: 700px;
  margin-top: 18px;
  padding: 18px 20px;
  border-radius: 22px;
  text-align: left;
  background: linear-gradient(180deg, color-mix(in srgb, var(--surface) 82%, transparent), color-mix(in srgb, var(--bg) 88%, transparent));
  border: 1px solid color-mix(in srgb, var(--primary) 16%, var(--panel-outline));
  box-shadow: 0 18px 48px rgba(0,0,0,0.16), inset 0 1px 0 rgba(255,255,255,0.05);
  position: relative;
  overflow: hidden;
}
.flow-message-card::before {
  content: "";
  position: absolute;
  inset: 0 auto auto 0;
  width: 100%;
  height: 1px;
  background: linear-gradient(90deg, color-mix(in srgb, var(--primary) 0%, transparent), color-mix(in srgb, var(--primary) 72%, white), color-mix(in srgb, var(--accent) 0%, transparent));
  opacity: 0.7;
}
.flow-message-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  opacity: 0.76;
}
.flow-message-label::before {
  content: "";
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--primary);
  box-shadow: 0 0 0 6px color-mix(in srgb, var(--primary) 16%, transparent);
}
.flow-message-caption {
  margin-top: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  font-size: 0.82rem;
  color: color-mix(in srgb, var(--text) 72%, var(--primary));
}
.flow-message-caption span {
  padding: 6px 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--primary) 9%, transparent);
  border: 1px solid color-mix(in srgb, var(--primary) 14%, transparent);
}
.flow-step-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;
  padding: 7px 12px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--primary) 10%, transparent);
  color: color-mix(in srgb, var(--primary) 84%, white);
  border: 1px solid color-mix(in srgb, var(--primary) 18%, transparent);
  font-size: 0.78rem;
  font-weight: 700;
}
.flow-step-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 0 6px color-mix(in srgb, currentColor 18%, transparent);
}
.viz-array .cells,
.viz-flow .flow-nodes,
.viz-graph .graph-nodes,
.viz-map .map-row,
.viz-cell .cell-row,
.viz-molecule .molecule-row,
.viz-circuit .circuit-row {
  display: flex;
  align-items: center;
  gap: 10px;
  justify-content: center;
  flex-wrap: wrap;
}
.viz-array .cell,
.viz-flow .node,
.viz-graph .node,
.viz-map .region,
.viz-cell .organelle,
.viz-circuit .node {
  min-width: 44px;
  min-height: 44px;
  padding: 10px 14px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--surface) 72%, transparent);
  border: 1px solid var(--panel-outline);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.06);
}
.viz-array .cell.active,
.viz-flow .node.active,
.viz-graph .node.active,
.viz-map .region.active {
  background: linear-gradient(135deg, var(--primary) 0%, color-mix(in srgb, var(--primary) 74%, var(--accent)) 100%);
  color: #0a0c10;
  border-color: transparent;
}
.viz-flow .flow-edge,
.viz-graph .graph-edge,
.viz-circuit .branch,
.viz-molecule .bond,
.viz-map .route {
  width: 42px;
  height: 3px;
  background: color-mix(in srgb, var(--text) 20%, transparent);
  border-radius: 999px;
}
.viz-formula,
.viz-text,
.viz-motion,
.viz-circuit,
.viz-molecule,
.viz-map,
.viz-cell,
.viz-flow,
.viz-graph,
.viz-array,
.viz-flow-runtime { width: 100%; max-width: 760px; text-align: center; }
.viz-text,
.viz-formula,
.viz-motion,
.viz-cell {
  padding: 28px;
  border-radius: 20px;
  background: linear-gradient(180deg, color-mix(in srgb, var(--surface) 78%, transparent), color-mix(in srgb, var(--bg) 82%, transparent));
  border: 1px solid var(--panel-outline);
  box-shadow: var(--panel-shadow);
}
.viz-formula .formula-main { font-size: 1.6rem; font-weight: 800; margin-bottom: 12px; }
.viz-formula .emphasis-band {
  display: inline-block;
  padding: 5px 16px;
  background: color-mix(in srgb, var(--primary) 12%, transparent);
  border-radius: 999px;
  font-weight: 700;
}
.viz-motion .motion-path {
  height: 60px;
  background: color-mix(in srgb, var(--text) 6%, transparent);
  border-radius: 999px;
  position: relative;
  overflow: hidden;
}
.hanoi-board {
  position: relative;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
  align-items: end;
  min-height: 180px;
  margin-bottom: 18px;
}
.hanoi-rod {
  position: relative;
  min-height: 160px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: end;
}
.hanoi-peg {
  width: 10px;
  height: 110px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--text) 28%, transparent);
}
.hanoi-base {
  width: 100%;
  max-width: 120px;
  height: 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--text) 16%, transparent);
  margin-top: 6px;
}
.hanoi-label {
  margin-top: 10px;
  font-size: 0.84rem;
  opacity: 0.82;
}
.hanoi-rod.active .hanoi-peg,
.hanoi-rod.active .hanoi-base {
  background: color-mix(in srgb, var(--primary) 72%, transparent);
}
.hanoi-disk {
  position: absolute;
  top: 10px;
  transform: translateX(-50%);
  min-width: 72px;
  padding: 8px 14px;
  border-radius: 999px;
  background: linear-gradient(135deg, var(--primary) 0%, color-mix(in srgb, var(--primary) 74%, var(--accent)) 100%);
  color: #0a0c10;
  font-weight: 800;
  box-shadow: 0 10px 24px color-mix(in srgb, var(--glow) 80%, transparent);
}
.viz-motion .motion-path {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--primary) 0%, color-mix(in srgb, var(--primary) 72%, var(--accent)) 100%);
  position: absolute;
  top: 18px;
  box-shadow: 0 10px 24px color-mix(in srgb, var(--glow) 80%, transparent);
}
@media (max-width: 920px) { .panel { grid-template-columns: 1fr; } .meta { display: none; } .shell { padding: 12px; } .stage-wrap, .controls { border-radius: 18px; } }
@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
</style>
</head>
<body data-theme="__THEME__">
<div class="shell">
  <header class="header">
    <h1 class="title">__TITLE__</h1>
    <p class="summary">__SUMMARY__</p>
  </header>
  <main class="panel">
    <section class="stage-wrap">
      <div class="stage">
        <div id="p5-stage" class="p5-stage" aria-hidden="true"></div>
        <div id="dom-stage" class="dom-stage" aria-live="polite"></div>
      </div>
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
        <div id="params" class="param-list"></div>
      </section>
    </aside>
  </main>
  <nav class="controls" aria-label="播放控制">
    <button id="prev-btn" type="button">上一步</button>
    <button id="play-btn" class="primary" type="button">播放</button>
    <button id="next-btn" type="button">下一步</button>
    <label style="display:flex;align-items:center;gap:8px;">
      <span>速度</span>
      <input id="speed-input" type="range" min="0.5" max="2" step="0.25" value="1">
    </label>
  </nav>
</div>
<script>
const animationPayload = __PAYLOAD_JSON__;
const steps = Array.isArray(animationPayload.steps) ? animationPayload.steps : [];
const paramDefinitions = Array.isArray(animationPayload.params) ? animationPayload.params : [];
const flowNodes = Array.isArray(animationPayload.flow_nodes) ? animationPayload.flow_nodes : [];
const flowLinks = Array.isArray(animationPayload.flow_links) ? animationPayload.flow_links : [];
const flowSteps = Array.isArray(animationPayload.flow_steps) ? animationPayload.flow_steps : [];
const isLogicFlow = animationPayload.kind === "logic_flow" && flowNodes.length > 0 && flowSteps.length > 0;
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const stageSurface = document.getElementById("dom-stage");
const p5Container = document.getElementById("p5-stage");
let autoplayTimer = null;
let transitionTimeline = null;
let sketchInstance = null;

function derivePalette(theme) {
  return theme === "light"
    ? { bg: "#f5f7fa", surface: "#ffffff", text: "#141820", primary: "#00896e", accent: "#96463c", muted: "#8b97a7", glow: "#d7efe8" }
    : { bg: "#0a0c10", surface: "#12151a", text: "#e8ecf4", primary: "#4de8b0", accent: "#ff9e8a", muted: "#93a1b2", glow: "#17352f" };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeSelectorValue(value) {
  return String(value ?? "").replace(/[\\"]/g, "\\$&");
}

function buildInitialParams() {
  const entries = paramDefinitions.map((param) => [param.key, String(param.value ?? "")]);
  return Object.fromEntries(entries);
}

const fallbackMessageOrigin = window.location.origin && window.location.origin !== "null"
  ? window.location.origin
  : null;
const parentTargetOrigin = (() => {
  if (window.parent === window) {
    return null;
  }
  try {
    if (document.referrer) {
      return new URL(document.referrer).origin;
    }
  } catch {
    return fallbackMessageOrigin;
  }
  return fallbackMessageOrigin;
})();

function currentStepDurationMs() {
  const genericStep = currentGenericStep();
  const flowStep = currentLogicFlowStep();
  if (isLogicFlow) {
    return Number(flowStep?.duration_ms || genericStep?.duration_ms || 720);
  }
  return Number(genericStep?.duration_ms || 700);
}

function currentGenericStep() {
  if (!steps.length) {
    return null;
  }
  const safeIndex = Math.max(0, Math.min(runtime.state.currentStep, steps.length - 1));
  return steps[safeIndex] || null;
}

function currentLogicFlowStep() {
  if (!flowSteps.length) {
    return null;
  }
  const safeIndex = Math.max(0, Math.min(runtime.state.currentStep, flowSteps.length - 1));
  return flowSteps[safeIndex] || null;
}

function renderTokens(tokens) {
  return (tokens || []).map((token) => {
    const emphasis = ["primary", "secondary", "accent"].includes(token.emphasis) ? token.emphasis : "secondary";
    const text = token.value ? `${token.label} = ${token.value}` : token.label;
    return `<span class="token token-${emphasis}">${escapeHtml(text || "")}</span>`;
  }).join("");
}

function buildFlowNodeMarkup(node) {
  const nodeKind = node.kind || "process";
  const safeId = escapeHtml(node.id || "node");
  const raw = String(node.label || "步骤");
  // Split into at most 2 lines of 7 chars each to fit inside the node rect
  const line1 = escapeHtml(raw.slice(0, 7));
  const line2 = raw.length > 7 ? escapeHtml(raw.slice(7, 14)) : "";
  const textMarkup = line2
    ? `<text class="flow-node-label"><tspan x="0" dy="-8">${line1}</tspan><tspan x="0" dy="17">${line2}</tspan></text>`
    : `<text class="flow-node-label" y="5">${line1}</text>`;
  const x = Number(node.x || 0);
  const y = Number(node.y || 0);
  if (nodeKind === "decision") {
    return `<g class="flow-node" data-node-id="${safeId}" transform="translate(${x}, ${y})"><polygon class="flow-node-shape" points="0,-38 80,0 0,38 -80,0"></polygon>${textMarkup}</g>`;
  }
  const width = nodeKind === "start" || nodeKind === "end" ? 136 : 160;
  return `<g class="flow-node" data-node-id="${safeId}" transform="translate(${x}, ${y})"><rect class="flow-node-shape" x="-${width / 2}" y="-32" width="${width}" height="64" rx="18" ry="18"></rect>${textMarkup}</g>`;
}

function buildFlowLinkMarkup(link, nodesById) {
  const fromNode = nodesById.get(link.from);
  const toNode = nodesById.get(link.to);
  if (!fromNode || !toNode) return "";
  const safeId = escapeHtml(link.id || `${link.from}-${link.to}`);
  const startX = Number(fromNode.x || 0);
  const startY = Number(fromNode.y || 0) + 36;
  const endX = Number(toNode.x || 0);
  const endY = Number(toNode.y || 0) - 36;
  const midY = Math.round((startY + endY) / 2);
  const path = `M ${startX} ${startY} C ${startX} ${midY}, ${endX} ${midY}, ${endX} ${endY}`;
  const label = link.label
    ? `<text class="flow-node-label" x="${(startX + endX) / 2}" y="${midY - 10}">${escapeHtml(link.label)}</text>`
    : "";
  return `<g class="flow-link" data-link-id="${safeId}"><path class="flow-link-base" d="${path}"></path><path class="flow-link-pulse" d="${path}"></path>${label}</g>`;
}

function renderLogicFlow(step) {
  const nodesById = new Map(flowNodes.map((node) => [node.id, node]));
  const linksMarkup = flowLinks.map((link) => buildFlowLinkMarkup(link, nodesById)).join("");
  const nodesMarkup = flowNodes.map((node) => buildFlowNodeMarkup(node)).join("");
  const safeMessage = escapeHtml(step?.message || "流程演示准备完成");
  const currentStepNumber = runtime.state.currentStep + 1;
  const totalSteps = Math.max(runtime.state.totalSteps, 1);
  const progressLabel = `步骤 ${currentStepNumber} / ${totalSteps}`;
  const progressRatio = totalSteps > 1 ? runtime.state.currentStep / (totalSteps - 1) : 1;
  const progressPercent = Math.max(16, Math.round((0.18 + progressRatio * 0.82) * 100));
  const activeCount = Array.isArray(step?.activate_node_ids) ? step.activate_node_ids.length : 0;
  const pulseCount = Array.isArray(step?.pulse_link_ids) ? step.pulse_link_ids.length : 0;
  return `<div class="viz-flow-runtime" data-logic-flow="true"><div class="flow-runtime-top"><div class="flow-step-chip"><span class="flow-step-dot"></span><span>${escapeHtml(progressLabel)}</span></div><div class="flow-progress-stack"><div class="flow-progress-meta"><span>演示进度</span><span>${escapeHtml(`${progressPercent}%`)}</span></div><div class="flow-progress-track" aria-hidden="true"><div class="flow-progress-bar" style="width:${progressPercent}%;"></div></div></div></div><div class="flow-canvas-shell"><svg id="canvas-flow" viewBox="0 0 800 420" role="img" aria-label="算法流程图"><g id="flow-links">${linksMarkup}</g><g id="flow-nodes">${nodesMarkup}</g></svg></div><div class="flow-message-card"><div class="flow-message-label">流程提示</div><p class="flow-desc">${safeMessage}</p><div class="flow-message-caption"><span>活跃节点 ${escapeHtml(String(activeCount || 1))}</span><span>激活连线 ${escapeHtml(String(pulseCount))}</span><span>${escapeHtml(`节奏 ${currentStepNumber}/${totalSteps}`)}</span></div></div></div>`;
}

function animateLogicFlowStep(step, baseDuration) {
  const nodes = Array.from(stageSurface.querySelectorAll("[data-node-id]"));
  const links = Array.from(stageSurface.querySelectorAll("[data-link-id]"));
  nodes.forEach((node) => {
    const nodeId = node.getAttribute("data-node-id") || "";
    const activeIds = Array.isArray(step.activate_node_ids) ? step.activate_node_ids : [];
    node.classList.toggle("is-highlighted", nodeId === (step.highlight_node || ""));
    node.classList.toggle("is-active", activeIds.includes(nodeId));
    node.classList.toggle("is-visited", activeIds.indexOf(nodeId) > -1 && activeIds[activeIds.length - 1] !== nodeId);
  });

  if (typeof gsap !== "object" || prefersReducedMotion.matches) {
    return;
  }

  gsap.fromTo(
    "#flow-nodes .flow-node",
    { autoAlpha: 0, y: 10 },
    { autoAlpha: 1, y: 0, duration: Math.max(baseDuration / 1200, 0.24), stagger: 0.04, ease: "power2.out", overwrite: "auto" }
  );

  links.forEach((link) => {
    const linkId = link.getAttribute("data-link-id") || "";
    const pulse = link.querySelector(".flow-link-pulse");
    const base = link.querySelector(".flow-link-base");
    if (!(pulse instanceof SVGElement)) return;
    const shouldPulse = Array.isArray(step.pulse_link_ids) && step.pulse_link_ids.includes(linkId);
    if (base instanceof SVGElement) {
      gsap.to(base, {
        stroke: shouldPulse ? "var(--flow-link-active)" : "var(--flow-link)",
        opacity: shouldPulse ? 0.95 : 0.75,
        duration: Math.max(baseDuration / 1200, 0.26),
        ease: "power2.out",
        overwrite: "auto",
      });
    }
    gsap.set(pulse, { opacity: shouldPulse ? 0.95 : 0, strokeDashoffset: 48 });
    if (shouldPulse) {
      gsap.fromTo(
        pulse,
        { strokeDashoffset: 48, opacity: 0.95 },
        {
          strokeDashoffset: 0,
          opacity: 0.2,
          duration: Math.max(baseDuration / 900, 0.42),
          ease: "power1.inOut",
          overwrite: "auto",
        }
      );
    }
  });

  if (step.highlight_node) {
    const highlighted = stageSurface.querySelector(`[data-node-id="${escapeSelectorValue(step.highlight_node)}"]`);
    if (highlighted) {
      gsap.fromTo(
        highlighted,
        { scale: 0.94, transformOrigin: "center center" },
        { scale: 1, duration: Math.max(baseDuration / 1000, 0.32), ease: "back.out(1.55)", overwrite: "auto" }
      );
    }
  }

  const description = stageSurface.querySelector(".flow-desc");
  const messageCard = stageSurface.querySelector(".flow-message-card");
  const progressBar = stageSurface.querySelector(".flow-progress-bar");
  const canvasShell = stageSurface.querySelector(".flow-canvas-shell");
  if (progressBar) {
    gsap.fromTo(
      progressBar,
      { scaleX: 0.82, autoAlpha: 0.72 },
      { scaleX: 1, autoAlpha: 1, duration: Math.max(baseDuration / 1000, 0.3), ease: "power2.out", overwrite: "auto" }
    );
  }
  if (canvasShell) {
    gsap.fromTo(
      canvasShell,
      { autoAlpha: 0, y: 14, scale: 0.988 },
      { autoAlpha: 1, y: 0, scale: 1, duration: Math.max(baseDuration / 1000, 0.32), ease: "power2.out", overwrite: "auto" }
    );
  }
  if (messageCard) {
    gsap.fromTo(
      messageCard,
      { autoAlpha: 0, y: 12, scale: 0.985 },
      { autoAlpha: 1, y: 0, scale: 1, duration: Math.max(baseDuration / 1000, 0.28), ease: "power2.out", overwrite: "auto" }
    );
  }
  if (description) {
    gsap.fromTo(
      description,
      { autoAlpha: 0, y: 8 },
      { autoAlpha: 1, y: 0, duration: Math.max(baseDuration / 1100, 0.22), ease: "power2.out", overwrite: "auto" }
    );
  }
}

function ensureSketch() {
  if (sketchInstance || typeof p5 !== "function") return;
  const sketch = (p) => {
    p.setup = () => {
      const bounds = p5Container.getBoundingClientRect();
      const canvas = p.createCanvas(Math.max(320, Math.round(bounds.width || 640)), Math.max(240, Math.round(bounds.height || 420)));
      canvas.parent("p5-stage");
      p.noLoop();
      drawScene(p);
    };
    p.windowResized = () => {
      const bounds = p5Container.getBoundingClientRect();
      p.resizeCanvas(Math.max(320, Math.round(bounds.width || 640)), Math.max(240, Math.round(bounds.height || 420)));
      drawScene(p);
    };
    p.draw = () => drawScene(p);
  };
  sketchInstance = new p5(sketch, p5Container);
}

function drawScene(p) {
  const palette = derivePalette(document.body.dataset.theme || "dark");
  const genericStep = currentGenericStep();
  const flowStep = currentLogicFlowStep();
  const step = isLogicFlow ? flowStep : genericStep;
  p.clear();
  p.background(palette.bg);
  for (let index = 0; index < 3; index += 1) {
    const alpha = index === 0 ? 36 : index === 1 ? 22 : 14;
    p.noStroke();
    p.fill(`${palette.primary}${alpha.toString(16).padStart(2, "0")}`);
    p.circle(p.width * (0.16 + index * 0.28), p.height * (0.22 + index * 0.14), p.width * (0.32 - index * 0.05));
  }
  p.fill(palette.surface);
  p.rect(14, 14, p.width - 28, p.height - 28, 24);
  if (!step) {
    p.fill(palette.text);
    p.textAlign(p.CENTER, p.CENTER);
    p.textSize(18);
    p.text("暂无可展示步骤", p.width / 2, p.height / 2);
    return;
  }
  if (isLogicFlow) {
    // Logic flow uses SVG in dom-stage; p5 canvas is a subtle background only
    return;
  }
  const labels = (genericStep?.tokens || []).map((token) => token.value || token.label).filter(Boolean);
  const progress = steps.length > 1 ? runtime.state.currentStep / (steps.length - 1) : 0;
  p.fill(palette.muted);
  p.textAlign(p.LEFT, p.TOP);
  p.textSize(14);
  p.text(genericStep.visual_kind || "text", 30, 28);
  p.fill(`${palette.primary}22`);
  p.rect(30, 58, p.width - 60, 12, 999);
  p.fill(palette.primary);
  p.rect(30, 58, Math.max(140, (p.width - 60) * (0.18 + progress * 0.74)), 12, 999);
  p.fill(palette.text);
  p.textSize(26);
  p.text(genericStep.title || `步骤 ${runtime.state.currentStep + 1}`, 30, 86);
  p.textSize(13);
  p.fill(palette.muted);
  p.text(genericStep.narration || "", 30, 122, p.width - 60, 64);
  if (labels.length) {
    p.textSize(16);
    labels.slice(0, 6).forEach((label, index) => {
      const x = 42 + index * 92;
      const y = p.height * 0.65;
      const active = index === runtime.state.currentStep % Math.max(labels.length, 1);
      p.fill(active ? palette.primary : `${palette.text}14`);
      p.rect(x, y, 78, 44, 14);
      p.fill(active ? palette.bg : palette.text);
      p.textAlign(p.CENTER, p.CENTER);
      p.text(String(label), x + 39, y + 22);
    });
  }
}

function renderGenericVisual(step, state) {
  const labels = (step.tokens || []).map((token) => token.value || token.label).filter(Boolean);
  const tokenMap = Object.fromEntries((step.tokens || []).map((token) => [token.label, token.value || token.label || ""]));
  const safeTitle = escapeHtml(step.title || "");
  const safeNarration = escapeHtml(step.narration || "");
  const first = escapeHtml(labels[0] || "A");
  const second = escapeHtml(labels[1] || "B");
  const third = escapeHtml(labels[2] || "C");
  const progressLabel = `步骤 ${state.currentStep + 1} / ${Math.max(state.totalSteps, 1)}`;
  if (step.visual_kind === "motion" && tokenMap["起点"] && tokenMap["终点"] && tokenMap["移动盘"]) {
    const rods = ["A 柱", "B 柱", "C 柱"];
    const fromIndex = Math.max(0, rods.indexOf(String(tokenMap["起点"])));
    const toIndex = Math.max(0, rods.indexOf(String(tokenMap["终点"])));
    const disk = escapeHtml(String(tokenMap["移动盘"]));
    const actorLeft = 16 + toIndex * 31;
    return `<div class="viz-motion"><div class="flow-step-chip"><span class="flow-step-dot"></span><span>${escapeHtml(progressLabel)}</span></div><div class="hanoi-board"><div class="hanoi-rod ${fromIndex === 0 ? "active" : ""}"><div class="hanoi-peg"></div><div class="hanoi-base"></div><div class="hanoi-label">A 柱</div></div><div class="hanoi-rod ${fromIndex === 1 ? "active" : ""}"><div class="hanoi-peg"></div><div class="hanoi-base"></div><div class="hanoi-label">B 柱</div></div><div class="hanoi-rod ${fromIndex === 2 ? "active" : ""}"><div class="hanoi-peg"></div><div class="hanoi-base"></div><div class="hanoi-label">C 柱</div></div><div class="hanoi-disk" style="left:${actorLeft}%;">盘 ${disk}</div></div><p class="narration">${safeNarration}</p></div>`;
  }
  switch (step.visual_kind) {
    case "array":
      return `<div class="viz-array"><div class="flow-step-chip"><span class="flow-step-dot"></span><span>${escapeHtml(progressLabel)}</span></div><div class="cells">${labels.slice(0, 8).map((label, index) => `<div class="cell ${index === state.currentStep % Math.max(labels.length, 1) ? "active" : ""}">${escapeHtml(label)}</div>`).join("") || '<div class="cell active">0</div><div class="cell">1</div><div class="cell">2</div>'}</div></div>`;
    case "flow":
      return `<div class="viz-flow"><div class="flow-step-chip"><span class="flow-step-dot"></span><span>${escapeHtml(progressLabel)}</span></div><div class="flow-nodes"><div class="node active">${first}</div><div class="flow-edge"></div><div class="node">${second}</div><div class="flow-edge"></div><div class="node">${third}</div></div></div>`;
    case "formula":
      return `<div class="viz-formula"><div class="flow-step-chip"><span class="flow-step-dot"></span><span>${escapeHtml(progressLabel)}</span></div><div class="formula-main">${first}</div><div class="emphasis-band">${second || "关键项"}</div><p class="narration">${safeNarration}</p></div>`;
    case "graph":
      return `<div class="viz-graph"><div class="flow-step-chip"><span class="flow-step-dot"></span><span>${escapeHtml(progressLabel)}</span></div><div class="graph-nodes"><div class="node active">${first}</div><div class="graph-edge"></div><div class="node">${second}</div><div class="graph-edge"></div><div class="node">${third}</div></div></div>`;
    case "motion":
      return `<div class="viz-motion"><div class="flow-step-chip"><span class="flow-step-dot"></span><span>${escapeHtml(progressLabel)}</span></div><div class="motion-path"><div class="actor" style="left:${10 + ((state.currentStep + 1) / Math.max(state.totalSteps, 1)) * 70}%;"></div></div><p class="narration">${safeNarration}</p></div>`;
    case "circuit":
      return `<div class="viz-circuit"><div class="flow-step-chip"><span class="flow-step-dot"></span><span>${escapeHtml(progressLabel)}</span></div><div class="circuit-row"><div class="node">R</div><div class="branch"></div><div class="node">C</div><div class="branch"></div><div class="node">V</div></div></div>`;
    case "molecule":
      return `<div class="viz-molecule"><div class="flow-step-chip"><span class="flow-step-dot"></span><span>${escapeHtml(progressLabel)}</span></div><div class="molecule-row"><div class="node">${first}</div><div class="bond"></div><div class="node">${second}</div><div class="bond"></div><div class="node">${third}</div></div></div>`;
    case "map":
      return `<div class="viz-map"><div class="flow-step-chip"><span class="flow-step-dot"></span><span>${escapeHtml(progressLabel)}</span></div><div class="map-row"><div class="region active">${first}</div><div class="route"></div><div class="region">${second}</div><div class="route"></div><div class="region">${third}</div></div></div>`;
    case "cell":
      return `<div class="viz-cell"><div class="flow-step-chip"><span class="flow-step-dot"></span><span>${escapeHtml(progressLabel)}</span></div><div class="cell-row"><div class="organelle">核</div><div class="organelle">线粒体</div><div class="organelle">ER</div></div><p class="narration">${safeNarration}</p></div>`;
    case "text":
    default:
      return `<div class="viz-text"><div class="flow-step-chip"><span class="flow-step-dot"></span><span>${escapeHtml(progressLabel)}</span></div><h2>${safeTitle}</h2><p class="narration">${safeNarration}</p></div>`;
  }
}

function syncTransition(baseDuration) {
  if (transitionTimeline) {
    transitionTimeline.kill();
  }
  if (prefersReducedMotion.matches || typeof gsap !== "object") {
    return;
  }
  transitionTimeline = gsap.timeline({ defaults: { ease: "power2.out", overwrite: "auto" } });
  transitionTimeline.fromTo(
    stageSurface,
    { autoAlpha: 0, y: 18, scale: 0.985, filter: "blur(12px)" },
    { autoAlpha: 1, y: 0, scale: 1, filter: "blur(0px)", duration: Math.max(baseDuration / 1000, 0.22) }
  );
  transitionTimeline.fromTo(
    "#step-title, #narration, #tokens .token, .flow-step-chip",
    { autoAlpha: 0, y: 10 },
    { autoAlpha: 1, y: 0, duration: 0.22, stagger: 0.035 },
    0.02
  );
}

function scheduleAutoplay() {
  window.clearTimeout(autoplayTimer);
  if (runtime.state.paused || !runtime.state.autoplay || prefersReducedMotion.matches) return;
  if (runtime.state.currentStep >= runtime.state.totalSteps - 1) return;
  const interval = Math.max(420, Math.round((currentStepDurationMs() + 140) / Math.max(runtime.state.speed, 0.25)));
  autoplayTimer = window.setTimeout(() => runtime.goToStep(runtime.state.currentStep + 1, "autoplay"), interval);
}

function syncButtons() {
  document.getElementById("prev-btn").disabled = runtime.state.currentStep <= 0;
  document.getElementById("next-btn").disabled = runtime.state.currentStep >= runtime.state.totalSteps - 1;
  document.getElementById("play-btn").textContent = runtime.state.paused ? "播放" : "暂停";
  document.getElementById("speed-input").value = String(runtime.state.speed);
}

function syncParams() {
  const root = document.getElementById("params");
  root.innerHTML = paramDefinitions.map((param) => {
    const key = escapeHtml(param.key || "param");
    const label = escapeHtml(param.label || param.key || "参数");
    const value = escapeHtml(runtime.state.params[param.key] ?? param.value ?? "");
    return `<div class="param-row"><label>${label}</label><input data-param-key="${key}" value="${value}" /></div>`;
  }).join("") || '<div style="opacity:0.6;font-size:0.8rem;">无参数</div>';
}

const runtime = {
  state: {
    currentStep: 0,
    totalSteps: isLogicFlow ? flowSteps.length : steps.length,
    autoplay: false,
    speed: 1,
    paused: true,
    params: buildInitialParams(),
  },
  notifyParent(type, payload = {}) {
    if (window.parent === window || !parentTargetOrigin) {
      return;
    }
    window.parent.postMessage({ type, ...payload }, parentTargetOrigin);
  },
  applyTheme(themeValue) {
    document.body.dataset.theme = themeValue === "light" ? "light" : "dark";
    if (sketchInstance) {
      sketchInstance.redraw();
    }
  },
  renderStep(step, prevStep, api) {
    if (!step) return;
    const baseDuration = prefersReducedMotion.matches
      ? 0
      : Math.max(180, Math.round(currentStepDurationMs() / Math.max(api.state.speed, 0.5)));
    document.documentElement.style.setProperty("--duration-ms", `${baseDuration}ms`);
    const genericStep = currentGenericStep();
    if (isLogicFlow) {
      stageSurface.innerHTML = renderLogicFlow(step);
      document.getElementById("kind").textContent = "算法流程";
      document.getElementById("step-title").textContent = genericStep?.title || step.message || "";
      document.getElementById("narration").textContent = genericStep?.narration || step.message || "";
      document.getElementById("tokens").innerHTML = renderTokens(genericStep?.tokens || []);
      document.getElementById("step-counter").textContent = `${api.state.currentStep + 1} / ${Math.max(api.state.totalSteps, 1)}`;
      syncButtons();
      syncTransition(baseDuration);
      animateLogicFlowStep(step, baseDuration);
    } else {
      stageSurface.innerHTML = renderGenericVisual(step, api.state);
      document.getElementById("kind").textContent = step.visual_kind || "text";
      document.getElementById("step-title").textContent = step.title || "";
      document.getElementById("narration").textContent = step.narration || "";
      document.getElementById("tokens").innerHTML = renderTokens(step.tokens || []);
      document.getElementById("step-counter").textContent = `${api.state.currentStep + 1} / ${Math.max(api.state.totalSteps, 1)}`;
      syncButtons();
      syncTransition(baseDuration);
    }
    if (sketchInstance) {
      sketchInstance.redraw();
    }
    api.notifyParent("step", { index: api.state.currentStep });
    scheduleAutoplay();
  },
  goToStep(index, reason = "api") {
    if (!this.state.totalSteps) return;
    const nextIndex = Math.max(0, Math.min(index, this.state.totalSteps - 1));
    const prevCollection = isLogicFlow ? flowSteps : steps;
    const nextCollection = isLogicFlow ? flowSteps : steps;
    const prevStep = prevCollection[this.state.currentStep] || null;
    this.state.currentStep = nextIndex;
    this.renderStep(nextCollection[nextIndex], prevStep, this);
  },
  setParam(key, value) {
    this.state.params = { ...this.state.params, [key]: String(value ?? "") };
    syncParams();
    this.notifyParent("paramChange", { key, value: this.state.params[key] });
    this.goToStep(this.state.currentStep, "setParam");
  },
  setPlayback(update) {
    this.state = {
      ...this.state,
      autoplay: typeof update.autoplay === "boolean" ? update.autoplay : this.state.autoplay,
      paused: typeof update.paused === "boolean" ? update.paused : this.state.paused,
      speed: typeof update.speed === "number" && Number.isFinite(update.speed)
        ? Math.max(0.5, Math.min(update.speed, 2))
        : this.state.speed,
    };
    syncButtons();
    this.notifyParent("playback", {
      paused: this.state.paused,
      autoplay: this.state.autoplay,
      speed: this.state.speed,
    });
    scheduleAutoplay();
  },
};

document.addEventListener("input", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  if (target.matches("[data-param-key]") && target.dataset.paramKey) {
    runtime.setParam(target.dataset.paramKey, target.value);
    return;
  }
  if (target.id === "speed-input") {
    runtime.setPlayback({
      speed: Number(target.value),
      autoplay: runtime.state.autoplay,
      paused: runtime.state.paused,
    });
  }
});

window.addEventListener("message", (event) => {
  if (window.parent !== window && event.source !== window.parent) {
    return;
  }
  if (parentTargetOrigin && event.origin && event.origin !== parentTargetOrigin) {
    return;
  }
  if (!parentTargetOrigin && fallbackMessageOrigin && event.origin && event.origin !== fallbackMessageOrigin) {
    return;
  }
  const message = event.data;
  if (!message || typeof message !== "object" || typeof message.type !== "string") return;
  if (message.type === "goToStep") {
    runtime.goToStep(Number(message.index || 0), "api");
    return;
  }
  if (message.type === "setParam" && typeof message.key === "string") {
    runtime.setParam(message.key, message.value);
    return;
  }
  if (message.type === "playback") {
    runtime.setPlayback(message);
    return;
  }
  if (message.type === "theme") {
    runtime.applyTheme(message.theme);
  }
});

document.getElementById("prev-btn").addEventListener("click", () => runtime.goToStep(runtime.state.currentStep - 1, "prev"));
document.getElementById("next-btn").addEventListener("click", () => runtime.goToStep(runtime.state.currentStep + 1, "next"));
document.getElementById("play-btn").addEventListener("click", () => {
  runtime.setPlayback({
    autoplay: true,
    paused: !runtime.state.paused,
    speed: runtime.state.speed,
  });
});

document.addEventListener("DOMContentLoaded", () => {
  ensureSketch();
  runtime.applyTheme(document.body.dataset.theme || "__THEME__");
  syncParams();
  syncButtons();
  if (runtime.state.totalSteps) {
    runtime.goToStep(0, "init");
  }
  runtime.notifyParent("ready", {
    totalSteps: runtime.state.totalSteps,
    supportedParams: paramDefinitions.map((param) => param.key),
    capabilities: {
      playback: true,
      params: true,
      theme: true,
      reducedMotionAware: true,
    },
  });
  runtime.notifyParent("playback", {
    paused: runtime.state.paused,
    autoplay: runtime.state.autoplay,
    speed: runtime.state.speed,
  });
});
</script>
</body>
</html>
"""

    return (
        template.replace(
            "__FALLBACK_ATTR__",
            ' data-metaview-fallback="true"' if is_fallback else "",
        )
        .replace("__TITLE__", html_lib.escape(animation_payload.title or "教育动画"))
        .replace("__SUMMARY__", html_lib.escape(animation_payload.summary or ""))
        .replace("__THEME__", theme)
        .replace("__PAYLOAD_JSON__", _escape_script_json(animation_payload.model_dump(mode="json")))
    )


def build_html_fallback_document(cir: CirDocument, ui_theme: str | None = None) -> str:
    payload = build_html_animation_payload_from_cir(cir)
    return build_html_scaffold_document(payload, ui_theme, is_fallback=True)
