# MetaView v2

MetaView v2 是一个教育可视化平台：后端用 FastAPI 生成结构化教学脚本，前端用 React 19 + Remotion 按帧播放教学动画。

唯一渲染路径是 **LLM → CIR + ExecutionMap → PlaybookScript → Remotion Player**。项目不引入 Manim、HTML iframe 或服务端视频渲染；管线契约见 [`docs/pipeline.md`](docs/pipeline.md)。

## 功能概览

- 支持 `algorithm`, `math`, `code`, `physics`, `chemistry`, `biology`, `geography` 七个教学领域。
- 题目提交前会做 topic routing：高置信题目进入 specialized skill，未命中时走 generic skill 并由 LLM 决定最终 `cir.domain`。
- 算法领域支持数组视图和 `algorithm_bars` 柱状视图，可回放冒泡、快排、插入、选择等排序过程。
- 数学领域支持逐项代数和 `visual_kind="function"` 函数图，覆盖平移、缩放、导数切线、定积分阴影、三角波等场景。
- 播放器提供参数面板、字幕、TTS、速度控制、历史记录、视频导出和 provider 配置。
- 运行历史保留原始 `prompt`，便于复盘不同输入与生成结果。

## 目录结构

| 路径 | 内容 |
|------|------|
| `apps/api` | FastAPI 后端：CIR 生成、PlaybookScript 装配、运行历史、支付/导出 API |
| `apps/web` | React 19 + Vite + Remotion 前端，按 Feature-Sliced Design 分层 |
| `apps/agent` | agent sidecar，用于 `generation_mode=agent` 的生成链路 |
| `docs` | 管线、前端外壳、渲染器、路由、集成说明 |
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

## API 端点

| Method | Path | 说明 |
|--------|------|------|
| `POST` | `/api/v1/pipeline` | 提交题目，返回 `run_id` |
| `GET` | `/api/v1/runs` | 运行历史列表 |
| `GET` | `/api/v1/runs/{run_id}` | 单次运行结果，含 PlaybookScript 与原始 `prompt` |
| `POST` | `/api/v1/exports` | 创建视频导出任务 |
| `GET` | `/api/v1/exports/{job_id}` | 查询导出任务状态 |
| `GET` | `/health` | 健康检查 |

提交题目后，前端通过 `usePipelinePoller` 轮询 `/runs/{run_id}`，直到状态变为 `succeeded` 或 `failed`。

## 配置

后端配置统一使用 `METAVIEW_` 前缀环境变量，由 [`apps/api/app/config.py`](apps/api/app/config.py) 管理。前端配置集中在 [`apps/web/src/shared/config/constants.ts`](apps/web/src/shared/config/constants.ts)。

| 变量 | 默认 | 说明 |
|------|------|------|
| `METAVIEW_OPENAI_API_KEY` | - | 内置 OpenAI 兼容 provider 的 key |
| `METAVIEW_OPENAI_BASE_URL` | `https://api.openai.com/v1` | OpenAI 兼容接口根地址 |
| `METAVIEW_OPENAI_MODEL` | - | 默认模型名 |
| `METAVIEW_OPENAI_SUPPORTS_VISION` | `false` | 是否走多模态请求 |
| `METAVIEW_OPENAI_TIMEOUT_S` | `300` | 请求超时秒数 |
| `METAVIEW_OPENAI_MAX_TOKENS` | `16000` | chat/completions 的 `max_tokens` |
| `METAVIEW_OPENAI_REASONING_EFFORT` | - | gpt-5 / o-series 专用，支持 `minimal\|low\|medium\|high` |
| `METAVIEW_GENERATION_MODE` | `single` | `single` 或 `agent` |
| `METAVIEW_AGENT_PROVIDER` | `http` | `agent` 模式实现：`http` 或 `codex` |
| `METAVIEW_AGENT_BASE_URL` | `http://agent:8001` | agent sidecar 地址 |
| `METAVIEW_AGENT_TIMEOUT_S` | `600` | agent 生成超时秒数 |
| `METAVIEW_AGENT_SHARED_TOKEN` | - | API 调用 agent sidecar 的共享鉴权 token |
| `METAVIEW_CODEX_MODEL` | - | Python Codex SDK 模型覆盖 |
| `METAVIEW_CODEX_EFFORT` | - | Python Codex SDK reasoning effort |
| `METAVIEW_CODEX_CWD` | `.` | Codex thread 工作目录 |
| `METAVIEW_GENERATION_COST_CENTS` | `10` | 运营版每次生成 / follow-up 预扣金额，失败会退款 |
| `METAVIEW_DEFAULT_PROVIDER` | - | 显式指定默认 provider |
| `METAVIEW_MOCK_PROVIDER_ENABLED` | `true` | 是否暴露 `mock` provider |
| `METAVIEW_ENABLED_DOMAINS` | 全部七项 | 启用的学科 |
| `METAVIEW_MAX_REPAIR_ATTEMPTS` | `2` | CIR 自动修复轮数 |
| `METAVIEW_HISTORY_DB_PATH` | `data/pipeline_runs.db` | SQLite 路径 |
| `METAVIEW_WECHAT_NOTIFY_MAX_SKEW_S` | `300` | 微信支付回调时间戳允许偏移秒数 |
| `METAVIEW_WECHAT_NOTIFY_REPLAY_TTL_S` | `600` | 微信支付回调重放缓存保留秒数 |
| `METAVIEW_PLAYBOOK_DEFAULT_FPS` | `30` | Remotion 默认帧率 |
| `METAVIEW_PLAYBOOK_COMPOSITION_WIDTH` / `_HEIGHT` | `960` / `540` | 默认画布 |
| `METAVIEW_CORS_ORIGIN_REGEX` | localhost 正则 | 允许的浏览器来源 |
| `VITE_API_BASE_URL` | 同源 | 前端构建时 API 基地址 |

