# MetaView API 文档

**版本**: 0.1.0  
**更新日期**: 2026-03-19  
**基础 URL**: `http://127.0.0.1:8000`

---

## 📡 API 概览

### 核心接口

| 接口 | 方法 | 说明 |
|------|------|------|
| `/health` | GET | 健康检查 |
| `/api/v1/runtime` | GET | 运行时目录 |
| `/api/v1/pipeline` | POST | 执行完整流程 |
| `/api/v1/runs` | GET | 历史列表 |
| `/api/v1/runs/{id}` | GET | 历史详情 |

### ManimCat 风格架构接口

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/v1/concept/design` | POST | 概念设计 |
| `/api/v1/code/generate` | POST | 代码生成 |
| `/api/v1/process` | GET | 过程列表 |
| `/api/v1/process/{id}` | GET | 过程详情 |
| `/api/v1/process/{id}/replay` | GET | 过程回放 |
| `/api/v1/tasks` | GET | 任务队列统计 |

### Provider 管理接口

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/v1/providers/custom` | POST | 注册 Provider |
| `/api/v1/providers/custom/test` | POST | 测试 Provider |
| `/api/v1/providers/custom/{name}` | DELETE | 删除 Provider |

### Manim 脚本接口

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/v1/manim/prepare` | POST | 准备脚本 |
| `/api/v1/manim/render` | POST | 渲染视频 |

---

## 🎯 详细接口说明

### 1. 健康检查

```http
GET /health
```

**响应示例**:
```json
{
  "status": "ok",
  "version": "0.1.0"
}
```

---

### 2. 概念设计 (ManimCat 阶段 1)

```http
POST /api/v1/concept/design
```

**请求体**:
```json
{
  "prompt": "可视化冒泡排序算法",
  "domain": "algorithm",
  "source_code": "def bubble_sort(arr): ...",
  "source_image": "base64_encoded_image"
}
```

**响应示例**:
```json
{
  "success": true,
  "concept_id": "uuid-here",
  "title": "冒泡排序可视化",
  "domain": "algorithm",
  "objects": ["数组", "指针", "临时变量"],
  "key_moments": ["初始状态", "比较交换", "结果展示"],
  "scenes_count": 4,
  "complexity_score": 2,
  "duration_estimate": 29.0,
  "metadata": {
    "stage": "concept_design",
    "objects_count": 3,
    "scenes_count": 4
  }
}
```

**错误响应**:
- `400`: 概念设计失败

---

### 3. 代码生成 (ManimCat 阶段 2)

```http
POST /api/v1/code/generate
```

**请求体**:
```json
{
  "concept_id": "uuid-here",
  "optimize": true
}
```

**响应示例**:
```json
{
  "success": true,
  "code": "from manim import *\n\nclass GeneratedScene...",
  "scene_class_name": "GeneratedScene",
  "lines_of_code": 150,
  "diagnostics": ["提示：建议添加 self.wait 控制节奏"],
  "metadata": {
    "stage": "code_generation",
    "lines_of_code": 150,
    "scenes_generated": 4
  }
}
```

**错误响应**:
- `400`: 代码生成失败
- `404`: Concept 不存在

---

### 4. 过程列表

```http
GET /api/v1/process?limit=50&status=completed
```

**查询参数**:
- `limit`: 返回数量 (1-100, 默认 20)
- `status`: 状态过滤 (pending/running/completed/failed)

**响应示例**:
```json
[
  {
    "process_id": "uuid-here",
    "prompt": "可视化冒泡排序",
    "states": [
      {
        "stage": "init",
        "status": "created",
        "data": {},
        "timestamp": "2026-03-19T23:00:00"
      },
      {
        "stage": "concept_design",
        "status": "completed",
        "data": {"concept_id": "xxx"},
        "timestamp": "2026-03-19T23:00:05"
      }
    ],
    "result": {"video_url": "/media/xxx.mp4"},
    "created_at": "2026-03-19T23:00:00",
    "completed_at": "2026-03-19T23:00:30"
  }
]
```

---

### 5. 过程详情

```http
GET /api/v1/process/{process_id}
```

**响应示例**:
```json
{
  "process_id": "uuid-here",
  "prompt": "可视化冒泡排序",
  "states": [...],
  "result": {...},
  "created_at": "2026-03-19T23:00:00",
  "completed_at": "2026-03-19T23:00:30"
}
```

**错误响应**:
- `404`: Process 不存在

---

### 6. 过程回放

```http
GET /api/v1/process/{process_id}/replay
```

**响应示例**:
```json
{
  "process_id": "uuid-here",
  "prompt": "可视化冒泡排序",
  "stages": [
    {
      "stage": "init",
      "status": "created",
      "data": {},
      "timestamp": "2026-03-19T23:00:00"
    },
    {
      "stage": "concept_design",
      "status": "completed",
      "data": {...},
      "timestamp": "2026-03-19T23:00:05"
    }
  ],
  "result": {...},
  "error": null
}
```

**错误响应**:
- `404`: Process 不存在

---

### 7. 任务队列统计

```http
GET /api/v1/tasks
```

**响应示例**:
```json
{
  "queued": 5,
  "active": 2,
  "completed": 150,
  "failed": 3,
  "max_concurrent": 3,
  "max_queue_size": 100
}
```

---

### 8. 执行完整流程

```http
POST /api/v1/pipeline
```

**请求体**:
```json
{
  "prompt": "可视化冒泡排序算法",
  "domain": "algorithm",
  "provider": "openai",
  "router_provider": "mock",
  "generation_provider": "openai",
  "source_code": "def bubble_sort(arr): ...",
  "source_image": "base64_encoded_image",
  "sandbox_mode": "dry_run",
  "persist_run": true
}
```

**响应示例**:
```json
{
  "request_id": "uuid-here",
  "cir": {
    "title": "冒泡排序可视化",
    "domain": "algorithm",
    "summary": "...",
    "steps": [...]
  },
  "renderer_script": "from manim import *...",
  "preview_video_url": "/media/uuid-here/video.mp4",
  "diagnostics": [...],
  "runtime": {
    "skill": {...},
    "provider": {...},
    "sandbox": {...},
    "validation": {...}
  }
}
```

**错误响应**:
- `400`: Provider 不可用 / 技能不可用
- `502`: Provider 调用失败

---

## 🔧 使用示例

### Python 示例

```python
import requests

