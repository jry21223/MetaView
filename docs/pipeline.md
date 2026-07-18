# 渲染管线

> 唯一渲染出口：**PlaybookScript → Remotion Player / Export**
> 主生成方向是统一 **AgentPipeline → RuntimeToolHub → Agent Provider → PlaybookScript**。
> `single mode` 仍保留为 legacy fallback：**LLM → CIR + ExecutionMap → PlaybookScript**。
> 项目仍不引入 Manim、HTML iframe 或服务端 HTML 视频渲染；前端通过 Remotion 帧驱动渲染。

路由完成后，后端先形成并持久化 `CoverageDecision`，再让三条路径共享同一份
renderer-independent `LessonPlan`：

```text
Router
  -> CoverageResolver
  -> persist CoverageDecision
  -> RuleBasedLessonPlanner
  -> persist LessonPlan
  -> SkillExecutionContext | AgentRequest | legacy CIR prompt
  -> PlaybookScript
```

Agent 的模型可见生成指引使用中文，工具名、Schema 字段、snapshot kind、semantic role、错误代码和 API 字段名保持原有技术标识符。步骤数量由教学内容决定：通常为 4–8 步，实际允许 3–12 步。只有知识状态、主要视觉对象或关系、教学目标，或需要观察的中间结论发生实质变化时才新增步骤；不得用空泛开场、重复解释或无新信息总结填充数量。

旁白不再要求每步固定三句话。通常使用 1–2 句或 1–2 个自然字幕片段，与当前画面同步，并只补充画面无法直接表达的信息；标题、公式、标签、当前变量值、队列顺序和图中可见状态不应被逐字复述。

正常 Web Intake 不预判 Router 结果。`usePipelineSubmit` 对所有应用内提交写入
`domain: null`；纯文本同时写入 `source_code: null`、`language: null`、
`source_filename: null` 与 `source_size_bytes: null`。因此一条普通数学或物理 prompt
不会携带虚假的 Python 信号。`PipelineRequest.language` 是 nullable，null 会原样进入
`SkillRouteInput`、CoverageResolver 和 Agent/legacy 上下文。API 仍保留显式 domain
字段，供基准和内部兼容调用使用。

LessonPlan 只记录教学目标、误区、结论、教学弧线和 SceneIntent，不包含 frame、坐标、
asset、layer 或 renderer 私有字段。最终候选还会由后端检查已注册的 required facts、
visual roles、preferred scene type 和精确结论；缺失证据会触发 repair 或阻断。
详见 [`lesson-plan.md`](./lesson-plan.md)。

CoverageResolver 会验证真实 Skill manifest、ProblemSpec、domain、置信度、RuntimeToolHub
manifest 和 SceneBlueprint scene type；它不会把 TopicRoute 的 `specialized` prompt 标签直接
当成 Skill 覆盖。`unsupported` 与当前尚无安全降级输出面的 `experimental` 都会在
LessonPlan/provider 之前 fail closed；`composable` 只覆盖四个精确受控模板。详见
[`coverage-and-fallback.md`](./coverage-and-fallback.md)。

## 0. 当前成功语义与契约同步

SkillPack、Agent、legacy single 三条生成路径在写入 `succeeded` 前都会调用 API 侧
`quality_gate_playbook(...)`。候选结果按以下状态处理：

```text
candidate PlaybookScript
  -> Canonical QualityReport
  -> clean / warnings: persist DirectorScript, then succeed
  -> repairable: one path-appropriate repair attempt
  -> blocked or repair exhausted: fail closed
```

`QualityReport` 独立持久化在 `pipeline_runs.quality_report_json`，运行历史只读展示后端
结果，前端 `visualQualityGate` 不再决定 pipeline 是否成功。空步骤、无效 timeline、空
narration/payload、renderer contract、missing asset、学科 fallback、数学视觉不足、算法
状态不足、递归/平抛最低语义场景、final answer 等规则由后端裁决。Director 持久化失败
同样会形成 blocking issue，不能继续宣称完整成功。

snapshot kind 的 canonical source 是 API `SnapshotKind` 判别联合。合同测试同时核对
Pydantic `AnySnapshot` discriminator、Agent self-check allow-list、Web `SnapshotKind` union
与 renderer registry，并检查共享 issue 的 severity 语义。`call_stack_scene` 与
`code_trace_scene` 均在该合同内。

详见 [`quality-gate.md`](./quality-gate.md)。

