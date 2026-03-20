# 📹 视频渲染模式说明

**时间**: 2026-03-20  
**状态**: ⚠️ Fallback 模式

---

## 🎯 当前状态

### 渲染配置
```bash
ALGO_VIS_PREVIEW_RENDER_BACKEND=auto  # ✅ 已修改
ALGO_VIS_MANIM_PYTHON_PATH=.venv-manim/bin/python
ALGO_VIS_MANIM_RENDER_TIMEOUT_S=180
```

### 实际情况
```bash
# 检查 Manim
.venv/bin/python -m manim --version
# ❌ 结果：No module named manim
```

**结论**: Manim 未安装，系统自动回退到 `fallback` 模式

---

## 📊 渲染模式对比

| 模式 | 描述 | 视频质量 | 依赖 | 状态 |
|------|------|----------|------|------|
| **manim** | 真实 Manim 渲染 | ⭐⭐⭐⭐⭐ | Manim + FFmpeg | ❌ 不可用 |
| **auto** | 优先 Manim，失败则 fallback | ⭐⭐⭐⭐ | Manim (可选) | ⚠️ 回退中 |
| **fallback** | 幻灯片 + 配音 | ⭐⭐⭐ | FFmpeg | ✅ 当前使用 |

---

## 🔍 Fallback 视频特点

### 当前生成内容
- ✅ PNG 幻灯片序列
- ✅ 自动配音（如果有 TTS）
- ✅ 标题和步骤信息
- ✅ 进度条和说明文字

### 示例视频内容
```
┌─────────────────────────────────────┐
│ MetaView - 视频预览                 │
│                                     │
│ 测试视频生成                        │
│                                     │
│ 算法题会被拆成状态建模、过程推进... │
│                                     │
│ 3 steps · fallback preview          │
│ 当前使用 fallback 预览               │
└─────────────────────────────────────┘
```

---

## 🛠️ 解决方案

### 方案 1: 安装 Manim（推荐）

**步骤**:
```bash
cd /home/jerry/.openclaw/workspace/metaview

# 1. 安装系统依赖
sudo apt-get update
sudo apt-get install -y \
    pkg-config \
    libcairo-dev \
    libpango1.0-dev \
    ffmpeg

# 2. 安装 Manim
make bootstrap-manim

# 3. 验证安装
.venv/bin/python -m manim --version
```

**优点**:
- ✅ 真实 Manim 动画
- ✅ 高质量视频
- ✅ 完整功能

**缺点**:
- ❌ 需要 sudo 权限
- ❌ 安装时间较长 (~10 分钟)

---

### 方案 2: 改进 Fallback 视频（临时）

**修改内容**:
1. 改进幻灯片设计
2. 添加更多视觉元素
3. 优化配色和字体
4. 添加过渡动画

**实现**:
```python
# apps/api/app/services/preview_video_renderer.py
def _render_intro_slide(self, cir: CirDocument) -> Image.Image:
    # 改进设计
    # - 更好的配色
    # - 添加图标
    # - 优化布局
    pass
```

**优点**:
- ✅ 无需安装新依赖
- ✅ 立即可用
- ✅ 快速迭代

**缺点**:
- ❌ 仍然是静态图片
- ❌ 无真实动画

---

### 方案 3: 使用 Docker（最简单）

**步骤**:
```bash
cd /home/jerry/.openclaw/workspace/metaview

# 使用预构建的 Docker 镜像
make docker-up
```

**优点**:
- ✅ 包含所有依赖
- ✅ 环境隔离
- ✅ 一键启动

**缺点**:
- ❌ 需要 Docker
- ❌ 文件挂载配置

---

## 📝 当前建议

### 短期（今天）
1. ✅ **保持 fallback 模式**
   - 视频可以正常生成和播放
   - 功能完整（配音、字幕、进度条）
   - 适合演示和测试

2. ✅ **改进 fallback 视觉**
   - 优化幻灯片设计
   - 添加学科图标
   - 改进配色方案