API_BASE = "http://127.0.0.1:8000"

# 1. 概念设计
concept_res = requests.post(
    f"{API_BASE}/api/v1/concept/design",
    json={"prompt": "可视化冒泡排序算法"}
).json()

print(f"概念设计完成：{concept_res['title']}")

# 2. 代码生成
code_res = requests.post(
    f"{API_BASE}/api/v1/code/generate",
    json={"concept_id": concept_res["concept_id"]}
).json()

print(f"代码生成完成：{code_res['lines_of_code']} 行")

# 3. 查看过程
processes = requests.get(f"{API_BASE}/api/v1/process").json()
print(f"总过程数：{len(processes)}")

# 4. 回放过程
replay = requests.get(
    f"{API_BASE}/api/v1/process/{processes[0]['process_id']}/replay"
).json()

print(f"执行阶段：{len(replay['stages'])}")
```

### JavaScript 示例

```javascript
const API_BASE = "http://127.0.0.1:8000";

// 1. 概念设计
const concept = await fetch(`${API_BASE}/api/v1/concept/design`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ prompt: "可视化冒泡排序算法" })
}).then(r => r.json());

console.log(`概念设计完成：${concept.title}`);

// 2. 代码生成
const code = await fetch(`${API_BASE}/api/v1/code/generate`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ concept_id: concept.concept_id })
}).then(r => r.json());

console.log(`代码生成完成：${code.lines_of_code} 行`);

// 3. 查看任务队列
const stats = await fetch(`${API_BASE}/api/v1/tasks`)
  .then(r => r.json());

console.log(`队列中：${stats.queued}, 执行中：${stats.active}`);
```

---

## 📊 状态码说明

| 状态码 | 说明 |
|--------|------|
| 200 | 成功 |
| 400 | 请求错误 (参数/验证失败) |
| 404 | 资源不存在 |
| 502 | Provider 调用失败 |

---

## 🔐 认证说明

当前版本无需认证，生产环境建议添加 API Key 认证。

---

## 📝 错误处理

所有错误响应格式：
```json
{
  "detail": "错误信息"
}
```

---

**文档版本**: 1.0  
**最后更新**: 2026-03-19  
**维护者**: MetaView Team
