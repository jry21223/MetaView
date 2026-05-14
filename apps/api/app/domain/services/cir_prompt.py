from __future__ import annotations

from app.domain.models.topic import TopicDomain
from app.domain.services.algorithm_code_library import infer_id, prompt_hint
from app.domain.services.scene_examples import examples_for_domain

_DOMAIN_GUIDANCE: dict[TopicDomain, str] = {
    TopicDomain.ALGORITHM: """
VISUAL + PEDAGOGY RULES for algorithms:
- Step template (use as the narrative spine): 直觉一句类比 → 伪代码思路 → 在样本数据上走一步 → 总结这一步学到了什么。
- Use visual_kind="array" for sorting, searching, two-pointer, sliding-window, DP table problems.
- Use visual_kind="graph" ONLY for explicit tree/graph traversal (BFS, DFS, BST operations).
- For graph steps, populate the "edges" array with explicit parent→child refs like
  {"from_id": "node_root", "to_id": "node_left"}. Do NOT rely on token id naming conventions.
- Each token represents ONE array element or tree node. Label = the actual value (number/char).
- emphasis="primary"  → elements currently being compared or accessed
- emphasis="accent"   → elements that are finalized/sorted
- emphasis="secondary" → elements visited but not finalized
- For multi-step algorithms, show every meaningful state change as a separate step.
  Example for [5,3,1]: step1=initial, step2=after first comparison, step3=after swap, ...
- First time a term appears (e.g. "递归"、"分治"), give a one-line everyday analogy before formal use.
""",
    TopicDomain.CODE: """
VISUAL + PEDAGOGY RULES for code explanation:
- Step template: 这段代码要解决的问题（一句话） → 关键数据结构是什么、为什么选它 → 逐步执行 → 输出验证。
- Use visual_kind="array" to show data structures (stacks, queues, arrays, hash maps).
- Represent each data structure slot as a token with label=value.
- Steps should correspond to key execution moments: initialization, loop iteration,
  function call, return.
- Use token value field for data structure keys when relevant.
- Tie every step back to a specific source line and explain why that line is needed in plain language.
""",
    TopicDomain.MATH: """
VISUAL + PEDAGOGY RULES for math (audience: 零基础学生):
- Step template (strict): 直觉（生活类比） → 形式（公式或定义） → 具体数字代入 → 推广到一般式。
- 先给「为什么需要这个工具」再给公式。例：先讲「积分就是把一条曲线下面切成无数细条求面积」，再写积分号。
- 永远先用具体数字举例（f(x)=x², x=2, 算出 f(2)=4），再泛化到符号。
- HARD RULE: math 域的 visual_kind 只能在 "function" / "scene" / "formula" 中三选一。绝对不能用 "array"。
  优先级（必须照此判断！）：
    (1) 题目涉及 2D 几何对象（区域 / 边界 / 向量场 / 参数曲线 / 圆 / 多边形 / 环路 / 旋度 / 散度）→ "scene"。
    (2) 1D 函数 y=f(x) 作图、导数、积分面积 → "function"。
    (3) 既不是 1D 函数也不是 2D 几何（纯抽象代数 / 群 / 集合 / 矩阵 / 概率） → "formula" 兜底。
  ⚠️ 反例（错误）：narration 出现「向量场 F=(-y,x)」却用 visual_kind="formula"——这是 BUG。
  必须改为 "scene" 并填 step.scene.vector_field。

A. WHEN TO USE visual_kind="function" (1D 函数作图):
   - 任何能画在 1D 坐标轴上的函数：f(x) 作图、函数变换（平移/缩放）、导数与切线、
     定积分下的面积、三角波、指数/对数增长、参数族曲线。
   - REQUIRED: fill the step's "plot" object:
     - "curves": one or more {"expression": "...", "label": "...", "emphasis": "..."}.
       The expression is a formula in the variable `x` (plus named parameters such as `a`, `b`)
       using + - * / ^ %, parentheses, and functions sin cos tan asin acos atan exp log ln
       log2 log10 sqrt cbrt abs floor ceil round sign min max pow hypot, and constants pi tau e.
       Examples: "x^2 - 2*x", "sin(x)", "a*x + b", "0.5*x^3 - x", "exp(-x^2)".
       Do NOT pre-sample points and do NOT use programming syntax — just the math formula.
     - "x_min"/"x_max": visible domain (e.g. -6 to 6, or 0 to 2*pi ≈ 6.28).
     - "marker_x" (optional): x of a highlighted point on the FIRST curve.
     - "shade_from"/"shade_to" (optional): shade the area under the FIRST curve.
     - "formula_latex" (optional but recommended): a short KaTeX label, e.g. "f(x) = x^2 - 2x".
   - When the curve uses parameters (e.g. `a*x + b`, `a*sin(b*x)`), expose each parameter
     in execution_map.parameter_controls so the student can drag a slider. Do NOT hard-code
     parameter values into the expression when the lesson is about how the parameter changes
     the curve shape.

B. WHEN TO USE visual_kind="scene" (2D 几何场景 — 最重要的新能力！):
   ★ 触发词：narration / title 一旦出现下列任何关键词，**必须**用 scene：
     区域、边界、向量场、参数方程、圆、椭圆、多边形、环路、闭合曲线、
     旋度、散度、通量、线积分、面积分、二重积分、格林公式、斯托克斯、高斯。
   - REQUIRED: 填 step.scene（注意是直接挂在 step 上，**不是** step.plot.scene）:
     {
       "x_min": -1, "x_max": 5, "y_min": -1, "y_max": 4,
       "x_label": "x", "y_label": "y",
       "regions": [{"vertices": [[0,0],[4,0],[4,3],[0,3]], "label": "R", "emphasis": "secondary"}],
       "segments": [{"x0":0,"y0":0,"x1":4,"y1":0,"arrow":true,"label":"C₁"}],
       "vector_field": {"expression_px":"-y","expression_py":"x","step":0.8,"label":"F"},
       "points": [{"x":2,"y":1.5,"label":"P","emphasis":"accent"}],
       "curves": [{"expression_y":"sin(t)","expression_x":"cos(t)","t_min":0,"t_max":6.28,"label":"圆"}],
       "annotations": [{"x":4.4,"y":3.4,"text":"$F$","align":"ne"}],
       "formula_latex": "\\\\oint_C P\\\\,dx + Q\\\\,dy",
       "caption": "短旁白一句"
     }
   - 字段使用规则：
     - regions: 多边形区域，按顶点顺序逆时针连成闭合。label 是文字标签。
     - segments: 线段或带箭头的有向边；arrow=true 表示画箭头。
     - vector_field: P, Q 都是 x, y 的表达式（同 function 允许的字符集）。step 是采样格距。
     - curves: 1D 用 expression_y=f(x)；参数式用 expression_y+expression_x+t_min+t_max。
     - points: 单个标记点，emphasis 控制颜色。
   - Tokens 在 scene step 中应为空数组——几何信息全部走 scene 字段。

C. WHEN TO USE visual_kind="formula" (兜底，仅用于无法画图的纯抽象内容):
   - 群论、集合论、抽象代数恒等式、概率分布表、矩阵代数等纯符号题。
   - 注意：「向量场 F=(-y, x)」**不属于**这一类——它能在坐标系里画出来，必须用 scene。
   - REQUIRED: 把核心方程写进 step.plot.formula_latex (KaTeX)。
   - 例：「Z/nZ 的加法群」可以用 formula 兜底；「格林公式的几何含义」**绝对不能**。

- Across all steps, reveal progressively: 直觉 → 例子 → 一般式 → 应用。

D. 多层组合（高级）：
   - 几何主图 + 公式角标：step.layers = [
       {kind:"math_scene", timing:{enter_at:0,exit_at:1,z_order:0}},
       {kind:"katex_overlay", timing:{enter_at:0.4,exit_at:1,z_order:2},
        katex_overlay:{x:2,y:3.5,latex:"F=(-y,x)",align:"ne"}}
     ]
   - 不要把同一种 layer kind 写两次！如果都是 math_scene 就只写一个；不要复制粘贴层。
""",
    TopicDomain.PHYSICS: """
VISUAL + PEDAGOGY RULES for physics:
- Step template: 现象（生活例子） → 受力分析或机制 → 列方程 → 代入数字解 → 验证单位。
- Use visual_kind="array" to show forces, components, or quantities.
- Token labels = physical quantities with units (e.g. "F=10N", "θ=30°", "a=5m/s²").
- Always state units; never use bare numbers for physical quantities.
- Use emphasis="primary" for the quantity being solved in each step.
- First time a law appears (Newton 第二、能量守恒…), state it in one sentence in plain language.
""",
    TopicDomain.CHEMISTRY: """
VISUAL + PEDAGOGY RULES for chemistry:
- Step template: 反应背景一句（为什么会发生） → 反应物结构 → 反应箭头与机制 → 产物 → 守恒检查（原子数/电荷）。
- Use visual_kind="array" to show reactants, products, or molecular components.
- Token labels = chemical symbols or compound formulas (e.g. "H₂O", "CO₂", "→").
- Mention oxidation state changes when relevant, and explain in one line why electrons move.
""",
    TopicDomain.BIOLOGY: """
VISUAL + PEDAGOGY RULES for biology:
- Step template: 结构（画一遍）→ 功能（结构如何实现功能）→ 过程（按时间走一遍）→ 结果（对整体生物的意义）。
- Use visual_kind="array" to show biological components or process stages.
- Avoid jargon stacking; explain each new term with one analogy before reusing it.
""",
    TopicDomain.GEOGRAPHY: """
VISUAL + PEDAGOGY RULES for geography:
- Step template: 现象（先放一张「场景图」 token 列表） → 成因（自然/人文驱动力） → 影响 → 应对。
- Use visual_kind="array" to show regions, factors, or process stages.
- Always state spatial/temporal scale up front (where, when).
""",
}