## 1. Legacy single generation path: LLM 输出契约

`METAVIEW_GENERATION_MODE=single` 时，LLM 必须输出**单一 JSON 对象**，包含两层：

生成前，后端会把已持久化的 canonical CoverageDecision 和 LessonPlan 注入 system prompt。
CIR 可以把一个
SceneIntent 展开为多个步骤，但必须保持教学目标、所需事实、视觉角色和预期结论。

```jsonc
{
  "cir": {                    // 描述层（讲什么）
    "version": "0.1.0",
    "title": "...",
    "domain": "algorithm | math | code | physics | chemistry | biology | geography",
    "summary": "...",
    "steps": [
      {
        "id": "step_01",
        "title": "...",
        "narration": [...],   // 见第 3 节：模板数组（不是字符串）
        "visual_kind": "array | graph | function",
        "tokens": [{ "id": "t0", "label": "5", "emphasis": "primary" }],
        "plot": {             // 仅当 visual_kind="function"（数学函数图），见第 6 节
          "curves": [{ "expression": "x^2 - 2*x", "label": "f(x)", "emphasis": "primary" }],
          "x_min": -6, "x_max": 6,
          "marker_x": null, "shade_from": null, "shade_to": null,
          "formula_latex": "f(x) = x^2 - 2x"
        },
        "annotations": []
      }
    ]
  },
  "execution_map": {          // 执行层（什么时候、对哪行代码）
    "duration_s": 18.0,
    "checkpoints": [
      {
        "id": "cp_01",
        "step_index": 0,
        "step_id": "step_01",      // 必须匹配 cir.steps[].id
        "visual_kind": "array",
        "title": "...",
        "summary": "...",
        "start_s": 0.0,
        "end_s": 3.0,
        "code_lines": [0, 1],      // 0-indexed 源码行（可选）
        "focus_tokens": ["t0"],
        "array_focus_indices": [0, 1],
        "array_reference_indices": []
      }
    ]
  }
}
```

### 强约束
- `cir.steps` 长度允许 **3–12**，通常使用 **4–8** 步，并与 `execution_map.checkpoints`
  **一一对应**（共享 `step_id`）。不得为了固定数量拆分没有新知识状态或主要视觉状态的步骤。
- narration 必须非空、与当前画面同步，并只补充画面无法直接表达的信息。通常使用 1–2 句自然旁白；不要求固定句数，也不要求套用固定问答顺序。
- `duration_s` 推荐 ~4–5s/step（10 步 → 45s；12 步 → 54s），关键讲解步可分配更多时间，
  过渡步可以更短，但所有 checkpoint 区间长度之和必须等于 `duration_s`。
- `checkpoint.start_s/end_s` 必须不重叠地分割 `[0, duration_s]`。
- `code_lines` 仅在用户提供 `source_code` 时有意义，否则可全部为 `[]`。
- `narration` 必须是 JSON 数组（不是裸字符串），见第 3 节。

> 这些规则写在 `cir_prompt.py` 的 system prompt 中；触发 reviewer 复检的失败原因会
> 通过 `RunPipelineUseCase._regenerate` 反馈给 LLM 再来一遍（最多 `METAVIEW_MAX_REPAIR_ATTEMPTS` 次）。

### 兼容旧契约
`run_pipeline._parse_combined_output` 也接受裸 `CirDocument`（无 `cir`/`execution_map` 包装）。
此时 `execution_map=None`，使用固定 60 帧/步、无代码高亮。Mock provider 走这条路径。

## 2. 源码追踪

当 `IntakeContext.sourceCode` 存在时：

1. 前端从扩展名映射真实 `language`，并记录 `sourceFilename` 与
   `sourceSizeBytes`；仅接受一个不超过 256 KB 的代码文件。
2. `usePipelineSubmit` 把四项证据映射为 `source_code + language +
   source_filename + source_size_bytes`，仍保持 `domain: null`。
3. `build_cir_prompt` 在 system prompt 里以行号方式嵌入源码（`_number_source`，0-indexed）。
4. LLM 在每个 checkpoint 的 `code_lines` 填入相关行号。
5. `playbook_builder._build_code_highlight` 过滤越界行号，构造 `CodeHighlightOverlay`。

后端拒绝没有 `source_code` 却携带语言/文件元数据的请求，也拒绝超过 256 KB 的
源码或声明字节数。若非 Web 调用方提供源码但没有语言，Router prompt 与 CIR prompt
使用 `unknown`，Playbook 的展示降级语言使用 `text`；任何路径都不得默认为 Python。

