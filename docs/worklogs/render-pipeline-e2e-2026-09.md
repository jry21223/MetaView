# 渲染 Pipeline 多学科端到端验证（2026-09）

对 `main`（`7e37509`）的完整渲染链路做了一次跨学科端到端验证：
`POST /api/v1/pipeline` → CoverageDecision → LessonPlan → PlaybookScript →
canonical QualityReport → DirectorScript → Remotion 静帧 → MP4 导出。

复现命令见 [`scripts/e2e_render_pipeline.py`](../../scripts/e2e_render_pipeline.py)。

## 运行方式

- Edition `self`，`METAVIEW_GENERATION_MODE=single`，`METAVIEW_ROUTER_MODE=heuristic`。
- 无 LLM 凭据。25 条用例全部命中 deterministic SkillPack 或 capability 拒绝路径，
  `generator_path` 均为 `skill_pack` / `capability_resolution`，**没有一条走 mock provider**，
  因此结论反映的是真实确定性生成链路，而不是 mock 桩。
- 提示词直接取自各 SkillPack manifest 里声明的 capability `examples`。
- 生产写入限流 `10/minute` 保持开启，驱动脚本用退避而不是关限流。

## 结果

| 学科 | 通过 / 用例 |
|---|---|
| math | 5 / 9 |
| algorithm | 2 / 4 |
| physics | 2 / 2 |
| chemistry | 4 / 4 |
| biology | 3 / 3 |
| geography | 3 / 3 |
| 合计 | **18 / 25** |

18 条成功用例全部渲染出静帧（68 张 PNG），DirectorScript 均带 beats。
BFS 用例的 MP4 导出验证通过：1920×1080、30fps、1122 帧、37.46s、h264。

## 发现

### 1. SkillPack 路由被抢占，两条 manifest 自带示例无法到达自己的 Skill

`SkillRegistry.heuristic_match` 取最大 confidence，而各 Skill 的 confidence 是常量：

- `求 A=[[1,2],[3,4]] 的特征值` → `probability_statistics_core` (0.90)
  压过 `linear_algebra` (0.87)。这是 `linear_algebra` manifest 自己的
  `eigen_basic` 示例；统计包的列联表正则 `(\[\s*\[.*?\]\s*\])` 会认领任意二维方括号，
  即使提示词里有「特征值」。
- `解释 Dijkstra：A->B=2, B->C=1，求 A 到 C 最短路` → `linear_algebra` (0.87)
  压过 `algorithm_graph_core` (0.86)，随后 CoverageResolver 判为 `unsupported`
  并直接拒绝生成。这是 `algorithm_graph_core` manifest 自己的 `dijkstra` 示例。

常量 confidence 没有表达「关键词命中强度」，谁的常量大谁赢。

### 2. `calculus_core` 三个 capability 全部被质量门拦下

`derivative` / `integral_area` / `limit_1var` 均以 `step.does_not_answer_prompt`
（ERROR）+ `quality.repair_unavailable` 失败，即整个微积分包目前产不出可用讲解。

根因在 [`calculus_core/playbook_adapter.py`](../../apps/api/app/domain/skills/calculus_core/playbook_adapter.py)
的 `_script()`：步骤 `voiceover_text` 直接取 snapshot 的 `caption`，末步 caption 是
「最终结果。」「整理答案。」这类占位语，标题取自固定数组 `[..., "总结"]`。
真正的答案只存在于 `MathFormulaSnapshot.formula_latex` 的 `\boxed{...}` 里，
而质量门的 `_check_final_step_answers_prompt` 只对 `title + voiceover_text` 取 token，
永远看不到公式，于是 prompt token 与末步 token 交集恒为空。

`derivative` 还额外缺 LessonPlan 声明的 required fact `tangent` 与 visual roles
`secant` / `tangent` / `target_point`。

质量门的判定是对的——末步确实没说出答案；缺陷在适配器。

### 3. `algorithm_graph_core` 只为 BFS 填充遍历状态

