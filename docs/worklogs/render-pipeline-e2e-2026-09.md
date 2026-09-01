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
