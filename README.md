# 数智化算法可视化平台

基于特调大模型、CIR 中间表示和 Web 原生渲染的算法/高数可视化平台首版工程骨架。

## 当前阶段

- `apps/api`: FastAPI 后端，提供 CIR 规划、多智能体编排和前端预览脚本输出。
- `apps/web`: React + Vite 前端，提供题目输入、流水线结果展示和 Canvas 可视化预览。
- `docs`: 架构说明、研发路线和 Git 协作规范。

当前实现的是可运行 MVP：

1. 用户输入算法或数学题目。
2. 后端生成结构化 CIR。
3. 后端输出渲染脚本草案和诊断信息。
4. 前端用浏览器原生 Canvas 对 CIR 进行即时可视化预览。

## 快速开始

### 1. 初始化环境

```bash
make bootstrap
npm run setup:git-hooks
```

### 2. 启动后端

```bash
make dev-api
```

默认地址：`http://127.0.0.1:8000`

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

## 下一阶段

- 接入真实 LLM Provider 和多智能体编排器。
- 将当前 Canvas 预览升级为 manim-web / WebGPU 渲染适配层。
- 引入沙盒 dry-run、执行反馈与 RLEF 闭环。
- 建立题库、CIR 评测集和可视化回归测试。

