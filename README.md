# MetaView v2

MetaView v2 是一个面向教育场景的 AI 可视化讲解平台。它不是普通 PPT 生成器，也不是只把文本变成视频的工具；核心架构是“内容生成 + 导演层 + 可渲染视频”。

当前主线请先读 [`docs/START_HERE.md`](docs/START_HERE.md)。

## 核心管线

```text
User input
  -> subject understanding / router / SkillPack / agent
  -> PlaybookScript
  -> DirectorScript
  -> RenderPlan
  -> Remotion preview / export
```

- `PlaybookScript` 是内容契约：负责教学步骤、snapshot、公式、画面对象、旁白、代码高亮和可渲染场景数据。
- `DirectorScript` 是导演契约：负责镜头意图、shot type、camera motion、pacing、focus target、emphasis terms 和观看节奏。
- `RenderPlan` 是渲染适配层：把 DirectorScript 转换为 Remotion 可消费的 scale、translate、opacity、timing 等参数。
- Remotion 是唯一视频预览/导出出口。

生成路径当前有两条：

1. `single mode`: **LLM -> CIR + ExecutionMap -> PlaybookScript -> DirectorScript**
2. `agent mode`: **Agent tool loop -> self-check -> PlaybookScript -> DirectorScript**

项目仍不引入 Manim、HTML iframe 或服务端 HTML 视频渲染。管线契约见 [`docs/pipeline.md`](docs/pipeline.md)，Director 契约见 [`docs/director-layer.md`](docs/director-layer.md)。

## 功能概览

- 支持 `algorithm`, `math`, `code`, `physics`, `chemistry`, `biology`, `geography` 七个教学领域。
- 首发输入支持文本题目、粘贴代码和上传代码文件；暂不支持图片、截图、PDF、PPT/课件或任意附件生成。
- 题目提交前会做 topic routing：高置信题目进入 specialized skill，未命中时走 generic skill 或 agent 路径。
- deterministic SkillPack 用于把确定性学科问题转成可靠的 PlaybookScript。
- Director 层为每个 run 生成独立 DirectorScript，当前已有 rule-based 默认导演，后续会进入可见、可渲染、可编辑阶段。
- 播放器提供参数面板、字幕、TTS、速度控制、历史记录、视频导出和 provider 配置。
- 运行历史保留原始 `prompt`、PlaybookScript 和 DirectorScript，便于复盘不同输入与生成结果。

## 目录结构

| 路径 | 内容 |
|------|------|
| `apps/api` | FastAPI 后端：生成管线、PlaybookScript、DirectorScript、运行历史、支付/导出 API |
| `apps/web` | React 19 + Vite + Remotion 前端，按 Feature-Sliced Design 分层 |
| `apps/agent` | agent sidecar，用于 `generation_mode=agent` 的生成链路 |
| `docs` | 当前主线文档、Director 架构、管线、渲染器、路由和验收说明 |
| `skills` | 各学科 prompt reference |
| `data` | 本地 SQLite、导出文件和调试数据 |
| `docker-compose.yml` | API + Web + agent 联调入口 |

## 快速开始

```bash
make bootstrap
make setup-hooks
cp .env.example .env
make dev
```

本地服务默认地址：

| 服务 | 地址 |
|------|------|
| API | `http://localhost:8000` |
| Web | `http://localhost:5173` |
| Agent sidecar | `http://localhost:8001` |

也可以拆开运行：

```bash
make dev-api
make dev-web
```

自用版和运营版可通过启动脚本进入：

```bash
./start.sh
./start.sh op
```

未配置真实 LLM 时默认走内置 `mock` provider。前端 Provider 面板可填写 OpenAI 兼容接口，也支持本地 Ollama / vLLM 网关。

## Edition 边界

`METAVIEW_APP_EDITION` 和 `VITE_APP_EDITION` 必须保持一致：

