# Agent Team 开发任务

## 任务：MetaView ManimCat 架构集成开发

**创建时间**: 2026-03-19 23:45  
**优先级**: 高  
**分支**: `feat/manimcat-style-architecture`  
**状态**: 进行中

---

## 📋 任务列表

### 1. 集成概念设计到 Pipeline 🔴

**文件**: `apps/api/app/services/orchestrator.py`

- [ ] 导入新模块:
  ```python
  from app.services.concept_design import ConceptDesigner
  from app.services.code_generation import CodeGenerator
  from app.services.manim_executor import ManimExecutor
  from app.services.process_registry import ProcessRegistry
  ```

- [ ] 在 `__init__` 中初始化:
  ```python
  self.concept_designer = ConceptDesigner()
  self.code_generator = CodeGenerator()
  self.manim_executor = ManimExecutor()
  self.process_registry = ProcessRegistry()
  ```

- [ ] 在 `run()` 方法中集成两阶段生成流程

---

### 2. 编写单元测试 🟡

**目录**: `apps/api/tests/`

- [ ] `test_concept_design.py`
  - 测试概念提取
  - 测试场景设计
  - 测试学科检测

- [ ] `test_code_generation.py`
  - 测试代码框架生成
  - 测试场景代码生成
  - 测试代码验证

- [ ] `test_queue_processor.py`
  - 测试任务提交
  - 测试并发控制
  - 测试优先级队列

- [ ] `test_manim_executor.py`
  - 测试脚本执行
  - 测试超时处理
  - 测试资源清理

- [ ] `test_process_registry.py`
  - 测试过程创建
  - 测试状态更新
  - 测试过程回放

---

### 3. 更新 API 接口 🟡

**文件**: `apps/api/app/main.py`

- [ ] `POST /api/v1/concept/design` - 概念设计接口
- [ ] `POST /api/v1/code/generate` - 代码生成接口
- [ ] `GET /api/v1/tasks` - 任务列表
- [ ] `GET /api/v1/tasks/{task_id}` - 任务详情
- [ ] `POST /api/v1/tasks` - 创建任务
- [ ] `GET /api/v1/process` - 过程列表
- [ ] `GET /api/v1/process/{process_id}` - 过程详情
- [ ] `GET /api/v1/process/{process_id}/replay` - 过程回放

---

### 4. 前端集成 🟢

**目录**: `apps/web/src/`

- [ ] `pages/TaskQueue.tsx` - 任务队列页面
- [ ] `pages/ProcessReplay.tsx` - 过程回放页面
- [ ] 更新 `pages/Pipeline.tsx` 支持新概念设计
- [ ] 添加 API 调用函数到 `src/api/client.ts`

---

### 5. 配置与文档 🟢

- [ ] 更新 `.env.example`
  ```bash
  # 概念设计
  ALGO_VIS_CONCEPT_MODEL=gpt-5.3-codex
  ALGO_VIS_CONCEPT_TEMPERATURE=0.7
  
  # 代码生成
  ALGO_VIS_CODEGEN_MODEL=gpt-5.3-codex-high
  ALGO_VIS_CODEGEN_TEMPERATURE=0.3
  
  # 队列处理
  ALGO_VIS_MAX_CONCURRENT_TASKS=3
  ALGO_VIS_MAX_QUEUE_SIZE=100
  
  # Manim 执行
  ALGO_VIS_MANIM_QUALITY=h
  ALGO_VIS_MANIM_TIMEOUT_S=180
  
  # 过程记录
  ALGO_VIS_PROCESS_STORAGE_PATH=./data/processes
  ```

- [ ] 更新 `README.md` 添加新模块说明

- [ ] 编写 `docs/API.md` API 文档

---

## ⚠️ 重要提醒

1. **分支要求**: 必须在 `feat/manimcat-style-architecture` 分支开发
2. **不要修改**: main 分支保持原样
3. **提交规范**: 使用 Conventional Commits
4. **测试覆盖**: 新功能必须包含测试

---

## 📊 进度追踪

| 模块 | 状态 | 完成度 |
|------|------|--------|
| 概念设计集成 | ⏳ 待开始 | 0% |
| 代码生成集成 | ⏳ 待开始 | 0% |
| 单元测试 | ⏳ 待开始 | 0% |
| API 接口 | ⏳ 待开始 | 0% |
| 前端集成 | ⏳ 待开始 | 0% |
| 文档配置 | ⏳ 待开始 | 0% |

**总体进度**: 0%

---

## 🔗 相关链接

- **项目路径**: `/home/jerry/.openclaw/workspace/metaview`
- **分支**: `feat/manimcat-style-architecture`
- **参考架构**: [ManimCat](https://github.com/Wing900/ManimCat)
- **架构文档**: `docs/MANIMCAT_ARCH_UPDATE.md`