`CodeHighlightOverlay` 是与视觉 snapshot 并行的工作台轨道。BFS 与递归的
Agent 结果缺少该轨道时，后端会从 canonical 算法代码和结构化状态确定性补齐；
Web 只在右侧 Code Sync 面板展示，主舞台与 Remotion 导出显式关闭 inline code。

**幻觉防御**：超出源码行数范围的 `code_lines` 索引会被静默丢弃，全部越界则该步骤无 highlight。

## 3. Narration 模板

`cir_step.narration` 支持三种格式（按优先级）：

| 输入 | 处理 |
|------|------|
| `list`（直接 JSON 数组） | 用作 `narration_template` |
| `str` 以 `[` 开头 | `json.loads` 后用作模板 |
| `str` 含 `{{token_id}}` | 转换为简化模板 |
| 普通 `str` | 模板为 `None`，`voiceover_text` 用原文 |

### 模板片段
- `"literal"` —— 字面文本
- `{"t":"tokenId"}` —— 替换为 token 的 `label`
- 嵌套数组 = 条件分支：`[ [["条件"], ["分支体"]], ..., [{}, ["默认"]] ]`

`voiceover_text`（给 TTS）由 `_resolve_plain_text` 把模板压平成纯文本：
- token 引用替换为 label
- 条件分支取**首个非空分支**（不真正求值条件，仅作降级文本）

## 4. 时间轴

```
fps = 30 (默认)
end_frame_i = round((checkpoint_i.end_s) * fps)        # 有 execution_map
end_frame_i = (i+1) * 60                               # 无 execution_map（兼容路径）
```

`PlaybookScript.total_frames = max(累计帧数, 1)`。

## 5. Snapshot 类型 → 渲染器

`playbook_builder._build_snapshot` 按 `visual_kind` 选择 snapshot 判别联合的一支；
前端 `engine/renderers/registry.ts` 按 `snapshot.kind` 派发渲染器（Remotion 导出走同一注册表）。

| `visual_kind` | snapshot `kind` | 渲染器 |
|---|---|---|
| `array`（元素全为数值） | `algorithm_bars` | `BarBlockRenderer` |
| `array`（含非数值） | `algorithm_array` | `AlgorithmRenderer` |
| `graph` | `algorithm_tree` | `BinaryTreeRenderer` |
| `function`（有合法 `plot`） | `math_plot` | `MathPlotRenderer` |
| `function`（无 `plot` / 表达式全部非法） | 降级为 `array` | 同上 |

## 6. Math 函数图（`visual_kind="function"`）

数学学科可以让 LLM 直接输出**坐标系上的曲线**而不是逐项 token。此时步骤填 `plot` 对象：

- `curves[]` —— 每条曲线一个表达式（变量 `x` + 命名参数），如 `"x^2 - 2*x"`、`"sin(x)"`、`"0.5*exp(-x^2)"`。
  `emphasis`：`primary` 焦点曲线 / `secondary` 衬托（虚线，如原函数 vs 导数）/ `accent` 结果曲线。
- `x_min` / `x_max` —— 可见定义域；`y_min` / `y_max` 可选（缺省自动拟合，按 2/98 分位裁掉渐近线毛刺）。
- `marker_x` —— 第一条曲线上要高亮的点的 x（如求导处）；会画竖虚线 + 坐标读数。
- `shade_from` / `shade_to` —— 第一条曲线下的阴影区间（定积分 / 黎曼和场景）。
- `formula_latex` —— 可选 KaTeX 标签，如 `"f(x) = x^2 - 2x"`。

**采样在前端做**：snapshot 只携带表达式字符串，`MathPlotRenderer` 用 `shared/lib/mathExpr`（纯函数、无 `eval`）解析+采样，并按步骤 `progress` 把曲线“画出来”，遇到 NaN（如 `1/x` 在 0 处）断开线段。

**幻觉/注入防御**：`playbook_builder._sanitize_expression` 用白名单字符 `[0-9A-Za-z_+\-*/^%(). ,]` 过滤每个 `expression`，越界的 `marker_x` / `shade_*` 会被夹到定义域内；若没有任何合法曲线，整步降级为 `array` 视图（绝不渲染空白）。

