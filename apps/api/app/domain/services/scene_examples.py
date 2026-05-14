"""Golden multi-layer step examples used by the cir_prompt builder.

Each example shows how a single CIR step can stack scene + overlay + card
layers with timing windows so the renderer fades the elements in sequentially.
The LLM is told to mimic the structure, not the exact wording, so the prompt
ships with a small but diverse set of templates rather than one canonical case.
"""

from app.domain.models.topic import TopicDomain

GREEN_THEOREM_LAYERED = """{
  "id": "step_green_layered",
  "title": "把环路积分翻成面积分",
  "narration": "想象矩形区域 R，先看它的边界（C），再叠加一片向量场 F=(-y,x)；F 沿边界走一圈的环量正好等于 R 的面积乘以一个固定数。",
  "visual_kind": "scene",
  "scene": {
    "x_min": -1, "x_max": 5, "y_min": -1, "y_max": 4,
    "regions": [
      {"vertices": [[0,0],[4,0],[4,3],[0,3]], "label": "R", "emphasis": "secondary"}
    ],
    "segments": [
      {"x0":0,"y0":0,"x1":4,"y1":0,"arrow":true,"label":"C₁"},
      {"x0":4,"y0":0,"x1":4,"y1":3,"arrow":true,"label":"C₂"},
      {"x0":4,"y0":3,"x1":0,"y1":3,"arrow":true,"label":"C₃"},
      {"x0":0,"y0":3,"x1":0,"y1":0,"arrow":true,"label":"C₄"}
    ]
  },
  "layers": [
    {
      "kind": "math_scene",
      "timing": {"enter_at": 0.0, "exit_at": 1.0, "appear_anim": "fade", "z_order": 0}
    },
    {
      "kind": "math_scene",
      "timing": {"enter_at": 0.25, "exit_at": 1.0, "appear_anim": "fade", "z_order": 1},
      "scene": {
        "x_min": -1, "x_max": 5, "y_min": -1, "y_max": 4,
        "vector_field": {"expression_px": "-y", "expression_py": "x", "step": 0.8, "label": "F"}
      }
    },
    {
      "kind": "katex_overlay",
      "timing": {"enter_at": 0.55, "exit_at": 1.0, "appear_anim": "fade", "z_order": 2},
      "katex_overlay": {"x": 2, "y": 3.5, "latex": "F=(-y,x)"}
    },
    {
      "kind": "math_formula",
      "timing": {"enter_at": 0.75, "exit_at": 1.0, "appear_anim": "fade", "z_order": 3},
      "plot": {"formula_latex": "\\\\oint_C P\\\\,dx + Q\\\\,dy = \\\\iint_R (\\\\partial Q/\\\\partial x - \\\\partial P/\\\\partial y)\\\\,dA"}
    }
  ]
}"""

MATH_PARAMETRIC_LAYERED = """{
  "id": "step_circle_layered",
  "title": "用参数方程画圆",
  "narration": "用 (cos t, sin t) 沿 t 从 0 到 2π 描点，得到一个单位圆。我们一边画曲线，一边在角落把方程写出来。",
  "visual_kind": "scene",
  "scene": {
    "x_min": -1.4, "x_max": 1.4, "y_min": -1.4, "y_max": 1.4,
    "curves": [
      {"expression_y": "sin(t)", "expression_x": "cos(t)", "t_min": 0, "t_max": 6.2832, "label": "圆", "emphasis": "primary"}
    ]
  },
  "layers": [
    {
      "kind": "math_scene",
      "timing": {"enter_at": 0.0, "exit_at": 1.0, "appear_anim": "draw", "z_order": 0}
    },
    {
      "kind": "katex_overlay",
      "timing": {"enter_at": 0.6, "exit_at": 1.0, "appear_anim": "fade", "z_order": 1},
      "katex_overlay": {"x": 0.9, "y": 1.2, "latex": "(\\\\cos t,\\\\sin t)", "align": "ne"}
    }
  ]
}"""

ALGORITHM_NARRATION_LAYERED = """{
  "id": "step_bubble_layered",
  "title": "比较 5 和 3：先停一下想一想",
  "narration": "把 5 和 3 摆在桌上。我们想要小的在左边。所以接下来要交换。",
  "visual_kind": "array",
  "tokens": [
    {"id": "t0", "label": "5", "emphasis": "primary"},
    {"id": "t1", "label": "3", "emphasis": "primary"},
    {"id": "t2", "label": "1"},
    {"id": "t3", "label": "4"},
    {"id": "t4", "label": "2"}
  ],
  "layers": [
    {
      "kind": "array_boxes",
      "timing": {"enter_at": 0.0, "exit_at": 1.0, "appear_anim": "fade", "z_order": 0}
    },
    {
      "kind": "narration_card",
      "timing": {"enter_at": 0.4, "exit_at": 1.0, "appear_anim": "slide", "z_order": 1},
      "narration_card": {"text": "5 > 3 → 准备交换", "position": "bottom", "emphasis": "accent"}
    }
  ]
}"""


_DOMAIN_EXAMPLES: dict[TopicDomain, list[str]] = {
    TopicDomain.MATH: [GREEN_THEOREM_LAYERED, MATH_PARAMETRIC_LAYERED],
    TopicDomain.ALGORITHM: [ALGORITHM_NARRATION_LAYERED],
}


def examples_for_domain(domain: TopicDomain) -> str:
    """Return the inline-prompt section listing golden multi-layer step JSONs.

    Returns an empty string for domains without a curated example library so
    the prompt builder can splice unconditionally.
    """

    blobs = _DOMAIN_EXAMPLES.get(domain) or []
    if not blobs:
        return ""
    parts = ["\n## 多层 step 黄金范例（参考结构，不要直接复制内容）"]
    parts.extend(f"\n### 范例 {i + 1}\n```json\n{blob}\n```" for i, blob in enumerate(blobs))
    return "\n".join(parts)
