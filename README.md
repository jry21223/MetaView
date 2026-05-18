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

数学学科除了逐项代数（数组视图）外，还支持 `visual_kind="function"` —— 在坐标系上画函数曲线、
平移/缩放变换、导数与切线、定积分阴影、三角波等（渲染器 `MathPlotRenderer`，详见 [`docs/pipeline.md` §6](docs/pipeline.md)）。

### 参数面板（ParamPanel）

播放器底部的可折叠**参数面板**采用注册表模式，按 `script.domain` 自动匹配对应学科面板：

| 学科 | 面板 | 功能 |
|------|------|------|
| `algorithm` | `AlgorithmParamPanel` | 可编辑演示数组，支持实时热加载排序回放 |
| `math` | `MathParamPanel` | 预设曲线 + 参数滑块 + KaTeX 公式 + 函数图 |

新增学科只需在 `engine/param-panels/registry.ts` 注册即可，无需修改播放器或页面代码。
速度控制与字幕开关为播放器级共享控件，不属于各学科面板。

算法渲染器新增**柱状视图**（`algorithm_bars`）：数值输入自动切换为高度编码的 2D 柱形图，
颜色跟随系统主题 CSS 变量，支持冒泡 / 快排 / 插入 / 选择四种排序逐步回放。
代码高亮新增 Rust 语法支持（`/* */` 块注释 + 关键词着色）。

历史记录页现在展示每次运行的**原始提示词**（`prompt` 字段），方便对比不同输入的输出差异。

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

## 播放器键盘快捷键

| 按键 | 功能 |
|------|------|
| `Space` | 播放 / 暂停 |
| `←` / `→` | 上一步 / 下一步 |
| `R` | 重置到第一步 |
| `T` | 开启 / 关闭 TTS 朗读 |
| `S` | 显示 / 隐藏字幕 |
| `+` / `=` | 加速（0.5 × → 0.75 × → 1 × → 1.25 × → 1.5 × → 2 ×） |
| `-` | 减速 |
| `E` | 打开导出面板 |
| `Esc` | 关闭 TTS 配置弹窗 |

## 检查

```bash
make lint    # ruff + eslint
make test    # pytest
make build   # vite build
make check   # 上面三步串联
```

## API 端点

| Method | Path | 说明 |
|--------|------|------|
| `POST` | `/api/v1/pipeline` | 提交题目，返回 `run_id`（202） |
| `GET`  | `/api/v1/runs` | 历史列表（含 `prompt` 字段） |
| `GET`  | `/api/v1/runs/{run_id}` | 单次运行结果（含 PlaybookScript + `prompt`） |
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
| `METAVIEW_OPENAI_MAX_TOKENS` | `16000` | chat/completions 的 `max_tokens`；CIR 长脚本需要这么大，被截断会触发 `_regenerate` |
| `METAVIEW_OPENAI_REASONING_EFFORT` | – | gpt-5 / o-series 专用 (`minimal\|low\|medium\|high`)，其它服务商留空 |
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

- [`docs/pipeline.md`](docs/pipeline.md) — LLM 输出契约（含 CIR 步数 / 思考时长调参）、源码追踪、narration 模板、时间轴、**视频导出管线**
- [`docs/frontend-shell.md`](docs/frontend-shell.md) — Stage 路由、`GlobalTopbar`、Studio 布局、Provider 配置
- [`docs/remotion-skills.md`](docs/remotion-skills.md) — Remotion 组件 / 渲染器 / 注册表约定
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — 分支策略、Conventional Commits、Hook
- [`CLAUDE.md`](CLAUDE.md) — 架构约束与开发规范