> 交互版同源能力见 `apps/web/src/features/param-widget/`（顶栏「📐 数学画板」）：内置预设 + 参数滑块 + 实时 KaTeX 公式 + `ParamPlot`，与渲染器共用 `mathExpr` / `plotMath`。

## 7. LLM 思考时长 / 长度调参

`OpenAIProvider`（`apps/api/app/infrastructure/llm/openai_provider.py`）在 `chat/completions`
请求体里**条件**写入两个可选字段：

| 字段 | 来源 env 变量 | 默认 | 备注 |
|------|------|------|------|
| `max_tokens` | `METAVIEW_OPENAI_MAX_TOKENS` | `16000` | 太小会被截断；DeepSeek/vLLM/Ollama 都支持，可降到 8000 |
| `reasoning_effort` | `METAVIEW_OPENAI_REASONING_EFFORT` | 未设 | 仅 OpenAI gpt-5 / o-series；允许值 `minimal / low / medium / high`，留空就不发字段 |

未启用 reasoning_effort 的服务商（OpenRouter 上的 Anthropic / DeepSeek / 大多数本地推理）
会忽略缺省字段，无 400 风险。需要让模型「想更久」时同时把这两个调大即可，不需要改代码。

## 8. 视频导出（Remotion 渲染管线）

入口 `POST /api/v1/exports` →
`ExportVideoUseCase`（`apps/api/app/application/use_cases/export_video.py`）：

当前稳定性边界：

- runtime player TTS 支持交互播放，播放器可在浏览器里朗读并按步骤暂停/继续。
- `with_audio` 导出会尝试合成音频并按音频时长拉伸步骤，但除非对应 provider、时长探测和对齐路径已有测试覆盖，否则属于 beta。
- 无音轨导出是稳定路径；当音频时序无法保证时，保持 silent export。

1. 从 `IRunRepository` 取该 run 的 `PlaybookScript`，序列化为 `inputProps.json`。
   开始渲染前会重新执行 canonical export-readiness gate；Director 读取失败、资产失效或
   其他 blocking issue 会让 export job 失败。导出主题由当前 preview 的 light/dark
   选项随请求传入，`showDiagnostics` 在 export composition 中始终为 `false`。
2. （可选 `with_audio`）调 TTS 代理 `POST {tts_base_url}/audio/speech` 逐步合成 mp3，
   再用 `ffprobe`（缺失时回退到 wave / 动画时长）测每段时长，按 `fps` 重新拉伸
   `step.end_frame` 让动画 ≥ 配音长度。
3. spawn 子进程：

   ```
   npx --yes remotion render \
       src/remotion/index.ts playbook <output> \
       --props <inputProps.json> --codec h264|vp8|gif \
       --width <W> --height <H> --frames-per-second <FPS>
   ```

   工作目录是 `apps/web/`（由 `METAVIEW_EXPORT_WEB_APP_DIR` 控制，默认相对仓库根）。
   stdout/stderr 解析 `progress%` / `M/N frames`，按比例更新 ExportJob 进度（0.15 → 0.95）。
4. 成功后把 `output_path` 写回 `IExportJobRepository`，前端通过
   `GET /api/v1/exports/{job_id}/download` 拉取。

| Method | Path | 说明 |
|--------|------|------|
| `POST` | `/exports` | 提交导出任务（202） |
| `GET`  | `/exports/{job_id}` | 进度 + 状态 + `error` |
| `GET`  | `/exports/{job_id}/download` | 下载 mp4 / webm / gif |

### 失败诊断
渲染失败时 `ExportJob.error` 会带最后 ~40 行 Remotion 子进程输出（包含 stack trace）。
常见雷：
- `apps/web/node_modules` 缺包或 `@remotion/cli`/`renderer` 版本错位 → 重装：
  `rm -rf node_modules apps/web/node_modules && npm install`（仓库走 npm workspaces）。
- 首次跑会拉 Chrome Headless Shell（约 80–150 MB），国内网络可能超时——重跑通常自愈。
- `ffprobe` 缺失只影响 `with_audio` 的时长对齐，单纯导出无音轨不受影响。

## 9. 关键文件

