# MetaView

> 把一道题，变成一段看得见的理解过程。

MetaView 是一个面向教育场景的 **AI 可视化讲解系统**。它尝试把数学推导、物理过程、算法状态、代码执行等抽象内容，转换为可播放、可追问、可恢复、可导出的结构化讲解。

MetaView 不是普通 PPT 生成器，也不是把文本、字幕和配音简单拼接成视频的工具。项目在大模型与渲染器之间加入了独立的教学规划、能力判定、质量校验和导演层，让系统先决定“应该怎样讲”，再决定“此刻应该让学习者看哪里”。

**当前状态：Beta。核心架构和产品闭环已具备，正在集中收敛 Gold Case 的真实生成稳定性。**

- 适合：本地开发、指定案例演示、架构验证、封闭试用。
- 暂不承诺：任意题目、任意学科都能稳定生成高质量视频。
- 开发入口：[`docs/START_HERE.md`](docs/START_HERE.md)

---

## MetaView 解决什么问题

传统 AI 讲题通常停留在文字回答、静态课件或旁白视频层面。它们可以生成内容，但往往缺少以下能力：

- 不知道一个知识点应该拆成哪些教学步骤；
- 画面只是装饰，没有真实的状态变化；
- 旁白、公式、代码和动画不共享同一条时间线；
- 用户追问后只能重新生成，无法沿着当前场景继续修改；
- 生成结果即使 JSON 合法，也可能在知识、教学或画面上不成立。

MetaView 将一次讲解拆成多个相互独立、可校验的契约：

```text
用户输入
  -> 学科理解与路由
  -> CoverageDecision       能不能可靠完成
  -> LessonPlan             应该怎样教
  -> SkillPack / Agent / CIR
  -> PlaybookScript         画面、步骤、旁白与状态
  -> QualityReport          结果是否可以被接受
  -> DirectorScript         此刻看哪里、看多久、如何过渡
  -> RenderPlan
  -> Remotion 预览 / 导出
```

最终目标不是“生成一个视频文件”，而是生成一份可以被检查、播放、追问、修改和复用的教学资产。

---

## 核心产品闭环

```text
输入题目或代码
  -> 判断能力边界
  -> 生成教学计划
  -> 构建分步可视化讲解
  -> 播放与检查
  -> 针对当前步骤继续追问
  -> 创建可恢复的新版本
  -> 导出视频或保留为模板资产
```

当前产品已覆盖以下主要交互：

- 输入文字题目、粘贴代码或上传代码文件；
- 根据学科、题型与运行时能力决定生成路径；
- 生成结构化教学步骤、画面对象、公式、代码高亮与旁白；
- 使用独立 DirectorScript 控制镜头、节奏、焦点和强调词；
- 在播放器中预览、暂停、逐步切换、调整速度和使用 TTS；
- 针对当前讲解继续解释或创建修改版本；
- 保存运行历史，并通过 Remotion 导出视频；
- 在导出前重新执行质量检查，阻止不可用结果进入最终视频。

---

## 为什么需要 Director 层

MetaView 将“讲什么”和“怎么看”分成两个核心契约。

| 契约 | 负责内容 | 不负责内容 |
|---|---|---|
| `LessonPlan` | 学习目标、误区、教学弧线、SceneIntent、预期结论 | 渲染坐标、帧数、组件私有参数 |
| `PlaybookScript` | 教学步骤、snapshot、公式、画面对象、代码状态、旁白 | 镜头语言和观看节奏 |
| `DirectorScript` | shot type、camera motion、pacing、focus target、emphasis、transition intent | 重新定义知识结论或渲染协议 |
| `RenderPlan` | 将导演意图适配为 scale、translate、opacity、timing | 教学决策 |

`PlaybookScript` 描述内容本身，`DirectorScript` 描述观看方式。二者不能合并：一个正确但没有焦点和节奏的画面，仍然可能难以理解。