[`playbook_adapter.py`](../../apps/api/app/domain/skills/algorithm_graph_core/playbook_adapter.py)
的 `_graph_visual_state()` 只在 `solution.kind == "bfs"` 时填 `visited_node_ids` /
`queue_node_ids`，其余算法走兜底分支，两者都是 `[]`。
质量门 `_snapshot_has_graph_traversal_state` 要求 `graph_scene` 有非空 `visited_node_ids`，
所以 DFS 被 `algorithm.state_missing` 拦下。

拓扑排序侥幸通过只是因为它的提示词不含「遍历」标记，走了更宽松的
`_snapshot_has_algorithm_state` 分支——同一个缺陷在两条用例上判定不一致。

### 4. `stats_chart_scene` 柱状图丢掉分类轴（跨学科）

[`AdvancedMathRenderers.tsx`](../../apps/web/src/features/playbook/engine/renderers/AdvancedMathRenderers.tsx)
的 `StatsChartSceneRenderer` 从未读取 `snap.x_label` / `snap.y_label`，
契约里声明了也不会渲染；柱子按数值索引落在连续轴上。

结果是分类数据被画成数值轴：
- biology-monohybrid：`x_label="表现型"`、`y_label="概率"`，画面上 x 轴刻度是 `0.0 / 0.5 / 1.0`，
  看不出哪根柱子是显性、哪根是隐性。
- geography-climate-compare：两个站点的对比同样退化成 `0.0 / 0.5 / 1.0`。

另外末柱以 `xMax` 为中心绘制，有一半溢出绘图区右边界。

### 5. 物理 `motion_scene` 忽略斜面几何，且动画中标签相撞

`斜面倾角 30°…` 与 `水平拉力…` 两条提示词生成的 `motion_scene` snapshot
除 summary 文案外**逐字节相同**：都是 `y=0` 的水平轴、`y=0` 的物体、水平速度矢量。
倾角没有进入场景，画面在讲「沿斜面下滑」时显示的是水平运动。

同一场景里 `axis` 的标签「运动方向」固定在线段中点，`body` 沿 `x` 轨道动画穿过中点，
两个标签在步骤中后段重叠成不可读的字形。这正是 `make visual-check` 想守住的
annotation-collision 不变量，但它出现在新生成的内容上，而不是已冻结的 fixture。

## 未覆盖

- `code` 学科：没有确定性 SkillPack，需要真实 LLM 凭据，本次未验证。
- `agent` 模式、Follow-up 与版本恢复、带音轨导出（beta）未验证。
- 真实生产部署不可达（沙箱网络策略拒绝 `metaview.top`），本次验证对象是 `main` 分支代码。

## 追加诊断：为什么生成质量和 Gold Template 差这么远

上面五条是症状。把「模板」和「生成内容」放在同一把尺子下量，根因是**编排短路**，
不是 renderer。

### 快照词汇表对比

| snapshot kind | Gold Template（人工编写） | Pipeline 生成（69 步） |
|---|---|---|
| `math_plot` | 12 | **0** |
| `math_scene` | 11 | **0** |
| `physics_force_scene` | 4 | **0** |
| `algorithm_bars` / `algorithm_array` | 5 | **0** |
| `phase_portrait_scene` | 2 | 0 |
| `code_trace_scene` | 1 | 0 |
| `math_formula` | 2（5%） | **32（46%）** |
| `table_scene` | 0 | **18（26%）** |
| 交互控件 | 56 | **0** |

renderer registry 注册了 28 个 renderer，生成内容只用到 6 个，其中 72% 是
公式卡加表格。chemistry 有 `reaction_scene` / `molecule_2d_scene` 却在画表格，
biology 有 `bio_cell_scene` / `bio_process_scene` 却在画表格，geography 有
`geo_map_scene` 却在画表格。

### 不是 renderer 的问题

模板和生成内容走的是同一套 renderer、同一条 Remotion 出口。模板好看是因为喂给
renderer 的是富数据（`math_scene` 的几何对象、`math_plot` 的多曲线与 marker）。
28 个 renderer 本身工作正常——本次 18 条成功用例全部渲染出静帧，MP4 导出也通过。

### 工具是「暴露了但够不着」

`GET /api/v1/agent/animation-tools` 暴露了 13 个动画工具，其中
`math.show_tangent` / `math.show_derivative_compare` / `math.show_integral_area`
正是导数模板需要的能力。实测调用：

