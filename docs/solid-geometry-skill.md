# Solid Geometry Skill

MetaView 的 `solid_geometry` V1 借鉴 edulab `edu-solid-geometry` 的确定性 skill 架构：先把题目归一化为结构化 spec，再由 SymPy kernel 计算精确坐标、向量、法向量和答案，最后把同一份 kernel 数据转成 `PlaybookScript` 和 `solid_geometry_scene` snapshot。

它不直接嵌入 edulab 的 HTML 页面，也不把 lesson 模板作为 iframe/raw HTML 放进前端。

## V1 Scope

支持的题型：

- `cube + line_plane_angle`
- `regular_quad_pyramid + line_plane_angle`
- `cuboid + volume`

支持的文本入口示例：

```text
正四棱锥 S-ABCD，底面边长为 2，高为 3，求 SA 与底面 ABCD 的线面角
正方体 ABCD-A1B1C1D1，棱长 2，求 A1B 与平面 ABCD 的夹角
长方体长 2 宽 3 高 4，求体积
```

无法解析的 prompt 返回 `None`，交回通用 pipeline；V1 不让 LLM 直接猜最终几何数值。

## ProblemSpec

```json
{
  "language": "zh-CN",
  "body": "regular_quad_pyramid",
  "dimensions": {
    "base": "2",
    "height": "3"
  },
  "givens": ["正四棱锥 S-ABCD，底面边长为 2，高为 3，求 SA 与底面 ABCD 的线面角"],
  "query": {
    "kind": "line_plane_angle",
    "line": { "through": ["S", "A"] },
    "plane": { "through": ["A", "B", "C"] }
  }
}
```

## Kernel Rules

- 尺寸只解析为安全数字字面量，使用 `sympy.Rational` 保持 exact computation。
- 顶点坐标、渲染坐标、目标向量、平面法向量和最终答案来自同一个 kernel。
- `solution.answer_latex` 必须出现在最终 step 的 voiceover 或 snapshot formula 中。
- `checks["answer_consistency"]` 必须为 `true`，否则 adapter/pipeline 不应吞掉错误。

## Snapshot

`solid_geometry_scene` 是 renderer-ready 数据，不携带 HTML：

```json
{
  "kind": "solid_geometry_scene",
  "points": [
    { "label": "S", "position": [0, 0, 3], "math_position_latex": ["0", "0", "3"] }
  ],
  "edges": [
    { "start": "S", "end": "A", "label": "SA", "emphasis": "accent" }
  ],
  "planes": [
    { "id": "ABC", "vertices": ["A", "B", "C", "D"], "label": "平面 ABCD" }
  ],
  "vectors": [
    { "id": "vector:SA", "start": "S", "end": "A", "label": "\\vec{SA}" }
  ],
  "visible_elements": ["line:SA", "plane:ABC"],
  "focus_target": "line:SA",
  "formula_latex": "\\theta = \\operatorname{asin}{\\left(\\frac{3 \\sqrt{11}}{11} \\right)}",
  "caption": "线面角等于直线方向向量与平面法向量夹角的余角。"
}
```

The frontend V1 renderer uses SVG/isometric projection for CI and Remotion stability. A later renderer can replace it with Three.js while keeping this snapshot contract.

## Roadmap

- LLM-assisted spec extraction with strict schema validation.
- Image/OCR geometry problem intake.
- Random problem generation.
- Three.js camera and focus-target execution.
- More bodies and query kinds: dihedral angle, skew-line angle, point-plane distance.