Remotion 是当前唯一的视频预览与导出出口。项目不引入第二套 Manim、HTML iframe 或服务端 HTML 视频渲染协议。

---

## 能力判定与安全边界

MetaView 不把路由标签直接当作“支持证明”。每次生成前，后端都会产生一个持久化的 `CoverageDecision`：

| 模式 | 含义 | 当前处理 |
|---|---|---|
| `specialized` | 存在已注册、可验证的确定性 SkillPack | 使用专用能力生成 |
| `composable` | 请求匹配受控组合场景、工具和校验器 | 在严格边界内继续生成 |
| `experimental` | 学科已知，但缺少完整验证能力 | 当前阻止伪装成成功视频 |
| `unsupported` | 无可靠领域或明确不支持 | 在模型调用前拒绝 |

这意味着 MetaView 宁愿明确失败，也不会把不可靠的通用输出包装成已经通过验证的教学视频。

当前已经建立 `SkillRecipe` 契约和确定性验证器，但完整的生产 RecipeExecutor / Generalist Composer 仍属于后续里程碑。现阶段不会把 Generalist Composer 注册成一个“万能 Skill”。

---

## 当前支持范围

### 输入

当前首发输入支持：

- 文字题目或知识点；
- 粘贴算法与代码；
- 上传代码文件。

当前不支持直接从以下内容生成：

- 图片或截图；
- PDF；
- PPT / 课件；
- 任意附件或多模态材料。

### 学科

路由与数据契约覆盖以下教学领域：

- `math`
- `physics`
- `algorithm`
- `code`
- `chemistry`
- `biology`
- `geography`

领域进入路由表并不等于该领域的所有题型都已稳定。当前研发和公开演示应优先围绕 **数学、物理、算法和代码** 的受控案例展开，其他学科能力仍在扩展。

### 生成模式

1. `single mode`

```text
CoverageDecision
  -> LessonPlan
  -> LLM
  -> CIR + ExecutionMap
  -> PlaybookScript
  -> QualityReport
  -> DirectorScript
```

2. `agent mode`

```text
CoverageDecision
  -> LessonPlan
  -> Agent tool loop
  -> self-check / repair
  -> PlaybookScript
  -> QualityReport
  -> DirectorScript
```

`single mode` 仍是默认回滚路径。`agent mode` 是活跃验证路径，不应在未通过 [`docs/agent-demo-acceptance.md`](docs/agent-demo-acceptance.md) 前被宣传为默认生产能力。

---

## Benchmark V2 与 Gold Cases

MetaView 使用严格的 Benchmark V2 判断一个结果是否真正具备产品质量，而不只是 schema 合法。

首批 Gold Cases：

| Case | 必须出现的产品证据 |
|---|---|
| 导数与切线 | 曲线、`x=1`、切点、斜率 `2`、真实切线关系 |
| BFS | 图节点与边、当前节点、visited、FIFO queue 和广度优先顺序 |
| `factorial(4)` | 调用栈 push / unwind、活动代码行、返回值 `1, 2, 6, 24` |
| 抛体运动 | 物体、抛物线轨迹、水平/竖直速度分量与重力 |

评分覆盖：

- 契约与 schema；
- 知识正确性；
- 教学结构；
- 视觉要求覆盖；
- Code Sync；
- 旁白与画面一致性；
- 时间线和导出就绪度。

总分达到 90 仍不是充分条件。任何 hard fail 都会使本次生成失败。一个可公开宣传的 Gold Case 需要通过三次相互独立的真实生成，而不是只修改静态 fixture 让报告变绿。

```bash
# 检查当前记录基线
make eval-gold

# 四个案例分别进行真实重复生成
make eval-gold LIVE=1 API=http://localhost:8000 REPEAT=3
```

详细规则见 [`docs/benchmark-v2.md`](docs/benchmark-v2.md)。

---

## 快速开始

### 方式一：本地开发