- `self` 是纯 BYOK 单机版。前端不请求账户接口，不显示余额、充值或微信登录；生成、追问和 TTS 可以使用浏览器本地保存的 OpenAI 兼容 provider 配置。后端仍使用本地 SQLite 保存运行历史。
- `ops` 是 SaaS 用户版。所有用户态接口必须有有效微信登录 session；生成和 follow-up 使用平台托管模型并按账户余额扣费，客户端提交 provider/router/TTS key 会被拒绝。
- 运营面板不在 UI 中暴露入口。管理员直接访问 `/admin`，后端仍要求 `METAVIEW_APP_EDITION=ops` 且当前账户 `role=admin`。

## Docker

```bash
cp .env.example .env
make start
make stop
```

`make start` 等价于 `docker compose up --build`，`make stop` 等价于 `docker compose down`。

## 常用命令

```bash
make lint
make test
make build
make check
```

`make check` 会串联 ruff、eslint、pytest、tsc 和 Vite build。

Agent demo 验收见 [`docs/agent-demo-acceptance.md`](docs/agent-demo-acceptance.md)。生成的 `eval/reports/`、`eval/videos/`、`eval/shots/` 是本地证据，不应提交。

## API 端点

| Method | Path | 说明 |
|--------|------|------|
| `POST` | `/api/v1/pipeline` | 提交题目，返回 `run_id` |
| `GET` | `/api/v1/runs` | 运行历史列表 |
| `GET` | `/api/v1/runs/{run_id}` | 单次运行结果，含 PlaybookScript、DirectorScript 与原始 `prompt` |
| `POST` | `/api/v1/exports` | 创建视频导出任务 |
| `GET` | `/api/v1/exports/{job_id}` | 查询导出任务状态 |
| `GET` | `/health` | 健康检查 |

提交题目后，前端通过 `usePipelinePoller` 轮询 `/runs/{run_id}`，直到状态变为 `succeeded` 或 `failed`。

## 配置

后端配置统一使用 `METAVIEW_` 前缀环境变量，由 [`apps/api/app/config.py`](apps/api/app/config.py) 管理。前端配置集中在 [`apps/web/src/shared/config/constants.ts`](apps/web/src/shared/config/constants.ts)。完整变量列表见 [`.env.example`](.env.example)。

关键变量：

| 变量 | 默认 | 说明 |
|------|------|------|
| `METAVIEW_APP_EDITION` | `self` | 后端 edition：`self` / `ops` |
| `VITE_APP_EDITION` | `self` | 前端 edition：`self` / `ops`，应与 `METAVIEW_APP_EDITION` 一致 |
| `METAVIEW_GENERATION_MODE` | `single` | `single` 或 `agent`；`single` 当前仍是默认 rollback path |
| `METAVIEW_AGENT_PROVIDER` | `http` | `agent` 模式 provider adapter：`http` sidecar 或 `codex` fallback |
| `METAVIEW_AGENT_BASE_URL` | `http://agent:8001` | agent sidecar 地址 |
| `METAVIEW_AGENT_SHARED_TOKEN` | - | API 调用 agent sidecar 的共享鉴权 token |
| `METAVIEW_ROUTER_MODE` | `hybrid` | 路由模式：`off` / `heuristic` / `llm` / `hybrid` |
| `METAVIEW_OPENAI_API_KEY` | - | 内置 OpenAI 兼容 provider 的 key |
| `METAVIEW_OPENAI_BASE_URL` | `https://api.openai.com/v1` | OpenAI 兼容接口根地址 |
| `METAVIEW_OPENAI_MODEL` | - | 默认模型名 |
| `AGENT_DEFAULT_BASE_URL` | - | agent sidecar 默认 OpenAI 兼容接口根地址；未设置时读取 `METAVIEW_OPENAI_BASE_URL` |
| `METAVIEW_PAYMENT_GATEWAY` | `easypay` | 支付网关选择：`wechat` / `easypay`，主路径为 `easypay` |
| `METAVIEW_EPAY_PAY_TYPE` | `wxpay` | 开启 `easypay` 时创建订单的支付类型 |
| `METAVIEW_PLAYBOOK_DEFAULT_FPS` | `30` | Remotion 默认帧率 |
| `METAVIEW_PLAYBOOK_COMPOSITION_WIDTH` / `_HEIGHT` | `960` / `540` | 默认画布 |

