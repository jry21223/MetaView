# MetaView v2 — Claude Code 开发规范

## 项目简介

MetaView v2 是一个教育可视化平台，采用 React + Remotion 帧驱动引擎渲染教学动画。
架构：FastAPI（整洁架构）+ React 19（Feature-Sliced Design）。

## 架构约束（不可违反）

### 后端层级规则
- `presentation/` 只能导入 `application/`
- `application/` 只能导入 `domain/`（通过 ports）
- `domain/` 不得导入任何外部 I/O 依赖
- `infrastructure/` 实现 `application/ports/` 协议，不得被 domain 导入

### 前端 FSD 规则
- `shared/` 不得导入 `features/` 或 `pages/`
- `entities/` 不得导入 `features/`
- `features/` 间禁止互相导入
- `engine/` 内部：`renderers/` 不得导入 `player/` 或 `composition/`

### 渲染管线
- **唯一渲染路径**：CIR → PlaybookScript（后端）→ Remotion Player（前端）
- 禁止引入 Manim、HTML iframe、任何服务端视频渲染

## 开发规范

### 禁止硬编码
- 后端配置：通过 `app/config.py`（`METAVIEW_` 前缀环境变量）
- 前端配置：通过 `shared/config/constants.ts`
- Remotion 尺寸/FPS：从 `PLAYBOOK_DEFAULTS` 常量读取，绝不在组件内写字面量

### 禁止 Mock（测试）
- 集成测试使用真实 SQLite（`:memory:` 可接受）
- 前端 API 测试使用 MSW 拦截网络，禁止 `jest.mock()` 替换模块
- 单元测试：纯函数可直接测试，禁止 mock 业务依赖

### 测试驱动开发
- 先写测试（RED）→ 实现（GREEN）→ 重构（IMPROVE）
- 覆盖率目标 ≥80%
- 后端：pytest；前端：Vitest + @testing-library/react

### Git 存档规范
- 每个原子功能完成后立即 commit
- 格式：`feat/fix/refactor/test/docs: <简短描述>`
- 每个 Phase 完成后打 tag：`v2.0-phase1` ... `v2.0-phase7`

### 交付检查
每次交付前必须全部通过：
```bash
make check  # ruff + eslint + pytest + tsc + vite build
```

## 文件新增约定

### 新增后端服务
1. 在 `domain/services/` 写纯业务逻辑（无 I/O）
2. 在 `application/ports/` 定义接口
3. 在 `infrastructure/` 实现接口
4. 在 `application/use_cases/` 组合

### 新增 Remotion 渲染器
1. 在 `features/playbook/engine/renderers/` 新增 `XxxRenderer.tsx`
2. 在 `renderers/types.ts` 扩展 snapshot 类型（判别联合）
3. 在 `renderers/registry.ts` 注册
4. 在 `domain/models/playbook.py` 对应扩展 Python 类型

### 新增学科领域
1. 在 `domain/models/topic.py` 添加 `TopicDomain` 枚举值
2. 在 `domain/services/skill_catalog.py` 注册
3. 在 `skills/` 添加对应 reference 文件

## 关键文件索引

| 文件 | 用途 |
|------|------|
| `apps/api/app/config.py` | 后端所有配置（METAVIEW_ 前缀） |
| `apps/api/app/domain/models/playbook.py` | PlaybookScript, MetaStep, Snapshot 类型 |
| `apps/api/app/domain/services/playbook_builder.py` | CIR → PlaybookScript 映射 |
| `apps/web/src/shared/config/constants.ts` | 前端所有配置常量 |
| `apps/web/src/features/playbook/engine/types.ts` | 前端 PlaybookScript TS 类型 |
| `apps/web/src/features/playbook/engine/player/PlaybookPlayer.tsx` | Remotion 播放器入口 |
| `apps/web/src/features/playbook/engine/renderers/registry.ts` | 渲染器注册表 |