### 中期（本周）
3. ⏳ **尝试安装 Manim**
   - 如果有 sudo 权限
   - 或使用 Docker 方案

4. ⏳ **测试真实渲染**
   - 验证 Manim 脚本
   - 优化视频质量

### 长期（下周）
5. 📅 **完善渲染系统**
   - 支持多种渲染后端
   - 添加缓存机制
   - 优化性能

---

## 🎨 Fallback 改进计划

### 第一阶段：视觉优化

**目标**: 让 fallback 视频更专业

**修改文件**:
- `apps/api/app/services/preview_video_renderer.py`

**改进内容**:
```python
# 1. 更好的配色方案
COLORS = {
    'background': '#0f172a',
    'primary': '#00f0ff',
    'secondary': '#0aff0a',
    'text': '#e2e8f0',
}

# 2. 添加学科图标
DOMAIN_ICONS = {
    'algorithm': '🔢',
    'math': '📐',
    'physics': '⚛️',
    'chemistry': '🧪',
}

# 3. 优化布局
def _render_intro_slide(self, cir: CirDocument):
    # 标题 + 图标 + 描述 + 步骤数
    pass
```

---

### 第二阶段：动态效果

**目标**: 添加简单动画

**实现方式**:
```python
# 使用 PIL 生成多帧
frames = []
for i in range(30):
    frame = self._create_frame(progress=i/30)
    frames.append(frame)

# 使用 ffmpeg 合成视频
cmd = [
    'ffmpeg',
    '-i', 'frame-%03d.png',
    '-c:v', 'libx264',
    'output.mp4'
]
```

---

## 🧪 测试验证

### 当前测试
```bash
# 1. 提交题目
curl -X POST http://localhost:8000/api/v1/pipeline \
  -H "Content-Type: application/json" \
  -d '{"prompt": "测试视频", "provider": "mock"}'

# 2. 检查响应
{
  "preview_video_url": "/media/previews/xxx.mp4",
  "diagnostics": [
    {"agent": "video", "message": "已在后端完成 storyboard-fallback 渲染"}
  ]
}

# 3. 访问视频
http://localhost:8000/media/previews/xxx.mp4
```

### 预期结果
- ✅ 视频可以播放
- ✅ 有配音（如果 TTS 可用）
- ✅ 显示步骤信息
- ⚠️ 是幻灯片而非动画

---

## 📊 性能对比

| 指标 | Manim | Fallback |
|------|-------|----------|
| 生成时间 | 30-180 秒 | 2-5 秒 |
| 文件大小 | 1-10 MB | 50-200 KB |
| CPU 占用 | 高 | 低 |
| 内存占用 | 500MB+ | 50MB |
| 视频质量 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |

---

## 🎯 推荐配置

### 开发环境
```bash
# .env
ALGO_VIS_PREVIEW_RENDER_BACKEND=auto
ALGO_VIS_MANIM_PYTHON_PATH=.venv-manim/bin/python
```

### 生产环境（无 Manim）
```bash
# .env
ALGO_VIS_PREVIEW_RENDER_BACKEND=fallback
ALGO_VIS_FALLBACK_QUALITY=h  # 高质量 fallback
```

### 生产环境（有 Manim）
```bash
# .env
ALGO_VIS_PREVIEW_RENDER_BACKEND=manim
ALGO_VIS_MANIM_QUALITY=h
ALGO_VIS_MANIM_RENDER_TIMEOUT_S=300
```

---

## 📞 下一步行动

### 立即执行
1. ✅ 保持 `auto` 模式配置
2. ✅ 接受 fallback 视频
3. ✅ 测试前端显示

### 本周执行
4. ⏳ 改进 fallback 视觉设计
5. ⏳ 尝试安装 Manim

### 下周执行
6. 📅 评估渲染效果
7. 📅 决定最终方案

---

**当前状态**: ✅ Fallback 模式正常工作  
**建议**: 先使用 fallback，有时间再安装 Manim
