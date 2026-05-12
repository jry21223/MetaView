# 数学学科 — CIR 生成参考

> 配合后端 `cir_prompt._DOMAIN_GUIDANCE[TopicDomain.MATH]` 使用。这里是给「调 prompt
> / 排查 LLM 输出」的人看的速查；运行时 prompt 以代码为准。

## 何时用 `visual_kind="function"`（坐标系曲线）

凡是「画在坐标系上更直观」的内容都用 `function`，并填步骤的 `plot` 对象：

| 场景 | 典型 `curves` | 其它字段 |
|---|---|---|
| 画 f(x) | `["x^2 - 2*x"]` | `formula_latex` |
| 函数变换（平移/缩放） | `["x^2", "(x-2)^2 + 1"]`（原函数 secondary，变换后 primary） | — |
| 导数与切线 | `["0.5*x^2", "a*x - 0.5*a^2"]`（accent = 切线），`marker_x` 取切点 | `marker_x`, `formula_latex` |
| 定积分 / 黎曼和 | `["x^2"]` | `shade_from`, `shade_to` |
| 三角波 | `["sin(x)", "2*sin(x)"]` | `x_min=0`, `x_max≈6.28` |
| 指数/对数 | `["exp(x)"]` / `["log(x)"]` | `x_min`, `x_max` 注意定义域 |
| 圆 / 隐函数 | 拆成 `["sqrt(r^2 - x^2)", "-sqrt(r^2 - x^2)"]` | `y_min/y_max` 固定 |

`emphasis`：`primary` 当前焦点曲线 · `secondary` 衬托/对照（虚线） · `accent` 结果/答案曲线。

跨步骤建议「逐层揭示」：父函数 → 变换/操作 → 分析（切线、面积、零点……）。

## 表达式语法（前端 `shared/lib/mathExpr` 求值）

- 运算符：`+ - * / % ^`（`^` 右结合幂），一元 `+ -`，括号
- 变量：`x`（采样自变量）+ 任意命名参数
- 常量：`pi` `tau` `e`
- 函数：`sin cos tan asin acos atan atan2 sinh cosh tanh exp log ln log2 log10 sqrt cbrt abs floor ceil round sign min max pow hypot`
- **不要**预先采样成点；**不要**写编程语法（`Math.`、`**`、函数定义、`;` 等）——只写数学式子
- 后端白名单字符：`[0-9A-Za-z_+\-*/^%(). ,]`，越界字符的曲线会被丢弃；没有合法曲线则整步降级成数组视图

## 何时仍用 `visual_kind="array"`

不可画成 y=f(x) 的纯代数：逐项展开/因式分解（每个 token = 一个项，如 `"3x²"`、`"-2x"`、`"=0"`）、
矩阵的行、数列/级数的项列举。

## 交互数学画板（前端）

`apps/web/src/features/math-widget/` 提供与渲染器同源的交互版（顶栏「📐 数学画板」按钮）：
预设场景（一次函数 / 抛物线顶点式 / 正弦波 / 圆 / 导数与切线）+ 参数滑块 + 实时 KaTeX 公式 +
`FunctionPlot` SVG 画板。新增预设：在 `lib/presets.ts` 追加一个 `MathWidgetPreset`（参数 key 必须是
ASCII 字母，因为它们要作为 `mathExpr` 的标识符）。
