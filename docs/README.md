# 开发文档

状态说明：

- `Active`：当前实现、开发约束或主路径说明。
- `Planning`：近期实现计划或待补齐的范围边界。
- `ADR`：已采纳的架构决策记录。
- `Eval`：评估、验收或人工复核流程。
- `Reference`：专项参考、素材规范或教学说明。
- `Archive`：历史迁移记录，默认不作为新实现入口。

## Active

| 文档 | 内容 |
|------|------|
| [pipeline.md](./pipeline.md) | single / agent 生成路径、PlaybookScript 渲染出口、思考时长调参、视频导出管线 |
| [frontend-shell.md](./frontend-shell.md) | Stage 路由、GlobalTopbar、Studio 布局、Provider 配置、snapshot support levels |
| [mobile-web.md](./mobile-web.md) | 移动端 Web 首发范围、暂不支持项和 QA 视口 |
| [animation-tool-registry.md](./animation-tool-registry.md) | 后端 animation tool registry 的扩展流程、当前工具和新增规则 |
| [topic-routing.md](./topic-routing.md) | topic routing 模式、自动路由、显式 domain 和 skill override |
| [remotion-skills.md](./remotion-skills.md) | Remotion 组件、渲染器、注册表和音频同步约定 |
| [solid-geometry-skill.md](./solid-geometry-skill.md) | 立体几何 deterministic skill pack：ProblemSpec、SymPy kernel、Playbook snapshot 与 V1 范围 |
| [skill-pack-architecture.md](./skill-pack-architecture.md) | SkillPack 核心契约、registry、routing 和首个实现边界 |
| [skill-pack-authoring.md](./skill-pack-authoring.md) | SkillPack 包结构、manifest、执行契约和 renderer contract |
| [newapi-metaview-topup-integration.md](./newapi-metaview-topup-integration.md) | NewAPI 真实站点兼容 MetaView 充值的 signed intent / receipt / quota 入账接入说明 |

## Planning

| 文档 | 内容 |
|------|------|
| [skill-development-roadmap.md](./skill-development-roadmap.md) | 当前 deterministic SkillPack 注册状态、维护优先级、每个 skill 的 gate 和 deferred renderer work |

## ADR

| 文档 | 内容 |
|------|------|
| [adr/agent-pipeline-unification.md](./adr/agent-pipeline-unification.md) | 统一 AgentPipeline 的上下文、决策、迁移策略和后果 |
| [adr/agent-pipeline-boundary-followup.md](./adr/agent-pipeline-boundary-followup.md) | AgentPipeline 边界后续迁移状态、决策和下一步 |

## Eval

| 文档 | 内容 |
|------|------|
| [agent-demo-acceptance.md](./agent-demo-acceptance.md) | AgentPipeline / runtime-tool demo 的最小验收证据和失败排查 |
| [generation-review-workflow.md](./generation-review-workflow.md) | 本地和远端 generation review API 调用与输出位置 |
| [skill-ab-eval.md](./skill-ab-eval.md) | Prompt-only 对比、真实 LLM 手工评估、输出和限制 |

## Reference

| 文档 | 内容 |
|------|------|
| [skill-sources.md](./skill-sources.md) | 学科 skill 来源、版权边界和 fixture 选取规则 |
| [math-scene-object-identity.md](./math-scene-object-identity.md) | Math scene 对象标识优先级、fallback 和重复 warning |
| [brand-logo.md](./brand-logo.md) | MetaView logo 资源、颜色和使用禁忌 |
| [html-css-implementation.md](./html-css-implementation.md) | HTML 中 CSS 的三种写法、选择器、盒模型、Flex 示例和项目内对应关系 |

## Archive

| 文档 | 内容 |
|------|------|
| [archive/payment/payment-epay-migration.md](./archive/payment/payment-epay-migration.md) | MetaView 充值链路（微信 APIv3 -> EasyPay）迁移记录，主路径已完成迁移 |

## Repository Docs

| 文档 | 内容 |
|------|------|
| [../README.md](../README.md) | 项目入口、快速开始、配置、开发约束和关键文件 |
| [../CONTRIBUTING.md](../CONTRIBUTING.md) | 分支策略、Conventional Commits、提交流程和本地 hook |
| [../AGENTS.md](../AGENTS.md) | coding agent 工作规则、worktree 保护、ignore 纪律和验证要求 |
| [../apps/api/app/domain/skills/solid_geometry/README.md](../apps/api/app/domain/skills/solid_geometry/README.md) | `solid_geometry` skill-local 范围、文件结构、ProblemSpec 和 kernel 规则 |