```
POST /api/v1/agent/animation-tools/expand
{"tool":"math.show_tangent","args":{"expression":"x^2*sin(x)","x0":1.0,
 "tangent_expression":"2.22*(x-1)+0.841","x_min":-6,"x_max":6}}
```

返回一个 `math_plot` layer：原函数曲线（primary）+ 切线（secondary，标注「切线 (x=1.0)」）
+ `marker_x=1.0`，外加一个 `narration_card`。`issues` 为空。
这正好满足 calculus LessonPlan 要求的 `secant` / `tangent` / `target_point` 三个
visual role——也就是发现 2 里被判定「缺失」的那三个。

工具能用，但它只挂在 agent 路径上，而 agent 路径在这些提示词上根本不会执行。

### 短路点

[`run_pipeline.py:243`](../../apps/api/app/application/use_cases/run_pipeline.py)（single 模式）：

```python
if route_match is not None and route_context.coverage_decision.mode == "specialized":
    handled = await self._try_execute_skill(...)
    if handled:
        return          # ← LLM / 动画工具永远到不了
await self._execute_single(...)
```

agent 模式同样受限，`can_execute_skill` 的判据一模一样：

```python
can_execute_skill=lambda ctx: (... and ctx.coverage_decision.mode == "specialized")
```

于是对这 13 个 SkillPack 覆盖的学科，**两种生成模式下 agent 与 13 个动画工具都被绕过**，
输出质量的上限就是确定性 adapter 的快照词汇表：34 个 `MathFormulaSnapshot` +
13 个 `TableSceneSnapshot`，13 个包加起来只有 1 个 `MathSceneSnapshot`。

确定性 SkillPack 保证了「算得对」（本次化学配平、遗传比例、高斯消元结果都正确），
但同时封死了「讲得好」的通道。发现 2 的「末步不陈述答案」正是这个上限的直接表现：
adapter 只会把答案塞进 `\boxed{}` 公式卡。

### 修的方向

问题在优先级，不在缺工具。三条路，代价递增：

1. SkillPack 保留 solve（算得对），把 render 交给动画工具——adapter 输出
   `math_plot` / `math_scene` 而不是公式卡。改动集中在各 `playbook_adapter.py`。
2. 让 `specialized` 覆盖走「skill 出数据 + agent 出画面」，而不是 skill 独占并 return。
3. 给 adapter 补 `parameter_controls`，否则 README 承诺的参数互动轨道在生成内容上
   始终是空的。

## 追加审计：agent 工具面（描述、schema、报错回显）

用「一个只能看到工具名 + description + args_schema 的 LLM」的标准，把
`/api/v1/agent/animation-tools`、`/api/v1/agent/runtime-tools`、geometry asserts
和 sidecar Drawing 工具过了一遍，全部为实测结果。

### T1. 参数字段描述覆盖率为 0

13 个动画工具 101 个参数字段、22 个 runtime 工具 98 个参数字段，
**199 个字段没有一个带 `description`**。单位、表达式语法、枚举含义、
`alleles` 与 `cells` 的布局关系、`role` 的合法取值，agent 全靠猜。
Pydantic 的 `Field(description=...)` 会自动进 json schema，属于纯增量修复。

### T2. 描述不准确 / 埋雷

- `math.show_tangent` 的描述是 "Show a function and tangent line at a selected
  x value"，但 required 里有 `tangent_expression`——**切线要调用方自己算**，
  描述只字未提；且服务端不校验它是不是真切线：给 `x^2` 在 `x0=1` 配上
  `100*x-500`，返回 `issues: []`。`show_derivative_compare` 的
  `derivative_expression` 同理。错误画面就是这样带着「成功」标记流下去的。
- `skill.*.solve` 的 description 直接复用 manifest 一句话（"Deterministic
  single-variable calculus explanations."），`problem_spec` 在 schema 里是
  `{"type": "object"}` 黑箱——真实的 `CalculusCoreProblemSpec` 有 9 个字段和
  `task` Literal 枚举，agent 无从得知。
- sidecar `add_curve_parametric` 的语法说明是循环引用："Expressions use the
  same character set MathPlotRenderer accepts"——模型读不到 MathPlotRenderer。

### T3. 报错回显丢关键信息

