# 数智化算法可视化平台

基于特调大模型、CIR 中间表示和 Web 原生渲染的算法/高数可视化平台可交付版。

## 当前阶段

- `apps/api`: FastAPI 后端，提供 CIR 规划、多智能体编排、验证修复、历史持久化和运行时目录。
- `apps/web`: React + Vite 前端，提供题目输入、历史回看、导出、运行时展示和 Canvas 可视化预览。
- `docs`: 架构说明、研发路线和 Git 协作规范。
- `docker-compose.yml`: API + Web 联调与部署入口。

当前版本已经打通完整的可交付链路：

1. 用户输入算法或数学题目。
2. 选择模型 Provider 与 dry-run 沙盒模式。
3. 后端生成结构化 CIR，执行验证与自动修复。
4. 后端执行脚本级 dry-run 校验，并持久化任务到 SQLite。
5. 前端用浏览器原生 Canvas 做即时预览，并支持历史回看与 JSON 导出。

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
- `ALGO_VIS_OPENAI_API_KEY`: 启用 OpenAI 兼容 Provider
- `ALGO_VIS_OPENAI_BASE_URL`: OpenAI 兼容 API 地址
- `ALGO_VIS_OPENAI_MODEL`: 使用的模型名
- `VITE_API_BASE_URL`: 前端构建时 API 基地址，默认同源

## 已完成范围

- monorepo、Git hooks、CI、Conventional Commits
- FastAPI 编排层、Provider 注册表、OpenAI 兼容 Provider 适配位
- CIR 校验器、自动修复链路、脚本级 dry-run 沙盒
- SQLite 历史持久化与回放接口
- React 工作台、运行时视图、历史记录与 JSON 导出
- Docker 化启动入口
