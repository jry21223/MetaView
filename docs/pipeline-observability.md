# Pipeline Run Observability

Status: Active

Issue #241 的最小可观测工具：只读 `pipeline_runs` 表里**既有持久化字段**
（`status` / `review_json` / `quality_report_json`），不修改生产代码、不加埋点，
为后续「是否扩展 warning 修复 allowlist、重构修复机制 / 自检契约 / provider 路径」
提供数据依据。

## 运行方式

```bash
python3 scripts/pipeline_observability.py                # 人类可读表格
python3 scripts/pipeline_observability.py --json         # 仅 JSON（stdout）
python3 scripts/pipeline_observability.py --out data/pipeline_observability.json
```

数据库路径解析优先级：`--db PATH` > `$METAVIEW_HISTORY_DB_PATH` >
`data/pipeline_runs.db`（与 `.env.example` 一致，相对仓库根解析）。

退出码：`0` 正常（含 schema 存在但 0 行的空库，输出全零指标）；
`2` 文件不存在 / 无 `pipeline_runs` 表 / 参数错误。

## 指标定义

指标定义与决策票 #236（warning 自动上修）及实现 #242 一致：

| 指标 | 定义 | 数据来源 |
|------|------|----------|
| run 总数与状态分布 | `PipelineRunStatus` 各值（queued/running/reviewing/succeeded/failed） | `pipeline_runs.status` |
| repairable 修复次数 | 每 run `quality:repair_attempt:N` 的最大序号分布 | `review_json` / `quality_report_json` 的 `actions` |
| warning 自动上修次数 | 出现 `quality:warning_repair_attempt:1` 的 run 数（每 run 至多 1 次，#242） | 同上 |
| reviewer 修复次数 | 每 run `reviewer:repair_attempt:N` 的最大序号分布 | 同上 |
| 附带：agent 自修复 | `agent:self_repair_attempt:N` 最大序号分布 | 同上 |
| 附带：legacy CIR 解析修复 | `repair_attempt_N`（旧 single 路径 CIR 解析修复） | 同上 |
| warning 码频率 | `quality_report_json.issues` 中 severity=warning 按码聚合（issue 数 + 影响 run 数） | `quality_report_json.issues` |
| provider 路径分布 | `quality_report_json.generator_path`（agent / skill_pack / generic_cir / capability_resolution）；缺失时回退 `actions` 的 `generator:*`；两者皆无记 `unknown` | 同上 |
| agent 模式 skill 命中 | `generator_path=agent` 的 run 中 `router:skill_id:*` 计数 | `actions` |
| 上修成功率 | 有 `quality:warning_repair_attempt:1` 的 run 中，最终质量报告**不再含同码 warning** 的比例（#242 语义：修后仍 warning 不失败 run） | 同上 |

上修成功率只统计 `_WARNING_REPAIR_ALLOWLIST`（当前仅
`timeline.voiceover_too_short`，即 #236 初始 allowlist）。allowlist 扩展时需同步
修改脚本顶部 `WARNING_REPAIR_ALLOWLIST` 与
`apps/api/app/application/use_cases/run_pipeline.py` 的
`_WARNING_REPAIR_ALLOWLIST`——这个指标正是扩展决策要看的数。

actions 统计对 `review_json` 与 `quality_report_json` 合并去重
（`quality_report.actions` 通常是超集，如 `quality:repair_exhausted` 只追加在报告上）。

## 数据说明

- 每个 run 的 `quality_report_json` 是**最终** gate 结果：修复中途的中间报告会被
  `_finalize_candidate` 覆盖，因此「修后仍含同码 warning」能可靠地从最终报告判断。
- 历史 run（quality_report_json 与 `generator:*` action 都不存在）在 provider
  路径中记为 `unknown`，修复/warning 指标自然为 0——它们早于这些信号的引入。
- `data/pipeline_observability.json` 是 `--out` 的推荐落点（`data/` 已 gitignore）。

## 示例输出（2026-07 数据快照）

```text
=== Agent pipeline run observability (#241) ===
Database: data/pipeline_runs.db  (97 runs)

Runs by status (PipelineRunStatus)
  failed       26
  reviewing    1
  succeeded    70

Provider paths (generator_path)
  unknown      51
  agent        31
  generic_cir  12
  skill_pack   3
  agent-mode router:skill_id hits
    calculus_core            4
    physics_mechanics        3
    chemistry_stoichiometry  1
    algorithm_graph_core     1

Repair statistics (max attempt sequence per run)
  canonical repairable repair (quality:repair_attempt:N): 0 attempts: 97
  warning auto-repair (quality:warning_repair_attempt:1): 0 runs
  reviewer repair (reviewer:repair_attempt:N): 0 attempts: 97
  agent self-repair (agent:self_repair_attempt:N): 0 attempts: 85; 1 attempts: 9; 2 attempts: 3
  legacy CIR parse repair (repair_attempt_N): 0 attempts: 83; 1 attempts: 10; 2 attempts: 4
  quality:repair_exhausted runs: 3
  quality:repair_unavailable runs: 7

Warning auto-repair success (#236/#242 allowlist)
  code                          attempted  cleared  still  success
  timeline.voiceover_too_short        0       0      0        -

Warning codes (quality_report issues, severity=warning)
  code                                      issues  runs
  timeline.voiceover_too_short                 15     3
  snapshot.narration_mismatch                   9     3
  step.too_shallow                              7     7

Runs with persisted quality report: 15
```

上表来自 #242 合并前（2026-07-17）的库快照，因此
`quality:warning_repair_attempt:1` 尚无样本（`attempted 0`）；agent 自修复与
legacy CIR 修复已有真实分布。新 run 产生后会自然进入同一份统计。

## 相关文档

- [`pipeline.md`](./pipeline.md) / [`quality-gate.md`](./quality-gate.md)：
  生成路径与 QualityReport 语义
- 决策 #236、实现 #242：warning 自动上修的边界条件与 allowlist 初值