- [`animation_tools/registry.py:153`](../../apps/api/app/domain/animation_tools/registry.py)
  只取 `exc.errors()[0].get("msg")`：**丢字段路径、丢其余所有错误**。实测缺
  `tangent_expression` 时回显是 `Invalid args ...: Field required`——不说缺哪个；
  `forces[0].magnitude` 传字符串时回显 `Input should be a valid number`——不说哪个字段。
- `skill.calculus_core.solve` 传错 args 形状时返回
  `{"ok": true, "handled": false, "fallback_reason": "unsupported_calculus_core"}`：
  成功标志位为 true，理由撒谎（不是能力不支持，是 args 不对），没有任何
  「期望的 spec 长这样」提示。schema 广告的 `required: ["run_id","prompt"]`
  实际也不执行——不传照样跑。
- `animation_tool.unknown_tool` 不回可用工具列表或最近似名。
- 对照组：geometry assert 走 FastAPI 原生 422，带全部 `loc`，反而是可用的。

### T4. 校验时机太晚（fail-late 而非 fail-fast）

表达式语法后端前端是一致的（都收 `x^2`/`sin(x)`，都拒 `x**2`/`\sin(x)`，
`safe_math_expr.py` 与 `mathExpr.ts` 实测无漂移）——但这套校验**不在工具边界上跑**：

- `animation-tools/expand` 对 `\sin(x)`、`x**2` 一律 `issues: []` 放行；
  错误要等整份 Playbook 进 canonical gate 才爆（`math.expression_invalid`），
  报错已经和当初那次工具调用脱钩，agent 只能整轮重来。
- Drawing 路径同样只在 `finalize_playbook` 后的 self-check 里验表达式：
  第 3 步埋的雷，画完 14 步才响。

而 LLM 默认吐 Python（`**`）或 LaTeX（`\sin`）语法；`^` 才是本仓库的方言，
这条方言在 SYSTEM_PROMPT、8 份 SKILL.md、35 个工具描述里**一处都没写**
（唯一一处是 T2 那句循环引用）。

### T5. 命名不一致

list 返回 `name` 字段，`expand`/`execute` 请求体却要 `tool`（我第一次就猜成
`tool_id`）；动画工具用 `expression`，geometry assert 用
`expression_x/expression_y/t_min`；`math.show_integral_area` 的 `from_`
（Python 关键字规避 + alias "from"）直接泄漏进 schema；`skill.*.solve` 要求
agent 提供 `run_id` 这种 harness 内部字段。

### T6. 暴露形态：两跳 + free-form JSON

sidecar 只给 LLM 两个动画工具：`animation_tool_list` 和
`animation_tool_expand(tool, args: Record<string, unknown>)`。13 个工具不是
一等 function-calling 工具，args 在模型侧没有 schema 约束——每个参数错误都
变成一次运行时往返，而往返的报错又丢路径（T3）。模型必须先 list、再从返回
文本里自行解析 json schema、再盲填 free-form args。

### 好的一面

SYSTEM_PROMPT 的工作流纪律本身写得不错（LessonPlan 绑定、断言前置、
参数控件规则、禁止发明字段）；表达式语法前后端无漂移；geometry assert 的
422 回显完整。问题集中在工具边界的描述与回显，不在工作流设计。

### 修复优先级

1. `registry.py:153`：拼接全部 `exc.errors()` 的 `loc + msg`（一行级改动，收益最大）。
2. `expand` 边界上对所有表达式字段跑 `compile_safe_math_expression`，
   报错附语法提示（「用 `^` 表示幂，不支持 `**` 与 LaTeX 反斜杠」）。
3. 给 199 个参数字段补 `Field(description=...)`；`show_tangent` 要么在描述里
   写明「切线表达式需调用方计算」，要么后端用 sympy 自己算（能力现成）。
4. `skill.*.solve` 用 `model_json_schema()` 导出真实 ProblemSpec；
   `handled: false` 时回显期望 spec 与失败原因，`ok` 不再恒为 true。
5. 表达式语法契约写进 SYSTEM_PROMPT 与各 SKILL.md。
6. 统一 `tool`/`name` 与 `expression*` 命名，schema 里去掉 `run_id`、`from_` 泄漏。
