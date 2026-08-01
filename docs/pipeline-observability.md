# Pipeline 全链路可观测性

Status: Active

本页定义 pipeline run 的运行级时间、span 树、计数语义和诊断 SQL。它只描述和记录
现有执行，不参与路由、生成、reviewer、repair 或 quality gate 决策；遥测写入失败必须
保持 best-effort，不能改变候选内容、run 状态或重试行为。

## 1. 两层存储

### `pipeline_runs` 运行级字段

| 字段 | 含义 |
|---|---|
| `started_at` | pipeline use case 开始执行的 UTC 时间；不同于提交时的 `created_at` |
| `finished_at` | pipeline use case 结束的 UTC 时间 |
| `generator_path` | 最终落库的 `QualityReport.generator_path`；反映 fallback 后的真实路径 |
| `total_duration_ms` | use case 从开始到结束的单调时钟耗时 |

`generator_path` 当前可能为 `agent`、`generic_cir`、`skill_pack` 或
`capability_resolution`。它不是配置意图：例如部署配置为 agent，不代表某个 run 的最终值
一定是 `agent`。

### `pipeline_run_spans` 阶段字段

| 字段 | 含义 |
|---|---|
| `span_id` | span 主键 |
| `run_id` | 所属 run |
| `parent_span_id` | 父 span；`pipeline.total` 为 `NULL` |
| `stage` | 规范 stage 名；见下一节 |
| `attempt_index` | 同一父节点、同一 stage 下从 0 开始的兄弟尝试序号 |
| `status` | `running`、`ok`、`error`、`timeout` 或 `skipped` |
| `started_at` / `finished_at` | UTC 开始/结束时刻；执行中 `finished_at` 为 `NULL` |
| `duration_ms` | 单调时钟或 sidecar 自报耗时；执行中为 `NULL` |
| `provider` / `model` | 实际 provider/model；确定性阶段为 `NULL` |
| `input_tokens` / `output_tokens` | provider 或 pi runtime 原样暴露的 token 语义 |
| `cache_read_tokens` / `cache_write_tokens` | provider 报告的 cache read/write；未报告为 `NULL` |
| `model_turns` | 该 span 内实际 assistant model requests 数 |
| `tool_batches` | 携带至少一个 tool call 的 assistant messages 数 |
| `tool_calls` | 实际执行的单个工具调用数；不能当作模型往返数 |
| `error_code` | 稳定的低基数错误码；无错误为 `NULL` |
| `metadata_json` | 低基数诊断字段，例如 reason、issue codes、self-check 状态、按名工具计数 |

计数字段缺失时必须保持 SQL `NULL`。`NULL` 表示“未测量/上游未报告”，0 表示“已经测量且
确实为零”，两者不能互换。由 API `async with` 包裹的阶段会先把
`status='running'`、再把终态写入同一个 per-run FIFO writer；退出时按同一 `span_id` 覆盖。
正常 timeout 会在终态暴露前做一次有界 flush，因此已开始的子阶段保留 running 停点。
若 writer 自身失败或阻塞，flush 到期后会丢弃剩余 telemetry，run 仍按原生成结果结束；直接
杀死进程也可能丢失尚未真正写入 SQLite 的队列项，不能把 best-effort telemetry 当事务日志。
sidecar 的已完成 attempt 和显式 skipped 阶段由 `record_completed` 事后回填；sidecar timeout
则通过 `agent.attempt.started` 回填当时仍在执行的 running attempt 及已观测 counters/usage。

span 只允许记录低基数元数据，不记录完整 prompt、Playbook、tool arguments、API key、
shared token 或其他密钥。run 表本来就保存用户 prompt；这不授权把它复制进 span。

## 2. 规范 stage

