# 架构设计

## 总体目标

当前工程采用“后端视频渲染 + 后端逻辑编排 + 自动学科技能路由 + 双模型提供者”的分层设计，优先保证生成链路稳定，再逐步增强渲染质量与执行反馈。

## 模块划分

### `apps/api`

- `PlannerAgent`: 将题目转成结构化 CIR 草案。
- `CoderAgent`: 根据 CIR 生成渲染脚本草案。
- `CriticAgent`: 对 CIR 和脚本进行可视化可读性检查。
- `DomainRouter`: 根据题目文本和可选题图自动判断学科。
- `SubjectSkillRegistry`: 统一管理算法、数学、物理、化学、生物、地理 skill。
- `ProviderRegistry`: 统一管理内置 Provider 与自定义 OpenAI 兼容 Provider。
- `PipelineOrchestrator`: 将 `router_provider` 与 `generation_provider` 分开编排。
- `PreviewDryRunSandbox`: 对预览脚本执行静态校验与本地 node dry-run。
- `CirValidator` / `PipelineRepairService`: 对 CIR 进行验证与自动修复。
- `RunRepository` / `CustomProviderRepository`: 将任务历史与自定义 Provider 写入 SQLite。
- `PlannerAgent` / `CoderAgent` / `CriticAgent`: 使用 generation provider 的提示结果生成 CIR 与脚本。

### `apps/web`

- `ControlPanel`: 输入题目、上传可选题图并发起生成。
- `App`: 主页优先播放后端生成的 MP4 预览视频，并展示任务状态、原始 LLM 返回与历史记录。
- `ProviderManager`: 管理自定义 OpenAI 兼容 Provider。
- `PromptReferenceTool`: 在网页底部为用户生成新的独立学科 prompt 包，不改写内置 reference。
- `api/client.ts`: 与后端 API 通信。

### `skills`

- `generate-subject-manim-prompts/references/*.md`: 运行时实际读取的 staged 学科 guidance。
- `generate-subject-manim-prompts/scripts/generate_reference_with_llm.py`: 用 LLM 生成或重写学科 guidance 的脚本。
- `generate-subject-manim-prompts/scripts/generate_custom_subject_prompt_with_llm.py`: 用 LLM 为新学科生成独立 prompt 包。

顶层 legacy skill 目录已移除。运行时真正使用的学科元数据定义在
[skill_catalog.py](/Users/jerry/Desktop/demoo/apps/api/app/services/skill_catalog.py)。

## CIR 设计

CIR 当前采用轻量结构：

- `title`: 场景标题
- `domain`: `algorithm` / `math` / `physics` / `chemistry` / `biology` / `geography`
- `summary`: 教学摘要
- `steps[]`: 按时间顺序排列的可视化步骤
- `visual_kind`: `array` / `graph` / `formula` / `flow` / `text` / `motion` / `circuit` / `molecule` / `map` / `cell`
- `tokens[]`: 每一步中需要上屏的核心实体

`PipelineRequest` 允许省略 `domain`，由系统自动判断；也允许附带静态题图，供路由和规划阶段提取对象与约束。
同一请求还支持 `enable_narration`，用于按任务决定是否在视频渲染完成后嵌入 `mimotts-v2` 中文旁白。

当前请求还支持两类模型角色：

- `router_provider`: 专门负责学科路由
- `generation_provider`: 专门负责 Planner / Coder / Critic

保留旧 `provider` 字段作为向后兼容别名，它会自动映射到 `generation_provider`。

后续会把该结构扩展为：

- 约束关系
- 时间轴和转场
- 交互事件
- 布局锚点
- 沙盒执行反馈

## 技术演进路线

### 当前版本

- 后端 MP4 预览渲染
- FastAPI 编排层
- 自动学科判断
- 双模型编排
- 学科技能路由与 staged prompt reference 沉淀
- Mock / OpenAI 兼容 Provider 抽象
- 自定义 Provider 持久化、视觉能力配置与运行时目录
- 物理题图输入与图片辅助建模
- 本地 storyboard 级 dry-run 沙盒
- CIR 验证与自动修复
- SQLite 任务历史

### 下一版本

- Docker 干跑沙盒
- RLEF 自修复循环
- 更底层的 WebGPU 原生渲染适配器
- 导出与分享能力