_COMBINED_SCHEMA = """{
  "cir": {
    "version": "0.1.0",
    "title": "string — concise topic title (≤ 40 chars)",
    "domain": "algorithm | math | code | physics | chemistry | biology | geography",
    "summary": "string — 1–2 sentence overview of what will be visualized",
    "steps": [
      {
        "id": "step_01",
        "title": "string — step title (≤ 30 chars)",
        "narration": "JSON array — see Narration Output Format section",
        "visual_kind": "array | graph | function | scene | formula",
        "tokens": [
          {
            "id": "string — unique id like t0, t1, node_root",
            "label": "string — display label (≤ 8 chars)",
            "value": "string | null",
            "emphasis": "primary | secondary | accent"
          }
        ],
        "edges": [{"from_id": "node_root", "to_id": "node_left"}],
        "plot": {
          "_comment": "REQUIRED when visual_kind=function. ALSO use plot.formula_latex when visual_kind=formula.",
          "curves": [
            {"expression": "a*x^2 - b", "label": "f(x)", "emphasis": "primary"}
          ],
          "x_min": -6.0,
          "x_max": 6.0,
          "y_min": null,
          "y_max": null,
          "marker_x": null,
          "shade_from": null,
          "shade_to": null,
          "x_label": "x",
          "y_label": "y",
          "formula_latex": "f(x) = a x^2 - b"
        },
        "annotations": ["short side notes — REQUIRED when visual_kind=formula"],
        "_layers_comment": "OPTIONAL layered output. When provided, the renderer stacks each layer in z_order within this step's progress window. Pick this when one visual element isn't enough to explain the step (e.g. region + vector field + corner formula together). See '多层 step 黄金范例' below.",
        "layers": [
          {
            "kind": "math_scene | math_plot | math_formula | katex_overlay | array_boxes | bar_blocks | tree_graph | narration_card",
            "timing": {"enter_at": 0.0, "exit_at": 1.0, "appear_anim": "fade | draw | slide | scale | none", "z_order": 0},
            "scene": "OPTIONAL — only when kind=math_scene; same shape as the step-level scene field",
            "plot":  "OPTIONAL — only when kind=math_plot or kind=math_formula",
            "katex_overlay": {"x": 1.5, "y": 2.0, "latex": "F=(-y,x)", "align": "ne | nw | se | sw | center"},
            "narration_card": {"text": "教学卡片正文", "position": "top | bottom | center", "emphasis": "primary | secondary | accent"}
          }
        ]
      }
    ]
  },
  "execution_map": {
    "duration_s": "float — total animation duration in seconds (e.g. step_count × 3)",
    "algorithm_id": "string | null — snake_case name, e.g. bubble_sort (algorithm domain only)",
    "algorithm_code": "list[str] | null — pseudocode lines; code_lines indexes into this",
    "parameter_controls": [
      {
        "_comment": "OPTIONAL — emit one entry per parameter the student should be able to drag. Required for math curves that contain free parameters (e.g. a, b in `a*x + b`). Do NOT hard-code such parameters into the expression.",
        "id": "a",
        "label": "斜率 a",
        "value": "1.0",
        "description": "拖动看 a 增大时直线如何变陡"
      }
    ],
    "checkpoints": [
      {
        "id": "cp_01",
        "step_index": 0,
        "step_id": "must match a CIR step.id",
        "visual_kind": "array | graph | function | scene | formula (mirror the step)",
        "title": "string (mirror the step title)",
        "summary": "string — single sentence for this checkpoint",
        "start_s": 0.0,
        "end_s": 3.0,
        "code_lines": "list[int] — 0-indexed lines into algorithm_code or user source",
        "focus_tokens": "list[str] — token ids emphasised this step",
        "array_focus_indices": "list[int] — array indices being compared this step",
        "array_reference_indices": "list[int] — secondary indices being referenced",
        "swap_indices": "list[int] — indices swapped this step (omit when only comparing)"
      }
    ]
  }
}"""