| Stage | 边界与典型父节点 |
|---|---|
| `pipeline.total` | 整个 use case；树根 |
| `router` | topic/skill route 决策；父为 `pipeline.total` |
| `coverage_resolution` | capability/coverage 决策；父为 `pipeline.total` |
| `lesson_plan` | renderer-independent lesson plan；父为 `pipeline.total` |
| `skill_pack` | 确定性 SkillPack 尝试或明确 skipped；父为 `pipeline.total` |
| `generation.single` | 一次 legacy single LLM generation；父为 total 或 repair span |
| `generation.agent_provider` | API 对 AgentProvider 的一次调用，包含 HTTP 等外层开销 |
| `agent.sidecar` | sidecar 自报的一次 `/generate` 总体边界；父为 agent provider |
| `agent.attempt` | sidecar 内一次 pi-agent-core attempt；父为同一 sidecar |
| `reviewer` | 一次 reviewer model request；父为 total 或 repair span |
| `quality_gate` | 一次确定性 canonical quality decision；initial/post-repair gate 都是 total 下的兄弟 attempt |
| `quality_repair` | canonical repair 容器；Agent 包住 provider/reviewer，single 当前只包住 regeneration provider call |
| `finalize` | 持久化最终 Playbook、Director 与 terminal outcome |

父子关系通过当前 asyncio context 隐式继承。重试必须是同父、同 stage 的兄弟 span，
`attempt_index` 依次递增；不能把 API 外层 self-repair、sidecar 内层 self-repair、reviewer
repair 和 canonical repair 压成一个无来源的 `attempts=N`。

下面是 Agent canonical repair 的父子示例；post-repair gate 显式复用 initial gate 的父节点，
因此两个 gate 可直接按 `attempt_index=0/1` 比较。single 的 post-repair gate 同样是 total 子节点：

```text
pipeline.total
├─ generation.agent_provider #0       API 外层第一次调用
│  └─ agent.sidecar #0
│     ├─ agent.attempt #0              sidecar 内层第一次尝试
│     └─ agent.attempt #1              sidecar 内层 self-repair
├─ generation.agent_provider #1       API 外层 self/reviewer repair
│  └─ agent.sidecar #0
│     └─ agent.attempt #0
├─ reviewer #0
├─ reviewer #1
├─ quality_gate #0                    initial canonical decision
├─ quality_repair #0
│  ├─ generation.agent_provider #0
│  └─ reviewer #0
└─ quality_gate #1                    post-repair canonical decision
```

不同父节点下的 `attempt_index` 独立计数。因此 `quality_repair` 内的 provider 可以是 `#0`，
即使 total 下已经存在 provider `#0/#1`；查询重试时必须同时看 `parent_span_id`。

pipeline 根 span 入队后，use case 先有界 flush、再写 `finished_at`，最后才提交
`succeeded/failed`，所以正常轮询不会先看到 terminal status 再读到一棵未收口的树。外部
task cancellation 不等同于 pipeline timeout：它保留 root/已开始子 span 的 running 行，
不写 `pipeline_runs.finished_at`，并继续向调用方抛出 `CancelledError`。

## 3. Token 与请求计数语义

- Single 的 `generation.single.input_tokens` 是 OpenAI-compatible provider 报告的
  prompt token 总量；`cache_read_tokens` 是其中的命中子集，不要从 input 再减一次。
- Agent 的 `agent.attempt` 原样保存当前 pi runtime 暴露的 `usage.input/cacheRead/cacheWrite`。
  当前 pi OpenAI-completions adapter 的 `input` 已排除 cache read/write；不要在采集层重定义。
- run 级 token、model turns 和 tool counts 只聚合 generation leaves：
  `generation.single` 与 `agent.attempt`。`agent.sidecar` 的 usage 是诊断副本，不能再次累加。
- `generation.agent_provider` 表示 API 调 sidecar 的次数；`agent.attempt` 表示 sidecar 内层
  attempts；`reviewer` 和 `quality_repair` 各自单独计数。
- `model_turns` 才是模型请求数。一个 turn 可以有多个并行 tool calls，因此
  `tool_calls > model_turns` 完全合法。

详情接口 `GET /api/v1/runs/{run_id}` 返回派生的 `telemetry` summary。提交响应和 runs 列表
刻意排除该容器，避免在列表页重复计算整棵树。

