# 开发文档

先读：[`START_HERE.md`](./START_HERE.md)。它是当前主线入口，用来判断 MetaView 的产品定位、默认部署 profile、Director/Playbook 边界和下一步开发优先级。

状态说明：

- `Active`：当前实现、开发约束或主路径说明。
- `Planning`：近期实现计划或待补齐的范围边界。
- `ADR`：已采纳的架构决策记录。
- `Eval`：评估、验收或人工复核流程。
- `Reference`：专项参考、素材规范或教学说明。
- `Archive`：历史迁移记录或非当前主线资料，默认不作为新实现入口。

## Active

| 文档 | 内容 |
|------|------|
| [START_HERE.md](./START_HERE.md) | 当前唯一入门入口：产品主线、部署默认、Director/Playbook 边界、下一步优先级 |
| [director-layer.md](./director-layer.md) | Director 独立导演层：运镜、节奏、镜头、强调、RenderPlan 和阶段路线 |
| [pipeline.md](./pipeline.md) | single / agent 生成路径、PlaybookScript、DirectorScript 挂载点、视频导出管线 |
| [quality-gate.md](./quality-gate.md) | 后端 Canonical QualityReport、修复、持久化、Director 与导出阻断语义 |
| [frontend-shell.md](./frontend-shell.md) | Stage 路由、GlobalTopbar、Studio 布局、Provider 配置、snapshot support levels |
| [animation-tool-registry.md](./animation-tool-registry.md) | 后端 animation tool registry 的扩展流程、当前工具和新增规则 |
| [topic-routing.md](./topic-routing.md) | topic routing 模式、自动路由、显式 domain 和 skill override |
| [remotion-skills.md](./remotion-skills.md) | Remotion 组件、渲染器、注册表和音频同步约定 |
| [skill-pack-architecture.md](./skill-pack-architecture.md) | SkillPack 核心契约、registry、routing 和首个实现边界 |
| [skill-pack-authoring.md](./skill-pack-authoring.md) | SkillPack 包结构、manifest、执行契约和 renderer contract |

## Planning

| 文档 | 内容 |
|------|------|
| [mobile-web.md](./mobile-web.md) | 移动端 Web 首发范围、暂不支持项和 QA 视口；非当前收敛主线 |
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
| [benchmark-v2.md](./benchmark-v2.md) | 四个 Gold Case、六维评分、稳定性统计与 recorded/live 命令 |

## Reference

| 文档 | 内容 |
|------|------|
| [solid-geometry-skill.md](./solid-geometry-skill.md) | 立体几何 deterministic skill pack：ProblemSpec、SymPy kernel、Playbook snapshot 与 V1 范围 |
| [skill-sources.md](./skill-sources.md) | 学科 skill 来源、版权边界和 fixture 选取规则 |
| [math-scene-object-identity.md](./math-scene-object-identity.md) | Math scene 对象标识优先级、fallback 和重复 warning |
| [brand-logo.md](./brand-logo.md) | MetaView logo 资源、颜色和使用禁忌 |

## Archive

| 文档 | 内容 |
|------|------|
| [newapi-metaview-topup-integration.md](./newapi-metaview-topup-integration.md) | NewAPI 充值桥接说明；商业/集成历史资料，非当前生成/导演主线 |
| [archive/payment/payment-epay-migration.md](./archive/payment/payment-epay-migration.md) | MetaView 充值链路（微信 APIv3 -> EasyPay）迁移记录，主路径已完成迁移 |

## Repository Docs

| 文档 | 内容 |
|------|------|
| [../README.md](../README.md) | 项目入口、快速开始、配置、开发约束和关键文件 |
| [../CONTRIBUTING.md](../CONTRIBUTING.md) | 分支策略、Conventional Commits、提交流程和本地 hook |
| [../AGENTS.md](../AGENTS.md) | coding agent 工作规则、worktree 保护、ignore 纪律和验证要求 |
| [../apps/api/app/domain/skills/solid_geometry/README.md](../apps/api/app/domain/skills/solid_geometry/README.md) | `solid_geometry` skill-local 范围、文件结构、ProblemSpec 和 kernel 规则 |