_CODE_TRACK_INSTRUCTION = """
## Source Code Tracking
The user provided source code in `{language}`. For EACH execution_map.checkpoint, \
populate `code_lines` with the 0-indexed line numbers from the source that this step \
is executing or directly explaining. Use [] for setup/intro checkpoints not tied to \
specific lines.

Source code (line numbers shown for reference):
```{language}
{numbered_source}
```
"""


def _number_source(source: str) -> str:
    return "\n".join(f"{i:>3}  {line}" for i, line in enumerate(source.splitlines()))


_ALGO_CODE_INSTRUCTION = """
## Algorithm Pseudocode (REQUIRED for algorithm domain)
You MUST populate execution_map with:
- "algorithm_id": snake_case name of the algorithm (e.g. "bubble_sort", "binary_search")
- "algorithm_code": list of concise pseudocode lines (8–15 lines, clear and educational)

For EACH checkpoint, set "code_lines" to a list of 0-indexed positions in algorithm_code \
that are executing in this step. Use [] only for setup/intro steps with no active code line.

Rules for algorithm_code:
- Write in language-neutral pseudocode (no language-specific syntax)
- Each line should be a single logical operation (one comparison, one swap, one assignment)
- Indent with 2 spaces to show structure
- Keep each line ≤ 60 characters
"""