生产环境请使用公网且 `https` 的回调/跳转地址。微信 APIv3 相关配置保留为 legacy/deprecated，仅用于兼容回滚，不是充值主路径。

## 播放器快捷键

| 按键 | 功能 |
|------|------|
| `Space` | 播放 / 暂停 |
| `←` / `→` | 上一步 / 下一步 |
| `R` | 重置到第一步 |
| `T` | 开启 / 关闭 TTS 朗读 |
| `S` | 显示 / 隐藏字幕 |
| `+` / `=` | 加速 |
| `-` | 减速 |
| `E` | 打开导出面板 |
| `Esc` | 关闭 TTS 配置弹窗 |

## 开发约束

后端遵循整洁架构：

- `presentation/` 只能导入 `application/`。
- `application/` 只能通过 ports 组合 `domain/`。
- `domain/` 不得导入外部 I/O 依赖。
- `infrastructure/` 实现 `application/ports/` 协议，不得被 `domain/` 导入。

前端遵循 Feature-Sliced Design：

- `shared/` 不得导入 `features/` 或 `pages/`。
- `entities/` 不得导入 `features`。
- `features/` 之间禁止互相导入。
- `engine/renderers/` 不得导入 `engine/player/` 或 `engine/composition/`。

新增渲染器时同步扩展后端和前端类型：

1. 在 `apps/web/src/features/playbook/engine/renderers/` 新增 renderer。
2. 在 `renderers/types.ts` 扩展 snapshot 判别联合。
3. 在 `renderers/registry.ts` 注册 renderer。
4. 在 `apps/api/app/domain/models/playbook.py` 扩展 Python 类型。

Director 相关字段不要塞回 Playbook step；DirectorScript 是独立契约。Remotion 尺寸和 FPS 必须从 `PLAYBOOK_DEFAULTS` 读取；组件内不要写死字面量。

## 关键文件

| 文件 | 用途 |
|------|------|
| `apps/api/app/config.py` | 后端配置入口 |
| `apps/api/app/domain/models/playbook.py` | PlaybookScript, MetaStep, Snapshot 类型 |
| `apps/api/app/domain/models/director.py` | DirectorScript, DirectorBeat, 镜头/节奏字段 |
| `apps/api/app/domain/services/playbook_builder.py` | CIR -> PlaybookScript 映射 |
| `apps/api/app/domain/services/director_builder.py` | PlaybookScript -> rule-based DirectorScript 映射 |
| `apps/api/app/infrastructure/persistence/sqlite_director_repository.py` | DirectorScript 持久化 |
| `apps/web/src/shared/config/constants.ts` | 前端配置常量 |
| `apps/web/src/features/playbook/engine/types.ts` | 前端 PlaybookScript / DirectorScript 类型 |
| `apps/web/src/features/playbook/engine/player/PlaybookPlayer.tsx` | Remotion 播放器入口 |
| `apps/web/src/features/playbook/engine/renderers/registry.ts` | 渲染器注册表 |
| `apps/web/src/features/playbook/engine/param-panels/registry.ts` | 参数面板注册表 |

## 文档

- [`docs/START_HERE.md`](docs/START_HERE.md) - 当前项目入口
- [`docs/director-layer.md`](docs/director-layer.md) - Director 独立导演层契约
- [`docs/README.md`](docs/README.md) - 开发文档索引
- [`docs/pipeline.md`](docs/pipeline.md) - 生成、PlaybookScript、DirectorScript 挂载点和导出管线
- [`docs/frontend-shell.md`](docs/frontend-shell.md) - Stage 路由、GlobalTopbar、Studio 布局、Provider 配置
- [`docs/remotion-skills.md`](docs/remotion-skills.md) - Remotion 组件、渲染器、注册表约定
- [`docs/topic-routing.md`](docs/topic-routing.md) - 学科路由策略
- [`docs/agent-demo-acceptance.md`](docs/agent-demo-acceptance.md) - agent/runtime-tool 验收
- [`CONTRIBUTING.md`](CONTRIBUTING.md) - 分支策略、Conventional Commits、Hook