| 文件 | 职责 |
|------|------|
| `apps/api/app/domain/services/cir_prompt.py` | 组合 prompt + JSON schema 描述（含 math `function` 指引） |
| `apps/api/app/application/use_cases/run_pipeline.py` | LLM 调用、解析、降级 |
| `apps/api/app/domain/services/playbook_builder.py` | CIR + ExecutionMap → PlaybookScript（含 `_build_math_plot_snapshot`） |
| `apps/api/app/domain/models/cir.py` | Pydantic 契约（`PlotSpec` / `PlotCurveSpec`） |
| `apps/api/app/domain/models/playbook.py` | 输出端契约（`MathPlotSnapshot` 等，前端消费） |
| `apps/web/src/shared/lib/mathExpr.ts` | 无依赖表达式解析/求值/采样（渲染器 + 画板共用） |
| `apps/web/src/features/playbook/engine/renderers/MathPlotRenderer.tsx` | 函数图渲染器 |
| `apps/web/src/features/param-widget/` | 交互参数面板（预设 + 滑块 + KaTeX） |
| `apps/web/src/features/playbook/engine/player/PlaybookPlayer.tsx` | Remotion 入口 |
| `apps/api/app/infrastructure/llm/openai_provider.py` | OpenAI 兼容 HTTP 客户端（`max_tokens` / `reasoning_effort`） |
| `apps/api/app/application/use_cases/export_video.py` | Remotion CLI subprocess + TTS 配音对齐 + stderr 回传 |
| `apps/api/app/presentation/router_exports.py` | `/exports` 路由（提交 / 状态 / 下载） |
| `apps/web/src/remotion/Root.tsx` & `PlaybookExportComposition.tsx` | Remotion `Composition`，导出时与播放器共用 `renderers/registry` |

## Agent generation path