## 4. 派生指标

`RunTelemetrySummary` 从 run 行和 span 树读取以下指标，不额外存派生列：

| 指标 | 计算方式 |
|---|---|
| `started_at` / `finished_at` | `pipeline_runs` 对应 UTC 字段 |
| `generator_path` | `pipeline_runs.generator_path` |
| `total_duration_ms` | `pipeline_runs.total_duration_ms` |
| `input/output/cache_*_tokens` | 完整聚合 generation leaves；任一 leaf 未报告时保持 `NULL` |
| `generation_model_turns` | generation leaves 的 `model_turns` |
| `tool_batches` / `tool_calls` | generation leaves 的对应计数 |
| `single_model_requests` | `generation.single` span 数 |
| `agent_provider_calls` | `generation.agent_provider` span 数 |
| `agent_attempts` | `agent.attempt` span 数 |
| `reviewer_calls` | `reviewer` span 数 |
| `quality_repair_calls` | `quality_repair` span 数 |
| `time_to_first_committed_step_ms` | run start 到所有 attempts 中最早成功 `commit_step` 的绝对时刻 |
| `time_to_first_quality_decision_ms` | run start 到首个 quality gate 结束 |
| `time_to_first_valid_candidate_ms` | run start 到首个 `clean/warnings` quality gate 结束 |
| `time_to_final_result_ms` | `pipeline_runs.total_duration_ms` |

第二次 sidecar attempt 才 commit 时，首个 commit 的绝对时间仍从整个 run 开始计算，不会把
第一次失败尝试的耗时抹掉。

summary 和 eval 不发布 `total_model_requests`：当前 router LLM 还没有完整的 request/usage
计量，拼出一个“已知部分之和”会被误读为全链路总数。`generation_model_turns` 明确只统计
`generation.single`/`agent.attempt`；provider、attempt、reviewer 和 quality repair 的调用层数
分别使用对应 `*_calls` 字段。需要跨层调查时用下一节 SQL，同时保留未测量层为 `NULL`。

## 5. 八个诊断问题与 SQL

以下 SQL 直接用于 SQLite，把 `<run_id>` 替换成目标 run。

### 5.1 慢在哪个阶段？

```sql
SELECT stage, attempt_index, status, duration_ms, parent_span_id
FROM pipeline_run_spans
WHERE run_id = '<run_id>'
ORDER BY duration_ms IS NULL, duration_ms DESC, started_at;
```

上表展示 inclusive boundary，因此父子耗时会重叠。若要近似比较叶子工作，排除当前四个
已知容器：

```sql
SELECT stage, attempt_index, duration_ms
FROM pipeline_run_spans
WHERE run_id = '<run_id>'
  AND stage NOT IN (
    'pipeline.total',
    'quality_repair',
    'generation.agent_provider',
    'agent.sidecar'
  )
ORDER BY duration_ms IS NULL, duration_ms DESC;
```

### 5.2 实际走了哪条生成路径，发生过什么 fallback/repair？

```sql
SELECT
  r.generator_path AS actual_generator_path,
  s.stage,
  s.attempt_index,
  s.status,
  json_extract(s.metadata_json, '$.reason') AS reason,
  json_extract(s.metadata_json, '$.repair_reason') AS repair_reason,
  json_extract(s.metadata_json, '$.skipped') AS skipped_reason
FROM pipeline_runs AS r
LEFT JOIN pipeline_run_spans AS s
  ON s.run_id = r.run_id
 AND s.stage IN (
   'router', 'coverage_resolution', 'skill_pack',
   'generation.single', 'generation.agent_provider', 'quality_repair'
 )
WHERE r.run_id = '<run_id>'
ORDER BY s.started_at;
```

以 `actual_generator_path` 判最终路径，以 stage metadata 判触发原因；不要从部署配置反推。

### 5.3 各已计量层发了多少模型请求，哪层仍未知？

