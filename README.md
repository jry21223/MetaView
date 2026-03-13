# 数智化学科可视化平台

基于特调大模型、学科技能路由、CIR 中间表示和 Web 原生渲染的多学科可视化平台可交付版。

## 当前阶段

- `apps/api`: FastAPI 后端，提供 CIR 规划、多智能体编排、验证修复、历史持久化和运行时目录。
- `apps/web`: React + Vite 前端，提供多学科题目输入、物理题图上传、历史回看、运行时展示、`manim-web` 正式预览和自定义模型提供商管理。
- `skills`: 按学科拆分的 skill 模块，沉淀算法、数学、物理、化学、生物、地理的领域规则。
- `docs`: 架构说明、研发路线和 Git 协作规范。
- `docker-compose.yml`: API + Web 联调与部署入口。

当前版本已经打通完整的可交付链路：

1. 用户输入算法、数学、物理、化学、生物或地理题目。
2. 选择模型 Provider、dry-run 沙盒模式，并可在物理题中附带静态题目图片。
3. 后端按学科路由到对应 skill，生成结构化 CIR，执行验证与自动修复。
4. 后端执行脚本级 dry-run 校验，并持久化任务到 SQLite。
5. 前端用 `manim-web` 在浏览器内完成正式预览，并支持历史回看、JSON 导出和 WebGPU 能力检测。

## 快速开始

### 1. 初始化环境

```bash
make bootstrap
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
- `DELETE /api/v1/providers/custom/{name}`

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

- `ALGO_VIS_HISTORY_DB_PATH`: SQLite 历史库路径
- `ALGO_VIS_CORS_ORIGIN_REGEX`: 本地联调默认允许的浏览器来源规则
- `ALGO_VIS_OPENAI_API_KEY`: 启用内置 OpenAI 兼容 Provider
- `ALGO_VIS_OPENAI_BASE_URL`: OpenAI 兼容 API 地址
- `ALGO_VIS_OPENAI_MODEL`: 使用的模型名
- `VITE_API_BASE_URL`: 前端构建时 API 基地址，默认同源

## 自定义 Provider

当前版本支持通过前端面板或 HTTP API 注册自定义 OpenAI 兼容模型提供商，例如本地 `Ollama`、`vLLM` 网关或第三方代理服务。自定义 Provider 会持久化到 SQLite，并自动出现在运行时目录中。

内置 `openai` Provider 继续走环境变量配置；自定义 Provider 则通过 `POST /api/v1/providers/custom` 动态注册。

## 学科技能层

当前内置 skill：

- `algorithm-process-viz`
- `math-theorem-walkthrough`
- `physics-simulation-viz`
- `molecular-structure-viz`
- `biology-process-viz`
- `geospatial-process-viz`

这些 skill 会作为显式约束注入 Planner / Coder / Critic；仓库中的实现位于 [skills](/Users/jerry/Desktop/demoo/skills)。

其中物理 skill 已支持“静态题目图片 -> 物理建模 -> 动图草案”的首版链路：前端可上传题图，后端会先把对象、约束、已知量和目标量提取成建模提示，再生成符合物理定律的预览流程。

## 渲染层说明

前端正式渲染层已经替换为 `manim-web`。当前运行时实际由 `three.js` 承载，并在界面上展示浏览器 `WebGPU` 能力检测结果；这意味着用户能直接在浏览器里获得交互式预览，而不必先走后端视频合成链路。

## 已完成范围

- monorepo、Git hooks、CI、Conventional Commits
- FastAPI 编排层、学科技能注册表、内置与自定义 OpenAI 兼容 Provider 适配
- CIR 校验器、自动修复链路、脚本级 dry-run 沙盒
- SQLite 历史持久化、回放接口与自定义 Provider 存储
- React 工作台、物理题图上传、`manim-web` 预览、运行时视图、历史记录与 JSON 导出
- 算法 / 数学 / 物理 / 化学 / 生物 / 地理 skill 模块
- Docker 化启动入口
