# ManimCat 风格架构更新

## 更新内容

本次更新类比 [ManimCat](https://github.com/Wing900/ManimCat) 的架构，为 MetaView 引入以下核心模块：

### 1. 两阶段 AI 生成

#### 概念设计阶段 (Concept Design)
- **路径**: `apps/api/app/services/concept_design/`
- **核心类**: `ConceptDesigner`
- **职责**: 将用户输入转换为结构化的动画概念设计
- **输出**: `ConceptDesign` + `SceneDesign[]`

#### 代码生成阶段 (Code Generation)
- **路径**: `apps/api/app/services/code_generation/`
- **核心类**: `CodeGenerator`
- **职责**: 根据概念设计生成 Manim 代码
- **输出**: 可执行的 Manim 脚本

### 2. 队列处理器 (Queue Processor)
- **路径**: `apps/api/app/services/queue_processors/`
- **核心类**: `QueueProcessor`
- **职责**: 管理动画生成任务的队列处理
- **特性**:
  - 并发控制
  - 优先级队列
  - 任务状态跟踪
  - 错误处理与重试

### 3. Manim 执行器 (Manim Executor)
- **路径**: `apps/api/app/services/manim_executor/`
- **核心类**: `ManimExecutor`
- **职责**: 执行 Manim 脚本并生成视频
- **特性**:
  - 临时文件管理
  - 超时控制
  - 错误处理
  - 资源清理

### 4. 过程注册表 (Process Registry)
- **路径**: `apps/api/app/services/process_registry/`
- **核心类**: `ProcessRegistry`
- **职责**: 管理动画生成过程的状态和记忆
- **特性**:
  - 状态历史跟踪
  - 持久化存储
  - 断点续传
  - 过程回放

### 5. 提示词覆盖 (Prompt Overrides)
- **路径**: `apps/api/app/services/prompt_overrides/`
- **核心类**: `PromptOverrideRegistry`
- **职责**: 提供针对不同学科和场景的提示词模板
- **支持学科**:
  - 算法 (algorithm)
  - 数学 (math)
  - 物理 (physics)
  - 通用评论 (critique)

---

## 架构对比

### ManimCat 架构
```
用户输入
  ↓
[Concept Designer]  ← 概念设计阶段
  ↓
Concept Document
  ↓
[Code Generator]  ← 代码生成阶段
  ↓
Manim Script
  ↓
[Video Processor]  ← 队列处理
  ↓
[Manim Executor]  ← 执行渲染
  ↓
MP4 Video
```

### MetaView 新架构
```
用户输入
  ↓
[Domain Router]  ← 学科路由
  ↓
[Concept Designer]  ← 概念设计阶段 (新增)
  ↓
ConceptDesign + SceneDesign[]
  ↓
[Code Generator]  ← 代码生成阶段 (新增)
  ↓
Manim Script
  ↓
[Queue Processor]  ← 队列处理 (新增)
  ↓
[Manim Executor]  ← 执行渲染 (新增)
  ↓
MP4 Video
  ↓
[Process Registry]  ← 过程记录 (新增)
```

---

## 使用示例

### 1. 概念设计

```python
from app.services.concept_design import ConceptDesigner

designer = ConceptDesigner()
result = designer.design(
    prompt="可视化冒泡排序算法",
    source_code="def bubble_sort(arr): ..."
)

if result.success:
    print(f"概念：{result.concept.title}")
    print(f"对象：{result.concept.objects}")
    print(f"场景数：{len(result.scenes)}")
```

### 2. 代码生成

```python
from app.services.code_generation import CodeGenerator

generator = CodeGenerator()
result = generator.generate(
    concept=concept_design,
    scenes=scene_designs
)

if result.success:
    print(f"代码行数：{len(result.code.split(chr(10)))}")
    print(f"诊断：{result.diagnostics}")
```

### 3. 队列处理

```python
from app.services.queue_processors import QueueProcessor, ProcessorConfig

config = ProcessorConfig(
    max_concurrent_tasks=3,
    max_queue_size=100
)

processor = QueueProcessor(config)

# 提交任务
task = await processor.submit(
    prompt="可视化快速排序",
    priority=5
)

# 处理任务
async def handler(prompt, metadata):
    # 执行动画生成
    pass

await processor.run(handler)
```

### 4. Manim 执行

```python
from app.services.manim_executor import ManimExecutor, ExecutionConfig

config = ExecutionConfig(
    quality="h",
    format="mp4",
    timeout_seconds=180
)

executor = ManimExecutor(config)

result = executor.execute(
    code=manim_code,
    scene_class_name="BubbleSortScene",
    request_id="req_123"
)

if result.success:
    print(f"视频路径：{result.video_path}")
    print(f"视频 URL: {result.video_url}")
```

### 5. 过程记录

```python
from app.services.process_registry import ProcessRegistry

registry = ProcessRegistry(storage_path="./data/processes")

# 创建过程
process = registry.create_process("可视化冒泡排序")

# 更新状态
registry.update_process(
    process,
    stage="concept_design",
    status="completed",
    data={"concept_id": "xxx"}
)

# 完成过程
registry.complete_process(process, result={"video_url": "..."})

# 回放过程
history = registry.replay_process(process.process_id)
```

### 6. 提示词覆盖

```python
from app.services.prompt_overrides import PromptOverrideRegistry

registry = PromptOverrideRegistry()

# 获取算法概念设计提示词
overrides = registry.get_for_domain("algorithm", "concept_design")

# 渲染提示词
prompt = registry.render(
    "algorithm_concept_v1",
    algorithm_name="冒泡排序",
    input_description="整数数组",
    output_description="排序后的数组"
)
```

---

## 与现有架构的集成

### 更新 orchestrator.py

```python
from app.services.concept_design import ConceptDesigner
from app.services.code_generation import CodeGenerator
from app.services.queue_processors import QueueProcessor
from app.services.manim_executor import ManimExecutor
from app.services.process_registry import ProcessRegistry
from app.services.prompt_overrides import PromptOverrideRegistry

class PipelineOrchestrator:
    def __init__(self, settings: Settings) -> None:
        # ... 现有初始化 ...
        
        # 新增 ManimCat 风格模块
        self.concept_designer = ConceptDesigner()
        self.code_generator = CodeGenerator()
        self.queue_processor = QueueProcessor()
        self.manim_executor = ManimExecutor()
        self.process_registry = ProcessRegistry()
        self.prompt_registry = PromptOverrideRegistry()
    
    def run(self, request: PipelineRequest) -> PipelineResponse:
        # 创建过程记录
        process = self.process_registry.create_process(request.prompt)
        
        try:
            # 第一阶段：概念设计
            concept_result = self.concept_designer.design(
                request.prompt,
                source_image=request.source_image,
                source_code=request.source_code
            )
            
            self.process_registry.update_process(
                process,
                stage="concept_design",
                status="completed",
                data=concept_result.metadata
            )
            
            # 第二阶段：代码生成
            code_result = self.code_generator.generate(
                concept=concept_result.concept,
                scenes=concept_result.scenes
            )
            
            self.process_registry.update_process(
                process,
                stage="code_generation",
                status="completed",
                data=code_result.metadata
            )
            
            # 第三阶段：执行渲染
            exec_result = self.manim_executor.execute(
                code=code_result.code,
                scene_class_name=code_result.scene_class_name,
                request_id=request_id
            )
            
            # 完成过程
            self.process_registry.complete_process(
                process,
                result={"video_url": exec_result.video_url}
            )
            
            # ... 返回响应 ...
            
        except Exception as e:
            self.process_registry.fail_process(process, str(e))
            raise
```

---

## 配置选项

### 环境变量

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
ALGO_VIS_TASK_TIMEOUT_S=300

# Manim 执行
ALGO_VIS_MANIM_PYTHON_PATH=.venv-manim/bin/python
ALGO_VIS_MANIM_QUALITY=h
ALGO_VIS_MANIM_FORMAT=mp4
ALGO_VIS_MANIM_TIMEOUT_S=180

# 过程记录
ALGO_VIS_PROCESS_STORAGE_PATH=./data/processes
ALGO_VIS_PROCESS_RETENTION_DAYS=7
```

---

## 测试

```bash
# 运行测试
.venv/bin/pytest apps/api/tests/test_concept_design.py -q
.venv/bin/pytest apps/api/tests/test_code_generation.py -q
.venv/bin/pytest apps/api/tests/test_queue_processor.py -q
.venv/bin/pytest apps/api/tests/test_manim_executor.py -q
.venv/bin/pytest apps/api/tests/test_process_registry.py -q
```

---

## 下一步

1. **集成测试**: 编写端到端测试验证完整流程
2. **性能优化**: 优化队列处理和并发控制
3. **UI 集成**: 在前端添加任务队列视图
4. **监控告警**: 添加任务失败告警
5. **文档完善**: 补充 API 文档和使用示例

---

**创建时间**: 2026-03-19 23:30  
**分支**: `feat/manimcat-style-architecture`  
**状态**: ✅ 核心模块已创建
