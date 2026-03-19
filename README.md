# MetaView

数智化学科可视化平台。

基于特调大模型、学科技能路由、CIR 中间表示和 Web 原生渲染的多学科可视化平台可交付版。

## 当前阶段

- `apps/api`: FastAPI 后端，提供 CIR 规划、多智能体编排、验证修复、历史持久化和运行时目录。
- `apps/web`: React + Vite 前端，提供多学科题目输入、物理题图上传、历史回看、视频预览、自定义代码转换测试和模型提供商管理。
- `skills`: 按学科拆分的 skill 模块，沉淀算法、数学、物理、化学、生物、地理的领域规则。
- `docs`: 架构说明、研发路线和 Git 协作规范。
- `docker-compose.yml`: API + Web 联调与部署入口。

当前版本已经打通完整的可交付链路：

1. 用户输入题目。
2. 选择路由模型、规划/编码模型、dry-run 沙盒模式，并可附带题目图片。
3. 后端先由路由模型自动判断题目所属学科，再把已启用的 subject skill 注入规划/编码模型，生成结构化 CIR，执行验证与自动修复。
4. 后端执行脚本级 dry-run 校验，并持久化任务到 SQLite。
5. 后端输出 Python Manim 脚本并生成 MP4 预览，前端负责播放视频、查看调试信息和回看历史结果。

当前默认启用三个模块：

- `algorithm`
- `math`
- `code`

其他学科规则仍保留在代码里，但默认不加载。可通过环境变量 `ALGO_VIS_ENABLED_DOMAINS` 开启。

## 快速开始

### 1. 初始化环境

```bash
make bootstrap
make bootstrap-manim
npm run setup:git-hooks
cp .env.example .env
```

### 2. 启动后端

```bash
make dev-api
```

默认地址：`http://127.0.0.1:8000`

可用接口：

- `GET /health`
- `GET /api/v1/runtime`
- `POST /api/v1/pipeline`
- `GET /api/v1/runs`
- `GET /api/v1/runs/{request_id}`
- `POST /api/v1/providers/custom`
- `POST /api/v1/providers/custom/test`
- `DELETE /api/v1/providers/custom/{name}`
- `POST /api/v1/manim/prepare`
- `POST /api/v1/manim/render`

### 3. 启动前端

另开一个终端：

```bash
make dev-web
```

默认地址：`http://127.0.0.1:5173`

## 常用命令

```bash
make lint
make test
make build
make check
```

## Docker

```bash
cp .env.example .env
make docker-up
```

启动后：

- Web: `http://127.0.0.1:5173`
- API: `http://127.0.0.1:8000`

## 环境变量

- `ALGO_VIS_ENABLED_DOMAINS`: 当前启用的学科模块，逗号分隔，默认 `algorithm,math`
- `ALGO_VIS_HISTORY_DB_PATH`: SQLite 历史库路径
- `ALGO_VIS_CORS_ORIGIN_REGEX`: 本地联调默认允许的浏览器来源规则
- `ALGO_VIS_DEFAULT_ROUTER_PROVIDER`: 默认路由模型
- `ALGO_VIS_DEFAULT_GENERATION_PROVIDER`: 默认规划/编码模型
- `ALGO_VIS_PREVIEW_RENDER_BACKEND`: `auto`、`manim` 或 `fallback`
- `ALGO_VIS_MANIM_PYTHON_PATH`: 真实渲染时使用的 Python 环境，默认 `.venv-manim/bin/python`
- `ALGO_VIS_MANIM_RENDER_TIMEOUT_S`: 单次 `manim` 渲染超时，默认 180 秒
- `ALGO_VIS_OPENAI_API_KEY`: 启用内置 OpenAI 兼容 Provider
- `ALGO_VIS_OPENAI_BASE_URL`: OpenAI 兼容 API 地址
- `ALGO_VIS_OPENAI_MODEL`: 使用的模型名
- `ALGO_VIS_OPENAI_SUPPORTS_VISION`: 内置 OpenAI 兼容 Provider 是否支持图片输入
- `VITE_API_BASE_URL`: 前端构建时 API 基地址，默认同源

## 自定义 Provider

当前版本支持通过前端面板或 HTTP API 注册自定义 OpenAI 兼容模型提供商，例如本地 `Ollama`、`vLLM` 网关或第三方代理服务。自定义 Provider 会持久化到 SQLite，并自动出现在运行时目录中。

