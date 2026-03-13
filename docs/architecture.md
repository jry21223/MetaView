# 架构设计

## 总体目标

首版工程采用“前端轻渲染 + 后端逻辑编排 + 可替换模型提供者”的分层设计，先把 CIR 驱动链路打通，再逐步接入真实模型和浏览器高性能渲染引擎。

## 模块划分

### `apps/api`

- `PlannerAgent`: 将题目转成结构化 CIR 草案。
- `CoderAgent`: 根据 CIR 生成渲染脚本草案。
- `CriticAgent`: 对 CIR 和脚本进行可视化可读性检查。
- `ProviderRegistry`: 统一管理模型 Provider，当前内置 `mock` provider。
- `PreviewDryRunSandbox`: 对预览脚本执行静态校验与本地 node dry-run。
- `PipelineOrchestrator`: 统一编排 Planner -> Coder -> Critic。

### `apps/web`

- `ControlPanel`: 输入题目、选择领域并发起生成。
- `PreviewCanvas`: 使用 Canvas 读取 CIR 进行即时预览。
- `api/client.ts`: 与后端 API 通信。

## CIR 设计

CIR 当前采用轻量结构：

- `title`: 场景标题
- `domain`: `algorithm` / `math`
- `summary`: 教学摘要
- `steps[]`: 按时间顺序排列的可视化步骤
- `visual_kind`: `array` / `graph` / `formula` / `flow` / `text`
- `tokens[]`: 每一步中需要上屏的核心实体

后续会把该结构扩展为：

- 约束关系
- 时间轴和转场
- 交互事件
- 布局锚点
- 沙盒执行反馈

## 技术演进路线

### 当前版本

- 浏览器原生 Canvas 预览
- FastAPI 编排层
- Mock Provider 抽象
- 预览脚本级 dry-run 沙盒

### 下一版本

- 真实 LLM Provider 适配层
- Docker 干跑沙盒
- RLEF 自修复循环
- WebGPU 渲染器
- 导出与分享能力
