# MetaView v2

教育可视化平台。前端基于 React + Remotion 帧驱动渲染教学动画，后端用 FastAPI 整洁架构生成结构化教学脚本。

> 唯一渲染路径：**LLM → CIR + ExecutionMap → PlaybookScript → Remotion Player**
> 不使用 Manim，不使用服务端视频渲染。详见 [`docs/pipeline.md`](docs/pipeline.md)。

## 目录结构

| 路径 | 内容 |
|------|------|
| `apps/api` | FastAPI 后端：CIR 生成、PlaybookScript 装配、SQLite 历史 |
| `apps/web` | React 19 + Vite + Remotion 前端，FSD 分层 |
| `docs` | 开发文档（管线契约、前端外壳） |
| `skills` | 学科 prompt 参考资料 |
| `docker-compose.yml` | API + Web 联调入口 |

学科默认全部启用：`algorithm`, `math`, `code`, `physics`, `chemistry`, `biology`, `geography`。

## 快速开始

### 本地开发

```bash
make bootstrap            # 安装 npm + Python 依赖（创建 .venv）
make setup-hooks          # 启用 commit-msg / pre-commit
cp .env.example .env      # 按需填 METAVIEW_OPENAI_API_KEY 等
make dev                  # 同时拉起 API:8000 和 Web:5173
```

或拆终端：`make dev-api` / `make dev-web`。

未配置真实 LLM 时默认走内置 `mock` provider，可在前端 Provider 面板填写 OpenAI 兼容接口（也支持本地 Ollama / vLLM 网关）。

### Docker

```bash
cp .env.example .env
make start                # = docker compose up --build
make stop                 # = docker compose down
```

## 检查

```bash
make lint    # ruff + eslint
make test    # pytest
make build   # vite build
make check   # 上面三步串联
```

## API 端点

后端只暴露三个端点：

| Method | Path | 说明 |
|--------|------|------|
| `POST` | `/api/v1/pipeline` | 提交题目，返回 `run_id`（202） |
| `GET`  | `/api/v1/runs` | 历史列表 |
| `GET`  | `/api/v1/runs/{run_id}` | 单次运行结果（含 PlaybookScript） |
| `GET`  | `/health` | 健康检查 |

提交后由前端 `usePipelinePoller` 轮询 `/runs/{run_id}` 直到 `succeeded` / `failed`。

## 配置

所有后端配置走 `METAVIEW_` 前缀环境变量，由 `apps/api/app/config.py` 集中管理。

| 变量 | 默认 | 说明 |
|------|------|------|
| `METAVIEW_OPENAI_API_KEY` | – | 内置 OpenAI 兼容 provider 的 key |
| `METAVIEW_OPENAI_BASE_URL` | `https://api.openai.com/v1` | 接口根地址 |
| `METAVIEW_OPENAI_MODEL` | – | 默认模型名 |
| `METAVIEW_OPENAI_SUPPORTS_VISION` | `false` | 是否走多模态请求 |
| `METAVIEW_OPENAI_TIMEOUT_S` | `300` | 请求超时秒数 |
| `METAVIEW_DEFAULT_PROVIDER` | – | 显式指定默认 provider，留空自动 |
| `METAVIEW_MOCK_PROVIDER_ENABLED` | `true` | 是否暴露 `mock` provider |
| `METAVIEW_ENABLED_DOMAINS` | 全部七项 | 启用的学科 |
| `METAVIEW_MAX_REPAIR_ATTEMPTS` | `2` | CIR 自动修复轮数 |
| `METAVIEW_HISTORY_DB_PATH` | `data/pipeline_runs.db` | SQLite 路径 |
| `METAVIEW_PLAYBOOK_DEFAULT_FPS` | `30` | Remotion 默认帧率 |
| `METAVIEW_PLAYBOOK_COMPOSITION_WIDTH` / `_HEIGHT` | `960` / `540` | 默认画布 |
| `METAVIEW_CORS_ORIGIN_REGEX` | localhost 正则 | 允许的浏览器来源 |
| `VITE_API_BASE_URL` | 同源 | 前端构建时 API 基地址 |

完整列表见 [`apps/api/app/config.py`](apps/api/app/config.py) 和 [`.env.example`](.env.example)。

## 架构约束

详见 [`CLAUDE.md`](CLAUDE.md)。核心规则：

**后端层级（整洁架构）**
- `presentation/` → `application/` → `domain/`，单向依赖
- `domain/` 不允许任何 I/O 依赖
- `infrastructure/` 实现 `application/ports/` 协议

**前端 FSD**
- `shared/` 不得反向导入 `features/` / `pages/`
- `features/` 之间不互相导入
- `engine/renderers/` 不得导入 `engine/player/` 或 `engine/composition/`

**禁止**
- 服务端视频渲染（Manim、ffmpeg-on-server、HTML iframe）
- 在组件里写死 fps / 画布尺寸（必须从 `PLAYBOOK_DEFAULTS` 读）
- 测试中用 `jest.mock` 替换业务模块；集成测试必须用真实 SQLite

## 文档

- [`docs/pipeline.md`](docs/pipeline.md) — LLM 输出契约、源码追踪、narration 模板、时间轴
- [`docs/frontend-shell.md`](docs/frontend-shell.md) — Stage 路由、`GlobalTopbar`、Studio 布局、Provider 配置
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — 分支策略、Conventional Commits、Hook
- [`CLAUDE.md`](CLAUDE.md) — 架构约束与开发规范