内置 `openai` Provider 继续走环境变量配置；自定义 Provider 则通过 `POST /api/v1/providers/custom` 动态注册。当前 Provider 配置还允许显式声明是否支持视觉输入，这会影响题图是否发送给路由模型和规划模型。

## 学科技能层

当前默认启用 skill：

- `algorithm-process-viz`
- `math-theorem-walkthrough`
- `source-code-algorithm-viz`
- `physics-simulation-viz`
- `molecular-structure-viz`
- `biology-process-viz`
- `geospatial-process-viz`

这些 skill 会作为显式约束注入 Planner / Coder / Critic；仓库中的实现位于 [skills](/Users/jerry/Desktop/demoo/skills)。

其中物理 skill 已支持“静态题目图片 -> 物理建模 -> 动图草案”的首版链路：前端可上传题图，后端会先把对象、约束、已知量和目标量提取成建模提示，再生成符合物理定律的预览流程。

## Manim 特化模型接入

你在开发文档里提到的 Manim 特化模型，目前没有作为内置模型直接打包进项目；当前项目真正用到的是：

- `mock` Provider
- 内置 `openai` 兼容 Provider
- 你自行注册的自定义 OpenAI 兼容 Provider

如果你要接入类似 `prithivMLmods/Pyxidis-Manim-CodeGen-1.7B` 这类 Manim 特化模型，当前正确用法是：

1. 先把该模型部署成 OpenAI 兼容接口，常见方式是 `vLLM`、`LocalAI`、`LM Studio` 或其他带 `/v1/chat/completions` 的服务。
2. 在前端“自定义模型提供商”面板里填写：
   - `Base URL`
   - `Model`
   - `API Key`
   - 是否支持图片
3. 保存后把它选为“规划/编码模型”；路由模型则可以继续使用更便宜的通用模型或 `mock`。

当前系统已经支持双模型编排：

- `router_provider`: 负责学科自动路由
- `generation_provider`: 负责 Planner / Coder / Critic

这意味着你现在就可以把便宜模型留给路由，把 Manim 特化模型专门留给生成链路。

## Runtime Prompt 模块

运行时真正发给 provider 的提示词已拆到独立模块：

- [router.py](/Users/jerry/Desktop/demoo/apps/api/app/services/prompts/router.py)
- [planner.py](/Users/jerry/Desktop/demoo/apps/api/app/services/prompts/planner.py)
- [coder.py](/Users/jerry/Desktop/demoo/apps/api/app/services/prompts/coder.py)
- [critic.py](/Users/jerry/Desktop/demoo/apps/api/app/services/prompts/critic.py)
- [domain_guidance.py](/Users/jerry/Desktop/demoo/apps/api/app/services/prompts/domain_guidance.py)

新增学科或模块时，优先扩展这里，而不是回到 `openai.py` 里写硬编码字符串。

## 自定义 Provider

前端 Provider 面板现已支持：

- 新增
- 编辑
- 删除
- 连通性测试

编辑已有 provider 时，如果 API Key 留空，后端会保留旧 key，不会被空值覆盖。

## 渲染层说明

当前主链路统一产出 Python Manim 脚本，并由后端生成 MP4 预览视频。前端不再承担 `py2ts` 或 `manim-web` 的实时转换职责，而是提供视频播放、原始返回查看和脚本转换测试入口。

真实渲染默认走 `auto` 模式：

- 若 `.venv-manim` 中可用 `manim`，优先使用 `manim-cli` 真渲染。
- 若 `manim` 不可用，则自动降级到 fallback 预览视频。
- 自定义代码测试面板可直接触发“转换并真实渲染”接口。

## 已完成范围

- monorepo、Git hooks、CI、Conventional Commits
- FastAPI 编排层、双模型编排、学科技能注册表、内置与自定义 OpenAI 兼容 Provider 适配
- CIR 校验器、自动修复链路、脚本级 dry-run 沙盒
- SQLite 历史持久化、回放接口与自定义 Provider 存储
- React 工作台、自动学科判断、题图上传、视频预览、运行时视图、历史记录、JSON 导出与代码转换测试
- 算法 / 数学 / 物理 / 化学 / 生物 / 地理 skill 模块
- Docker 化启动入口