```bash
make bootstrap
make setup-hooks
cp .env.example .env
make dev
```

默认服务：

| 服务 | 地址 |
|---|---|
| Web | `http://localhost:5173` |
| API | `http://localhost:8000` |
| Agent sidecar | `http://localhost:8001` |

也可以分别启动：

```bash
make dev-api
make dev-web
make dev-agent
```

### 方式二：Docker Compose

```bash
cp .env.example .env
make start
```

停止服务：

```bash
make stop
```

`make start` 等价于 `docker compose up --build`。

### 最安全的本地 Demo 配置

```dotenv
METAVIEW_APP_EDITION=self
VITE_APP_EDITION=self
METAVIEW_GENERATION_MODE=single
METAVIEW_MOCK_PROVIDER_ENABLED=true
```

未配置真实模型时可以使用内置 mock provider 检查 UI 和管线。需要真实生成时，可配置 OpenAI 兼容接口，也可连接本地 Ollama / vLLM 网关。

---

## Edition 边界

`METAVIEW_APP_EDITION` 与 `VITE_APP_EDITION` 必须保持一致。

### `self`

- BYOK 单机版；
- 不请求账户接口；
- 不展示余额、充值或微信登录；
- provider 配置保存在浏览器本地；
- 运行历史保存在本地 SQLite。

### `ops`

- SaaS 用户版；
- 用户态接口要求有效登录 session；
- 生成、follow-up 与 TTS 使用平台托管配置；
- 支持余额、充值和运营管理能力；
- 管理入口位于 `/admin`，后端仍会检查 edition 与管理员角色。

完整配置见 [`.env.example`](.env.example)。

---

## 技术栈

| 层 | 技术 |
|---|---|
| Web | React 19、TypeScript、Vite |
| 视频预览与导出 | Remotion |
| API | FastAPI、Python |
| Agent sidecar | Node.js / TypeScript |
| 数据存储 | SQLite |
| 模型接入 | OpenAI-compatible API、Ollama、vLLM |
| 工程验证 | pytest、Vitest、ESLint、ruff、TypeScript、Benchmark V2 |

---

## 仓库结构

| 路径 | 作用 |
|---|---|
| `apps/api` | FastAPI 后端、生成管线、契约、质量门、历史、导出与运营 API |
| `apps/web` | React 工作台、Landing Page、播放器、Remotion composition 与 renderer |
| `apps/agent` | Agent sidecar、工具循环、自检与修复流程 |
| `skills` | 学科技能、提示参考与 SkillPack 相关资源 |
| `eval` | Gold Cases、Benchmark V2、录制与视觉检查工具 |
| `docs` | 当前架构、开发边界和验收文档 |
| `data` | 本地 SQLite、导出文件和调试数据 |
| `docker-compose.yml` | API、Web 与 Agent 联调入口 |

---

## 常用命令

```bash
make lint
make test
make build
make check
make visual-check
make eval-gold
```

- `make check`：执行 ruff、ESLint、pytest、Vitest、TypeScript 与构建检查；
- `make visual-check`：执行资产审计、Remotion smoke fixture 与视觉基线；
- `make eval-gold`：执行四个 Gold Case 的严格 Benchmark V2；
- 生成的 `eval/reports/`、`eval/videos/` 与 `eval/shots/` 是本地证据，不应提交到仓库。

---

## API 概览

| Method | Path | 说明 |
|---|---|---|
| `POST` | `/api/v1/pipeline` | 提交题目并返回 `run_id` |
| `GET` | `/api/v1/runs` | 获取运行历史 |
| `GET` | `/api/v1/runs/{run_id}` | 获取 CoverageDecision、LessonPlan、PlaybookScript、DirectorScript 与 QualityReport |
| `POST` | `/api/v1/exports` | 创建视频导出任务 |
| `GET` | `/api/v1/exports/{job_id}` | 查询导出状态 |
| `GET` | `/health` | 健康检查 |

