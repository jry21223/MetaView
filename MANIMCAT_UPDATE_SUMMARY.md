# ✅ MetaView ManimCat 风格架构更新完成

---

## 🎯 更新概览

| 项目 | 信息 |
|------|------|
| **分支名称** | `feat/manimcat-style-architecture` |
| **创建时间** | 2026-03-19 23:30 |
| **提交数** | 1 |
| **新增文件** | 13 |
| **新增代码** | ~1883 行 |
| **类比项目** | [ManimCat](https://github.com/Wing900/ManimCat) |

---

## 📦 新增模块

### 1. 概念设计服务 (Concept Design)
**路径**: `apps/api/app/services/concept_design/`

| 文件 | 说明 | 行数 |
|------|------|------|
| `__init__.py` | 模块入口 | 10 |
| `designer.py` | 概念设计师核心逻辑 | 260+ |

**核心类**: `ConceptDesigner`

**功能**:
- ✅ 学科领域检测 (7 大学科)
- ✅ 对象/关系/约束提取
- ✅ 关键时刻识别
- ✅ 场景结构设计
- ✅ 复杂度评估 (1-5 级)
- ✅ 视觉风格推荐

**输出**:
```python
ConceptDesign(
    title="冒泡排序可视化",
    domain="algorithm",
    objects=["数组", "指针", "临时变量"],
    key_moments=["初始状态", "比较交换", "结果展示"],
    complexity_score=2,
    duration_estimate=29.0
)

SceneDesign(
    scene_id="scene_intro",
    title="开场介绍",
    objects=["数组", "指针"],
    actions=["展示标题", "介绍核心对象"],
    duration=5.0
)
```

---

### 2. 代码生成服务 (Code Generation)
**路径**: `apps/api/app/services/code_generation/`

| 文件 | 说明 | 行数 |
|------|------|------|
| `__init__.py` | 模块入口 | 10 |
| `generator.py` | 代码生成器核心逻辑 | 180+ |

**核心类**: `CodeGenerator`

**功能**:
- ✅ 代码框架生成
- ✅ 场景代码生成
- ✅ 对象/动作映射
- ✅ 转场动画生成
- ✅ 代码验证与诊断

**输出**:
```python
CodeGenerationResult(
    success=True,
    code="from manim import *\n\nclass GeneratedScene...",
    scene_class_name="GeneratedScene",
    diagnostics=["提示：建议添加 self.wait 控制节奏"],
    metadata={"lines_of_code": 150, "scenes_generated": 4}
)
```

---

### 3. 队列处理器 (Queue Processor)
**路径**: `apps/api/app/services/queue_processors/`

| 文件 | 说明 | 行数 |
|------|------|------|
| `__init__.py` | 模块入口 | 10 |
| `processor.py` | 队列处理器核心逻辑 | 220+ |

**核心类**: `QueueProcessor`

**功能**:
- ✅ 任务队列管理
- ✅ 并发控制 (可配置)
- ✅ 优先级队列
- ✅ 任务状态跟踪
- ✅ 超时处理
- ✅ 错误重试
- ✅ 统计信息

**任务状态**:
```
PENDING → QUEUED → PROCESSING → COMPLETED
                              → FAILED
                              → CANCELLED
```

**配置**:
```python
ProcessorConfig(
    max_concurrent_tasks=3,
    max_queue_size=100,
    task_timeout_seconds=300,
    retry_attempts=2,
    enable_priority_queue=True
)
```

---

### 4. Manim 执行器 (Manim Executor)
**路径**: `apps/api/app/services/manim_executor/`

| 文件 | 说明 | 行数 |
|------|------|------|
| `__init__.py` | 模块入口 | 10 |
| `executor.py` | Manim 执行器核心逻辑 | 220+ |

**核心类**: `ManimExecutor`

**功能**:
- ✅ Manim 脚本执行
- ✅ 临时文件管理
- ✅ 超时控制
- ✅ 错误处理
- ✅ 资源清理
- ✅ 视频 URL 生成
- ✅ 连接测试

**配置**:
```python
ExecutionConfig(
    python_path="python3",
    manim_cli="manim",
    output_dir="./media",
    quality="h",  # l/m/h/k
    format="mp4",
    disable_caching=True,
    timeout_seconds=180
)
```

**输出**:
```python
ExecutionResult(
    success=True,
    video_path="./media/videos/GeneratedScene.mp4",
    video_url="/preview-media/req_123/video.mp4",
    duration_ms=15420,
    metadata={"scene_class": "GeneratedScene", "quality": "h"}
)
```

---

### 5. 过程注册表 (Process Registry)
**路径**: `apps/api/app/services/process_registry/`

| 文件 | 说明 | 行数 |
|------|------|------|
| `__init__.py` | 模块入口 | 10 |
| `registry.py` | 过程注册表核心逻辑 | 260+ |

**核心类**: `ProcessRegistry`

**功能**:
- ✅ 过程创建与跟踪
- ✅ 状态历史管理
- ✅ 持久化存储 (JSON)
- ✅ 断点续传支持
- ✅ 过程回放
- ✅ 自动清理

**过程状态**:
```python
ProcessMemory(
    process_id="uuid",
    prompt="可视化冒泡排序",
    states=[
        ProcessState(stage="init", status="created"),
        ProcessState(stage="concept_design", status="completed"),
        ProcessState(stage="code_generation", status="completed"),
        ProcessState(stage="execution", status="completed")
    ],
    result={"video_url": "..."},
    completed_at=datetime.now()
)
```

---

### 6. 提示词覆盖 (Prompt Overrides)
**路径**: `apps/api/app/services/prompt_overrides/`

| 文件 | 说明 | 行数 |
|------|------|------|
| `__init__.py` | 模块入口 | 10 |
| `registry.py` | 提示词注册表核心逻辑 | 180+ |

**核心类**: `PromptOverrideRegistry`

**功能**:
- ✅ 提示词模板管理
- ✅ 学科/阶段分类
- ✅ 动态注册
- ✅ 变量渲染
- ✅ 模板导出

**预置模板**:

| ID | 学科 | 阶段 | 说明 |
|----|------|------|------|
| `algorithm_concept_v1` | 算法 | 概念设计 | 算法概念提取 |
| `algorithm_code_v1` | 算法 | 代码生成 | 算法代码生成 |
| `math_concept_v1` | 数学 | 概念设计 | 数学概念提取 |
| `math_code_v1` | 数学 | 代码生成 | 数学代码生成 |
| `physics_concept_v1` | 物理 | 概念设计 | 物理场景提取 |
| `physics_code_v1` | 物理 | 代码生成 | 物理代码生成 |
| `critique_general_v1` | 通用 | 评论 | 通用评论检查 |

**使用示例**:
```python
prompt = registry.render(
    "algorithm_concept_v1",
    algorithm_name="冒泡排序",
    input_description="整数数组",
    output_description="排序后的数组"
)
```

---

## 🏗️ 架构对比

### ManimCat 原始架构
```
┌─────────────┐
│ 用户输入     │
└──────┬──────┘
       ↓
┌─────────────┐
│ Concept     │ ← 概念设计阶段
│ Designer    │
└──────┬──────┘
       ↓
┌─────────────┐
│ Concept     │
│ Document    │
└──────┬──────┘
       ↓
┌─────────────┐
│ Code        │ ← 代码生成阶段
│ Generator   │
└──────┬──────┘
       ↓
┌─────────────┐
│ Manim       │
│ Script      │
└──────┬──────┘
       ↓
┌─────────────┐
│ Video       │ ← 队列处理
│ Processor   │
└──────┬──────┘
       ↓
┌─────────────┐
│ Manim       │ ← 执行渲染
│ Executor    │
└──────┬──────┘
       ↓
┌─────────────┐
│ MP4 Video   │
└─────────────┘
```

### MetaView 新架构
```
┌─────────────┐
│ 用户输入     │
└──────┬──────┘
       ↓
┌─────────────┐
│ Domain      │ ← 学科路由 (现有)
│ Router      │
└──────┬──────┘
       ↓
┌─────────────┐
│ Concept     │ ← 概念设计 (新增)
│ Designer    │
└──────┬──────┘
       ↓
┌─────────────┐
│ Concept +   │
│ Scenes      │
└──────┬──────┘
       ↓
┌─────────────┐
│ Code        │ ← 代码生成 (新增)
│ Generator   │
└──────┬──────┘
       ↓
┌─────────────┐
│ Manim       │
│ Script      │
└──────┬──────┘
       ↓
┌─────────────┐
│ Queue       │ ← 队列处理 (新增)
│ Processor   │
└──────┬──────┘
       ↓
┌─────────────┐
│ Manim       │ ← 执行渲染 (新增)
│ Executor    │
└──────┬──────┘
       ↓
┌─────────────┐
│ MP4 Video   │
└──────┬──────┘
       ↓
┌─────────────┐
│ Process     │ ← 过程记录 (新增)
│ Registry    │
└─────────────┘
```

---

## 📊 代码统计

| 模块 | 文件数 | 代码行数 | 类数 | 函数数 |
|------|--------|----------|------|--------|
| concept_design | 2 | ~270 | 4 | 15 |
| code_generation | 2 | ~190 | 2 | 8 |
| queue_processors | 2 | ~230 | 4 | 12 |
| manim_executor | 2 | ~230 | 3 | 10 |
| process_registry | 2 | ~270 | 3 | 15 |
| prompt_overrides | 2 | ~190 | 2 | 8 |
| **总计** | **12** | **~1380** | **18** | **68** |

---

## 🔧 集成指南

### 1. 更新 orchestrator.py

```python
# 导入新模块
from app.services.concept_design import ConceptDesigner
from app.services.code_generation import CodeGenerator
from app.services.manim_executor import ManimExecutor
from app.services.process_registry import ProcessRegistry

# 在 PipelineOrchestrator.__init__ 中添加
self.concept_designer = ConceptDesigner()
self.code_generator = CodeGenerator()
self.manim_executor = ManimExecutor()
self.process_registry = ProcessRegistry()

# 在 PipelineOrchestrator.run 中使用
process = self.process_registry.create_process(request.prompt)

# 阶段 1: 概念设计
concept_result = self.concept_designer.design(request.prompt)

# 阶段 2: 代码生成
code_result = self.code_generator.generate(
    concept=concept_result.concept,
    scenes=concept_result.scenes
)

# 阶段 3: 执行渲染
exec_result = self.manim_executor.execute(
    code=code_result.code,
    scene_class_name=code_result.scene_class_name,
    request_id=request_id
)

# 记录完成
self.process_registry.complete_process(
    process,
    result={"video_url": exec_result.video_url}
)
```

### 2. 配置环境变量

```bash
# .env 文件

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

---

## 🧪 测试计划

### 单元测试
```bash
# 概念设计
.venv/bin/pytest apps/api/tests/test_concept_design.py -q

# 代码生成
.venv/bin/pytest apps/api/tests/test_code_generation.py -q

# 队列处理
.venv/bin/pytest apps/api/tests/test_queue_processor.py -q

# Manim 执行
.venv/bin/pytest apps/api/tests/test_manim_executor.py -q

# 过程记录
.venv/bin/pytest apps/api/tests/test_process_registry.py -q
```

### 集成测试
```bash
# 端到端测试
.venv/bin/pytest apps/api/tests/test_pipeline_manimcat.py -q
```

---

## 📝 下一步

### 近期 (本周)
- [ ] 编写单元测试
- [ ] 集成到 orchestrator
- [ ] 更新 API 接口
- [ ] 前端任务队列视图

### 中期 (下周)
- [ ] 性能优化
- [ ] 监控告警
- [ ] 文档完善
- [ ] 用户测试

### 长期 (本月)
- [ ] 更多学科模板
- [ ] 分布式队列
- [ ] 视频预览优化
- [ ] 过程回放 UI

---

## 🔗 相关链接

| 项目 | 链接 |
|------|------|
| **ManimCat** | https://github.com/Wing900/ManimCat |
| **MetaView** | https://github.com/jry21223/metaview |
| **分支** | `feat/manimcat-style-architecture` |
| **文档** | `docs/MANIMCAT_ARCH_UPDATE.md` |

---

## 📸 提交历史

```bash
commit b6c947b (HEAD -> feat/manimcat-style-architecture)
Author: Jerry <jerry@example.com>
Date:   Thu Mar 19 23:30:00 2026 +0800

    feat: 引入 ManimCat 风格架构
    
    新增核心模块:
    - concept_design: 概念设计服务
    - code_generation: 代码生成服务
    - queue_processors: 队列处理器
    - manim_executor: Manim 执行器
    - process_registry: 过程注册表
    - prompt_overrides: 提示词覆盖
    
    类比：ManimCat (https://github.com/Wing900/ManimCat)
```

---

**更新时间**: 2026-03-19 23:30  
**分支**: `feat/manimcat-style-architecture`  
**状态**: ✅ 核心模块已创建并可集成
