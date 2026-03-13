# 架构设计

## 总体目标

当前工程采用“前端正式渲染 + 后端逻辑编排 + 学科技能路由 + 可替换模型提供者”的分层设计，先把 CIR 驱动链路、浏览器实时渲染、学科技能层和 Provider 管理链路打通，再逐步接入更强的执行反馈与渲染后端。

## 模块划分

### `apps/api`

- `PlannerAgent`: 将题目转成结构化 CIR 草案。
- `CoderAgent`: 根据 CIR 生成渲染脚本草案。
- `CriticAgent`: 对 CIR 和脚本进行可视化可读性检查。
- `SubjectSkillRegistry`: 统一管理算法、数学、物理、化学、生物、地理 skill。
- `ProviderRegistry`: 统一管理内置 Provider 与自定义 OpenAI 兼容 Provider。
- `PreviewDryRunSandbox`: 对预览脚本执行静态校验与本地 node dry-run。
- `CirValidator` / `PipelineRepairService`: 对 CIR 进行验证与自动修复。
- `RunRepository` / `CustomProviderRepository`: 将任务历史与自定义 Provider 写入 SQLite。
- `PipelineOrchestrator`: 统一编排 Planner -> Coder -> Critic。

### `apps/web`

- `ControlPanel`: 输入题目、选择学科、上传物理题图并发起生成。
- `PreviewCanvas`: 使用 `manim-web` 正式渲染 CIR 预览，并展示 WebGPU 能力检测与 skill 标识。
- `ProviderManager`: 管理自定义 OpenAI 兼容 Provider。
- `api/client.ts`: 与后端 API 通信。

### `skills`

- `algorithm-process-viz`
- `math-theorem-walkthrough`
- `physics-simulation-viz`
- `molecular-structure-viz`
- `biology-process-viz`
- `geospatial-process-viz`

## CIR 设计

CIR 当前采用轻量结构：

- `title`: 场景标题
- `domain`: `algorithm` / `math` / `physics` / `chemistry` / `biology` / `geography`
- `summary`: 教学摘要
- `steps[]`: 按时间顺序排列的可视化步骤
- `visual_kind`: `array` / `graph` / `formula` / `flow` / `text` / `motion` / `circuit` / `molecule` / `map` / `cell`
- `tokens[]`: 每一步中需要上屏的核心实体

对物理 domain，`PipelineRequest` 还允许附带静态题图，供规划阶段提取对象和约束。

后续会把该结构扩展为：

- 约束关系
- 时间轴和转场
- 交互事件
- 布局锚点
- 沙盒执行反馈

## 技术演进路线

### 当前版本

- `manim-web` / `three.js` 浏览器正式预览
- FastAPI 编排层
- 学科技能路由与 skill 文件沉淀
- Mock / OpenAI 兼容 Provider 抽象
- 自定义 Provider 持久化与运行时目录
- 物理题图输入与图片辅助建模
- 预览脚本级 dry-run 沙盒
- CIR 验证与自动修复
- SQLite 任务历史

### 下一版本

- Docker 干跑沙盒
- RLEF 自修复循环
- 更底层的 WebGPU 原生渲染适配器
- 导出与分享能力