Agent mode 是一等质量编排路径，不是备用渲染器。它用
[pi-agent-core](https://github.com/earendil-works/pi) 做 agent runtime，通过细粒度
**Drawing CLI** 工具一步步建出最终 PlaybookScript。

合并或推广 agent mode 前，先按
[`docs/agent-demo-acceptance.md`](agent-demo-acceptance.md) 跑 demo suite，
确认核心 case 的 generation path、PlaybookScript contract score 和可选无音轨导出结果。

Agent mode 不绕过规范化的 PlaybookScript 契约。它可以跳过 CIR parsing 和
`playbook_builder`，但必须返回 schema-valid `PlaybookScript`，并且仍然走同一个
**PlaybookScript → Remotion Player / Export** 渲染出口。

Required gates:

- agent self-check before finalization;
- PlaybookScript schema validation in API;
- third-party reviewer verdict;
- renderer compatibility gate;
- persisted review report.

`third-party reviewer` 指生成 agent 之外的 reviewer verdict，例如独立 reviewer LLM 或
`docs/generation-review-workflow.md` 的人工/自动复检流程。`renderer compatibility gate`
必须检查所有 step 和 layer 的 `snapshot.kind` 都能通过前端 renderer registry；是否属于
launch-supported 产品承诺，按 [`docs/frontend-shell.md`](frontend-shell.md) 的 support
level 处理。

**当前默认仍是 `single` 模式，但它是 legacy fallback。** 新的 runtime、kernel、
validator、SkillPack 能力应进入 AgentPipeline / RuntimeToolHub，而不是继续扩展
single prompt。agent 模式开启后，只允许替换生成路径；不能绕过 PlaybookScript
validation、renderer compatibility checks、self-check 或第三方 review。

### 切换

```bash
METAVIEW_GENERATION_MODE=agent
METAVIEW_AGENT_PROVIDER=http
METAVIEW_AGENT_BASE_URL=http://agent:8001   # docker-compose service name
METAVIEW_AGENT_TIMEOUT_S=600
```

`docker-compose up` 会同时启 `api` / `web` / `agent` 三个 service。本地 `make
dev` 同样并行起三个进程。

也可以不启动 Node sidecar，直接用 OpenAI Codex Python SDK 生成
`PlaybookScript`：

```bash
METAVIEW_GENERATION_MODE=agent
METAVIEW_AGENT_PROVIDER=codex
METAVIEW_CODEX_MODEL=gpt-5.5
METAVIEW_CODEX_EFFORT=high
METAVIEW_CODEX_CWD=.
METAVIEW_CODEX_BIN=                    # 可选：指定本机较新的 Codex CLI
METAVIEW_AGENT_SKILLS_DIR=skills/metaview-agent
```

Python SDK 会复用本机已有 Codex 登录；请求里传入 `provider_api_key` 时会调用
SDK 的 API-key 登录。该路径仍然只返回 PlaybookScript，并由后端 Pydantic 契约
校验后必须继续通过 reviewer、compatibility gate，再进入同一个 Remotion exit。
SDK 默认使用随包固定的 Codex runtime；只有本机模型明确要求更新版本时才设置
`METAVIEW_CODEX_BIN`，并指向已经安装且经过验证的 Codex CLI。
Codex provider 会按 route decision 加载 `skills/metaview-agent/generic/SKILL.md`
和对应学科的 `SKILL.md`，并接收 RuntimeToolHub manifest。Codex 当前不能执行
runtime tools，因此它定位为 repo-aware fallback / planner / repair provider，而不是
第二套 single。可确定题型仍优先由 deterministic SkillPack 在 AgentPipeline /
RuntimeToolHub 中处理；Codex agent 负责开放题、fallback、讲解导演和修复。

### RuntimeToolHub

`apps/api/app/application/agent/runtime_tool_hub.py` 是 agent runtime 工具入口。第一版
暴露：

- `skill.registry.list`
- `skill.<skill_id>.solve`
- `playbook.schema.validate`
- `playbook.self_check`
- `animation_tool.list` / `animation_tool.expand`
- `geometry.assert_orientation`
- `geometry.assert_passes_through`
- `geometry.assert_monotonic`

FastAPI 通过 `/api/v1/agent/runtime-tools` 和
`/api/v1/agent/runtime-tools/execute` 暴露统一工具面。旧的 `/assert/*` 与
`/animation-tools/*` endpoint 继续存在，但作为兼容 wrapper 调用 RuntimeToolHub。

### Drawing CLI 工具集

`apps/agent/src/tools/drawing.ts` 注册 L1 原子工具：`plan_outline`、
`begin_step`、`set_axes`、`add_curve_parametric`、`add_curve_1d`、
`add_point`、`add_arrow`、`add_segment`、`add_region`、`add_formula`、
`add_array_tokens`、`add_parameter_control`、`commit_step`、`finalize_playbook`。

**没有 `add_vector_field` 工具**——这是从能力面上消除「无端铺整片流场」
这个老毛病的关键设计。要画方向只能用 `add_arrow` 一根根加。

`apps/agent/src/tools/templates.ts` 注册 L2 教学模板（约 11 个跨学科）：
`template_array_swap` / `template_tangent_at` / `template_force_diagram` /
`template_projectile_trajectory` / `template_riemann_sum` 等，LLM 一次调用
展开成多个 step。

### 几何自检

`apps/agent/src/tools/asserts.ts` 把三个工具透传到 FastAPI：

| 工具 | 路由 | 后端实现 |
|---|---|---|
| `assert_orientation` | `POST /api/v1/agent/assert/orientation` | sympy 算参数曲线在 t∈[t_min,t_max] 区间的有向面积，判 cw/ccw |
| `assert_passes_through` | `POST /api/v1/agent/assert/passes-through` | 数值采样 + refine，找最近点距离 |
| `assert_monotonic` | `POST /api/v1/agent/assert/monotonic` | sympy `diff` 后区间内符号一致性 |

LLM 在 narration 里写「顺/逆时针」「递增/递减」之前，**必须**先调对应
`assert_*`，工具结果是确定真值，不一致就被强制回去改 narration。

### 关键文件

| 文件 | 职责 |
|---|---|
| `apps/agent/src/server.ts` | Express，`POST /generate` 入口 |
| `apps/agent/src/agent.ts` | `Agent` 实例 + 工具注册 + system prompt |
| `apps/agent/src/tools/runtimeTools.ts` | RuntimeToolHub sidecar bridge |
| `apps/agent/src/state/playbookEmitter.ts` | 累积工具调用 → PlaybookScript JSON |
| `apps/api/app/application/agent/types.py` | `AgentRequest` / `AgentResult` contract |
| `apps/api/app/application/agent/pipeline.py` | AgentPipeline 入口 |
| `apps/api/app/application/agent/runtime_tool_hub.py` | RuntimeToolHub registry / executor |
| `apps/api/app/application/ports/agent_provider.py` | `IAgentProvider` Protocol |
| `apps/api/app/infrastructure/agent/http_agent_provider.py` | httpx 客户端 |
| `apps/api/app/infrastructure/agent/codex_agent_provider.py` | OpenAI Codex Python SDK 客户端 |
| `apps/api/app/domain/services/geometry_validators.py` | sympy 校验纯函数 |
| `apps/api/app/presentation/router_agent.py` | `/api/v1/agent/runtime-tools` 与兼容 agent routes |