完整变量列表见 [`.env.example`](.env.example)。

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
- `entities/` 不得导入 `features/`。
- `features/` 之间禁止互相导入。
- `engine/renderers/` 不得导入 `engine/player/` 或 `engine/composition/`。

新增渲染器时同步扩展后端和前端类型：

1. 在 `apps/web/src/features/playbook/engine/renderers/` 新增 renderer。
2. 在 `renderers/types.ts` 扩展 snapshot 判别联合。
3. 在 `renderers/registry.ts` 注册 renderer。
4. 在 `apps/api/app/domain/models/playbook.py` 扩展 Python 类型。

Remotion 尺寸和 FPS 必须从 `PLAYBOOK_DEFAULTS` 读取；组件内不要写死字面量。集成测试使用真实 SQLite，前端 API 测试使用 MSW 拦截网络。

## 关键文件

| 文件 | 用途 |
|------|------|
| `apps/api/app/config.py` | 后端配置入口 |
| `apps/api/app/domain/models/playbook.py` | PlaybookScript, MetaStep, Snapshot 类型 |
| `apps/api/app/domain/services/playbook_builder.py` | CIR → PlaybookScript 映射 |
| `apps/web/src/shared/config/constants.ts` | 前端配置常量 |
| `apps/web/src/features/playbook/engine/types.ts` | 前端 PlaybookScript 类型 |
| `apps/web/src/features/playbook/engine/player/PlaybookPlayer.tsx` | Remotion 播放器入口 |
| `apps/web/src/features/playbook/engine/renderers/registry.ts` | 渲染器注册表 |
| `apps/web/src/features/playbook/engine/param-panels/registry.ts` | 参数面板注册表 |

## 文档

- [`docs/README.md`](docs/README.md) - 开发文档索引
- [`docs/pipeline.md`](docs/pipeline.md) - CIR、PlaybookScript、时间轴和视频导出管线
- [`docs/frontend-shell.md`](docs/frontend-shell.md) - Stage 路由、GlobalTopbar、Studio 布局、Provider 配置
- [`docs/html-css-implementation.md`](docs/html-css-implementation.md) - HTML/CSS 写法和项目对应关系
- [`docs/remotion-skills.md`](docs/remotion-skills.md) - Remotion 组件、渲染器、注册表约定
- [`docs/topic-routing.md`](docs/topic-routing.md) - 学科路由策略
- [`docs/skill-ab-eval.md`](docs/skill-ab-eval.md) - specialized / generic skill 对比
- [`docs/newapi-metaview-topup-integration.md`](docs/newapi-metaview-topup-integration.md) - NewAPI 跳转充值和 receipt 回兑接入
- [`CONTRIBUTING.md`](CONTRIBUTING.md) - 分支策略、Conventional Commits、Hook