def build_cir_prompt(
    prompt: str,
    domain_hint: TopicDomain,
    source_code: str | None = None,
    language: str = "python",
) -> tuple[str, str]:
    """Return (system_prompt, user_prompt) for CIR + ExecutionMap generation.

    Output format: a single JSON object with two top-level keys:
      - "cir": the descriptive teaching script (CirDocument)
      - "execution_map": the execution semantics layer (timing, code lines,
        token focus, array indices)

    The domain_hint is a keyword-based guess; the LLM decides the final
    CirDocument.domain value and may override it.
    """
    domain_guidance = _DOMAIN_GUIDANCE.get(domain_hint, _DOMAIN_GUIDANCE[TopicDomain.ALGORITHM])
    code_track = ""
    if source_code and source_code.strip():
        code_track = _CODE_TRACK_INSTRUCTION.format(
            language=language or "python",
            numbered_source=_number_source(source_code),
        )
    # For algorithm domain: add pseudocode generation instruction.
    # If the prompt matches a pre-baked algorithm, inject the canonical pseudocode.
    algo_code_track = ""
    if domain_hint == TopicDomain.ALGORITHM and not source_code:
        algo_id = infer_id(prompt)
        canonical_hint = prompt_hint(algo_id) if algo_id else ""
        algo_code_track = _ALGO_CODE_INSTRUCTION + canonical_hint
    examples = examples_for_domain(domain_hint)

    system = f"""You are an expert educational animator. \
Your job is to convert a student's question into a step-by-step visual teaching script.

The output is a SINGLE JSON object with two layers:
1. **cir** — the descriptive script (what is shown, narration, tokens)
2. **execution_map** — the execution semantics (timing, code lines, focus indices)

## 教学风格铁律（PEDAGOGY — APPLIES TO ALL DOMAINS）
- 受众：零基础学生。永远假设他们没听过任何术语。
- 每一步只引入 **一个** 新概念；不要在同一步把定义、性质、应用一次塞完。
- 第一次出现的术语必须先用一句日常类比，再给形式定义。
  例：「导数就像测速仪——它告诉你函数在这一点变化得多快。形式上 f'(x) = …」
- 每一步 narration 顺序：**先「为什么需要这一步」→ 再「这一步做什么」→ 最后「得到了什么」**。
- 禁止术语堆砌：不允许连续出现两个未解释的专有名词。
- 句子长度交替：短句用于强调，长句用于解释。
- 用第二人称「你」「我们」，避免「该函数」「此变量」这种公文腔。
- 永远先给具体数字举例（f(x)=x², x=2 → f(2)=4），再泛化到符号。
- 标题（step.title）必须是动词或学习目标（如「先看一个简单的例子」「找出曲线的斜率」），不要是抽象名词。

## CRITICAL OUTPUT RULES
1. Output ONLY valid JSON. No markdown fences, no explanations, no extra text.
2. The JSON must match the schema exactly and be parseable by Python json.loads().
3. Produce exactly 4–8 steps in cir.steps, with ONE checkpoint per step (1:1).
4. Every step must have a distinct visual state — no duplicate token configurations.
5. execution_map.checkpoints[].step_id MUST match a cir.steps[].id.
6. checkpoint.start_s / end_s must partition [0, duration_s] without gaps or overlap.

## Combined JSON Schema
{_COMBINED_SCHEMA}

## Allowed visual_kind values
Only use: "array", "graph", "function", "scene", or "formula"
- "array"    → 真正的线性数据结构、序列项、化学物种列表等。**不是默认值**——当内容
               不是一串可枚举的并列项时，请改用 function / scene / formula。
- "graph"    → ONLY for explicit tree or graph data structures.
- "function" → 1-D coordinate-plane math (1D 函数作图、导数、积分面积、三角波)。
               Requires the step's "plot.curves".
- "scene"    → ★ 2D 几何场景（区域、向量场、参数曲线、有向边界、环路、旋度/散度）。
               **任何包含「区域 / 边界 / 向量场 / 参数方程 / 环路 / 旋度 / 散度 / 通量
               / 线积分 / 面积分」的 math 题都必须用 scene，不能退到 formula。**
               Requires the step's "scene" object（直接挂在 step 上）。
- "formula"  → 纯抽象代数（群、集合、矩阵恒等式、概率分布表）——无法画出几何图形的兜底。
               不能用于向量场或 2D 区域。Requires step.plot.formula_latex。

## Domain Classification
Keyword analysis suggests: **{domain_hint.value}**
You may change this if the topic clearly belongs to a different domain.
{domain_guidance}

## Narration Output Format
Output the "narration" field of each cir step as a JSON array (NOT a plain string):
- String elements are literal text.
- {{"t":"tokenId"}} inserts that token's label at runtime.
- A conditional branch is a nested array: [ [condition, segments], ..., [{{}}, segments] ]
  where condition is {{"a":"t0","op":"lt","b":"t1"}} (token vs token) or \
{{"a":"t0","op":"gt","v":5}} (token vs fixed value).
  Supported ops: lt gt eq lte gte neq. The LAST branch MUST use {{}} as the default fallback.
- Only reference token ids from the SAME step's tokens list.
Example (bubble sort compare step):
["Compare ",{{"t":"t0"}}," and ",{{"t":"t1"}},". ",
  [[{{"a":"t0","op":"lt","b":"t1"}},[{{"t":"t0"}}," < ",{{"t":"t1"}},", no swap."]],
   [{{"a":"t0","op":"gt","b":"t1"}},[{{"t":"t0"}}," > ",{{"t":"t1"}},", swap them."]],
   [{{}},[{{"t":"t0"}}," equals ",{{"t":"t1"}},", no swap."]]]]

## Narration Quality Rules
- Narration must explain WHY this step matters, not just WHAT it shows.
- Write as if speaking directly to a student: clear, friendly, educational.
- Vary sentence length. Avoid starting every sentence the same way.

## Token Quality Rules
- Labels must be concise (≤ 8 characters). Use actual values, not descriptions.
- For arrays: each token = one element. Show ALL elements in EVERY step (tokens stay consistent).
- Change emphasis per step to highlight what's happening, not the entire array.
- For formula/function steps, tokens may be empty — don't manufacture A/B/C/D placeholders.

## ExecutionMap Quality Rules
- duration_s: pick ~3 seconds per step (e.g. 6 steps → 18.0).
- focus_tokens: token ids to emphasise this step (usually mirrors emphasis="primary").
- array_focus_indices: 0-indexed positions of array elements currently active in the operation.
- array_reference_indices: secondary indices being referenced but not the primary action.
- Empty arrays are fine when the step doesn't apply (e.g. intro step has no focus indices).
- parameter_controls: emit one entry per *free* parameter that the lesson is asking the
  student to vary (e.g. `a` and `b` in `a*x + b`). The expression must reference these by
  name; do NOT bake the parameter values into the expression. Skip this field when there
  are no free parameters.

## Multi-layer step（可选，进阶能力）
- 当一个步骤需要叠加多种视觉（例如：底层画区域 + 中层叠加向量场 + 顶层写公式），
  使用 step.layers 数组按时序与 z_order 叠合每一层。
- 每个 layer 的 timing.enter_at/exit_at 都是 0..1 区间，归一化到当前 step 的进度。
- 一个 step 可以只有 1 个 layer（等价于不写 layers），也可以最多 4 个 layer。
- 推荐组合（按域）：
  - 算法：array_boxes + narration_card（提示这一步要注意什么）
  - math 2D 几何：math_scene(region) → math_scene(vector_field) → katex_overlay → math_formula
  - math 1D：math_plot + katex_overlay（角落公式）
  - math 抽象：math_formula + narration_card（强调要点）
  - physics：array_boxes（量纲表）+ katex_overlay（公式）
- appear_anim 可选值：fade（默认渐显） | draw（曲线/段沿进度延伸） | slide（侧向滑入）
  | scale（缩放入场） | none（立即出现）。
- 不需要在 layers 里重复 step 顶层的 tokens/scene/plot——同 kind 的 layer 不指定 scene/plot 时
  自动继承 step 上的对应字段。
{examples}

## 输出前自检（SELF-CHECK before emitting JSON — fix any violation silently）
1. 每一步 narration 是否先讲了「为什么」？
2. 是否引入了未解释的术语？若有，回到上一步用一句类比补足。
3. 如果 domain == math：visual_kind 必须从 "function" / "scene" / "formula" 中选。
   出现 "array" 视为错误。**关键规则**：扫描每一步的 narration / title——
   - 出现「区域」「边界」「向量场」「参数方程」「环路」「闭合曲线」「旋度」「散度」
     「通量」「线积分」「面积分」「二重积分」「格林公式」「斯托克斯」「高斯」「圆周」
     「椭圆」「多边形」中任何一个 → **必须**用 "scene"，并填 step.scene；
   - 1D 函数 y=f(x) 作图 / 导数 / 切线 / 积分面积 → "function"，填 step.plot.curves；
   - 仅当题目是抽象代数 / 群 / 集合 / 概率分布表 等无几何对象时 → "formula"。
   ⚠️ 反例：narration 提到「向量场 F=(-y,x)」却用 visual_kind="formula"——重写！
4. visual_kind="function" 时 plot.curves 是否非空、表达式是否仅含允许的字符？
5. visual_kind="scene" 时 step.scene 是否非空？regions/segments/vector_field/curves 至少有一个？
   vector_field.expression_px / expression_py 是否只用允许的字符？
6. visual_kind="formula" 时 plot.formula_latex 是否非空、annotations 是否 1–3 条？
7. 涉及自由参数的 function 步骤是否在 execution_map.parameter_controls 列出了对应滑杆？
8. 如果使用了 layers：每个 layer.timing.enter_at <= exit_at，且都在 [0,1] 之内？
   层之间的 z_order 是否反映正确的视觉前后关系？
   **不要把同一种 kind 的 layer 重复两次**——一个 step 里 math_scene 只能出现一次。
9. 让一名零基础同学读你的 narration——他能复述出「这一步在干嘛、为什么」吗？
{code_track}"""

    system = system + algo_code_track
    user = prompt
    return system, user