```sql
WITH model_leaves AS (
  SELECT stage, model_turns
  FROM pipeline_run_spans
  WHERE run_id = '<run_id>'
    AND (
      stage IN ('generation.single', 'agent.attempt', 'reviewer')
      OR (
        stage = 'router'
        AND json_type(metadata_json, '$.router_llm') IS NOT NULL
      )
    )
)
SELECT
  stage,
  CASE
    WHEN SUM(model_turns IS NULL) = 0 THEN SUM(model_turns)
    ELSE NULL
  END AS measured_model_requests,
  SUM(model_turns IS NULL) AS unmeasured_spans
FROM model_leaves
GROUP BY stage
ORDER BY stage;
```

不要把这些行相加后命名为全链路 total：router LLM 当前会显示为未测量。Agent API HTTP
次数另查 `generation.agent_provider` span 数，不能和 sidecar model turns 混为一谈。

### 5.4 每轮一个工具，还是一轮一批工具？

```sql
SELECT
  attempt_index,
  status,
  model_turns,
  tool_batches,
  tool_calls,
  ROUND(1.0 * tool_calls / NULLIF(model_turns, 0), 2) AS calls_per_model_turn,
  json_extract(metadata_json, '$.tool_calls_by_name') AS calls_by_name
FROM pipeline_run_spans
WHERE run_id = '<run_id>'
  AND stage = 'agent.attempt'
ORDER BY parent_span_id, attempt_index;
```

### 5.5 哪一层重试，为什么重试？

```sql
WITH retry_groups AS (
  SELECT run_id, stage, parent_span_id
  FROM pipeline_run_spans
  WHERE run_id = '<run_id>'
  GROUP BY run_id, stage, parent_span_id
  HAVING COUNT(*) > 1 OR MAX(attempt_index) > 0
)
SELECT
  s.stage,
  s.parent_span_id,
  s.attempt_index,
  s.status,
  s.error_code,
  COALESCE(
    json_extract(s.metadata_json, '$.reason'),
    json_extract(s.metadata_json, '$.repair_reason')
  ) AS reason,
  COALESCE(
    json_extract(s.metadata_json, '$.issue_codes'),
    json_extract(s.metadata_json, '$.self_check_issue_codes'),
    json_extract(s.metadata_json, '$.quality_issue_codes')
  ) AS issue_codes
FROM pipeline_run_spans AS s
JOIN retry_groups AS g
  ON g.run_id = s.run_id
 AND g.stage = s.stage
 AND g.parent_span_id IS s.parent_span_id
ORDER BY s.started_at, s.attempt_index;
```

### 5.6 Prompt Cache 是否命中、读写了多少？

Single 和当前 pi adapter 的 input 口径不同，先归一为 prompt 总量再计算占比：

```sql
WITH generation_leaves AS (
  SELECT
    stage,
    attempt_index,
    input_tokens,
    output_tokens,
    cache_read_tokens,
    cache_write_tokens,
    CASE
      WHEN stage = 'generation.single' THEN input_tokens
      WHEN stage = 'agent.attempt' THEN
        input_tokens + cache_read_tokens + cache_write_tokens
    END AS normalized_prompt_tokens
  FROM pipeline_run_spans
  WHERE run_id = '<run_id>'
    AND stage IN ('generation.single', 'agent.attempt')
)
SELECT
  *,
  ROUND(
    100.0 * cache_read_tokens / NULLIF(normalized_prompt_tokens, 0),
    2
  ) AS cache_read_percent
FROM generation_leaves
ORDER BY stage, attempt_index;
```

cache 字段为 `NULL` 表示 provider 没有报告，不能解释为“缓存未命中”；只有 0 才表示已测量
且未读/未写缓存。

### 5.7 首个提交步骤、首个有效候选、最终结果分别多快？