Web 端通过 `usePipelinePoller` 轮询运行状态，直到 `succeeded` 或 `failed`。

---

## 工程边界

### 后端

后端遵循整洁架构：

- `presentation/` 只能依赖 `application/`；
- `application/` 通过 ports 组合 `domain/`；
- `domain/` 不得导入外部 I/O 依赖；
- `infrastructure/` 实现 `application/ports/`，不得反向污染领域层。

### 前端

前端遵循 Feature-Sliced Design：

- `shared/` 不得导入 `features/` 或 `pages/`；
- `entities/` 不得导入 `features/`；
- `features/` 之间禁止相互导入；
- `engine/renderers/` 不得依赖 player 或 composition。

新增 snapshot / renderer 时必须同步扩展：

1. 后端 Pydantic 判别联合；
2. 前端 TypeScript 类型；
3. renderer registry；
4. Agent allow-list 与契约测试；
5. 对应质量校验和视觉 fixture。

Director 字段不得重新塞回 Playbook step。Remotion 尺寸和 FPS 必须读取共享配置，组件内不得写死另一套渲染协议。

---

## 当前限制

- 四个 Gold generator 仍需要从静态或重复状态迁移到真实视觉进展；
- 真实生成必须继续完成三次独立通过的稳定性验证；
- LessonPlan adherence 当前主要是聚合检查，尚未完整证明每个 SceneIntent 的顺序与 narration goal；
- `SkillRecipe` 已有契约与验证器，但生产执行链路仍在建设；
- Agent 模式受 provider、模型兼容性、额度和运行环境影响；
- 图片、截图、PDF 和 PPT 输入尚未进入首发链路；
- 带音频导出仍应视为 Beta 能力。

这些限制是公开的产品边界，不应通过降低阈值或修改测试 fixture 被隐藏。

---

## 近期路线图

1. 将四个 Gold generator 改造成真实、连续的视觉状态演进；
2. 让每个 Gold Case 完成三次独立 live pass；
3. 将 SceneIntent 编译到共享 SceneBlueprint / Playbook assembly；
4. 接通受控 `SkillRecipe` 的生产验证与执行；
5. 记录 Capability Gap，再建设离线 SkillForge；
6. 将真实通过验收的运行结果接入 Showcase，而不是用手写 Demo 代替产品证据；
7. 在稳定案例基础上开放教师和教育内容创作者的封闭试用。

---

## 文档入口

- [`docs/START_HERE.md`](docs/START_HERE.md) — 当前项目入口与禁止事项
- [`docs/pipeline.md`](docs/pipeline.md) — 完整生成与导出管线
- [`docs/coverage-and-fallback.md`](docs/coverage-and-fallback.md) — 能力判定和 fail-closed 边界
- [`docs/lesson-plan.md`](docs/lesson-plan.md) — 教学规划契约
- [`docs/quality-gate.md`](docs/quality-gate.md) — 后端统一质量门
- [`docs/director-layer.md`](docs/director-layer.md) — 独立导演层
- [`docs/skill-recipe.md`](docs/skill-recipe.md) — 受控组合契约
- [`docs/benchmark-v2.md`](docs/benchmark-v2.md) — Gold Case 与产品质量评分
- [`docs/agent-demo-acceptance.md`](docs/agent-demo-acceptance.md) — Agent 模式验收
- [`docs/frontend-shell.md`](docs/frontend-shell.md) — 前端页面与工作台结构
- [`docs/README.md`](docs/README.md) — 完整文档索引
- [`AGENTS.md`](AGENTS.md) — Coding Agent 工作规则
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — 分支、提交与贡献规范

---

## 项目原则

> LLM 负责理解与决策，程序负责规范化、校验和渲染。

MetaView 当前最重要的工作不是继续扩大“支持范围”的文案，而是让少量核心案例拥有真实、稳定、可复现的产品证据。