```sql
WITH run AS (
  SELECT started_at, total_duration_ms
  FROM pipeline_runs
  WHERE run_id = '<run_id>'
), markers AS (
  SELECT
    MIN(json_extract(metadata_json, '$.first_committed_step_at'))
      AS first_committed_at,
    MIN(CASE
      WHEN stage = 'quality_gate'
       AND json_extract(metadata_json, '$.quality_status') IN ('clean', 'warnings')
      THEN finished_at
    END) AS first_valid_candidate_at
  FROM pipeline_run_spans
  WHERE run_id = '<run_id>'
)
SELECT
  ROUND(
    (julianday(markers.first_committed_at) - julianday(run.started_at)) * 86400000
  ) AS time_to_first_committed_step_ms,
  ROUND(
    (julianday(markers.first_valid_candidate_at) - julianday(run.started_at)) * 86400000
  ) AS time_to_first_valid_candidate_ms,
  run.total_duration_ms AS time_to_final_result_ms
FROM run CROSS JOIN markers;
```

### 5.8 当前卡住、超时或失败在哪？

```sql
SELECT
  stage,
  attempt_index,
  status,
  error_code,
  started_at,
  finished_at,
  COALESCE(
    duration_ms,
    ROUND((julianday('now') - julianday(started_at)) * 86400000)
  ) AS observed_ms
FROM pipeline_run_spans
WHERE run_id = '<run_id>'
  AND status IN ('running', 'error', 'timeout')
ORDER BY started_at DESC;
```

如果进程被直接杀死，最后一个 `running` span 不会被自动改成 timeout；它正是 crash 后要
检查的停点。

## 6. Process E2E 的完整 mock span 树

以下结果来自 `verify_observability_e2e.py`：API 和 sidecar 都是真实子进程，只有模型端是
本地 OpenAI-compatible JSON/SSE fixture，不使用外部额度。时间会随机器变化。

```text
single: generator_path=generic_cir, total=88ms
pipeline.total                    #0 ok       85ms
├─ router                         #0 ok        0ms  skipped=generic override
├─ coverage_resolution            #0 ok        8ms  mode=composable
├─ lesson_plan                    #0 ok        0ms  scene_count=4
├─ skill_pack                     #0 skipped   0ms  reason=no_specialized_route
├─ generation.single              #0 ok       60ms  turns=1 input=120 output=30 cache=80/10
├─ quality_gate                   #0 ok        1ms  quality=warnings
└─ finalize                       #0 ok       10ms

agent: generator_path=agent, total=312ms
pipeline.total                    #0 ok      310ms
├─ router                         #0 ok        0ms  skipped=generic override
├─ coverage_resolution            #0 ok       11ms  mode=composable
├─ lesson_plan                    #0 ok        0ms  scene_count=4
├─ skill_pack                     #0 skipped   0ms  reason=no_specialized_result
├─ generation.agent_provider      #0 ok      203ms  provider=pi reason=initial
│  └─ agent.sidecar               #0 ok      156ms  input=440 output=120 cache=320/40
│     ├─ agent.attempt            #0 error   110ms  turns=2 batches=2 calls=2
│     │                                      self_check=blocked code=step.too_shallow
│     └─ agent.attempt            #1 ok       45ms  turns=2 batches=2 calls=3
│                                            committed_steps=1 first_commit=+118ms sidecar
├─ quality_gate                   #0 ok        2ms  quality=clean
└─ finalize                       #0 ok        2ms
```

Agent fixture 故意让 attempt 0 产出过浅候选，再由 attempt 1 self-repair；attempt 1 的第一个
model turn 同时执行 `begin_step` 与 `commit_step`，因此整条路径是 4 model turns、4 tool
batches、5 tool calls。这一例直接证明 tool calls 不能替代模型请求数。

运行命令：

```bash
.venv/bin/python apps/api/scripts/verify_observability_e2e.py
```

脚本会先 build Agent，随后启动真实 Uvicorn、真实 Node sidecar 和本地 fake model server，
验证 single/agent 两条路径、token/cache 语义、attempt 父子关系、首个 commit 以及 span
metadata 隐私。报告写到已忽略的
`eval/reports/observability-process-e2e.json`；可用 `--report <path>` 改位置。
