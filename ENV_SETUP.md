# MetaView 环境配置说明

## ⚠️ 当前状态

**后端服务**: ✅ 正常运行  
**前端服务**: ✅ 正常运行  
**视频渲染**: ❌ 无法渲染（缺少依赖）

## 问题原因

视频渲染需要以下系统依赖：

1. **Manim** - Python 动画引擎（需要 cairo、pango 等）
2. **FFmpeg** - 视频编码工具
3. **pkg-config** - 编译依赖

当前系统缺少这些依赖，导致：
- 无法安装 Manim
- 无法生成 fallback 预览视频
- 所有任务的 `preview_video_url` 都是 `null`

## 解决方案

### 方案 1: 完整安装（推荐）

如果你有 sudo 权限，运行：

```bash
# 安装系统依赖
sudo apt-get update
sudo apt-get install -y \
    pkg-config \
    libcairo-dev \
    libpango1.0-dev \
    ffmpeg \
    python3-dev

# 安装 Manim
cd /home/jerry/.openclaw/workspace/metaview
make bootstrap-manim
```

### 方案 2: 使用 Docker（最简单）

```bash
cd /home/jerry/.openclaw/workspace/metaview
make docker-up
```

Docker 镜像已经包含了所有必要的依赖。

### 方案 3: 仅配置（暂时不渲染）

当前配置已经设置为 `fallback` 模式，但因为没有 ffmpeg，fallback 也无法工作。

你可以：
1. 继续使用 dry_run 模式测试 CIR 生成
2. 查看生成的 Manim 脚本
3. 等环境配置好后再真实渲染

## 当前配置

```bash
# .env 配置
ALGO_VIS_PREVIEW_RENDER_BACKEND=auto  # 自动选择 manim 或 fallback
ALGO_VIS_MANIM_PYTHON_PATH=.venv-manim/bin/python
ALGO_VIS_MANIM_RENDER_TIMEOUT_S=180
```

## 验证安装

安装完成后，运行：

```bash
# 检查 Manim
.venv-manim/bin/python -m manim --version

# 检查 FFmpeg
ffmpeg -version

# 测试渲染
curl -X POST http://127.0.0.1:8000/api/v1/pipeline \
  -H "Content-Type: application/json" \
  -d '{"prompt": "可视化讲解冒泡排序", "sandbox_mode": "off"}'
```

如果成功，响应中会包含 `preview_video_url` 字段。

## 临时解决

如果只是想看效果，可以：

1. 手动安装 FFmpeg（如果可能）
2. 或者在另一台有 Manim 环境的机器上运行
3. 或者使用 Docker

---

**创建时间**: 2026-03-20 09:15  
**最后更新**: 2026-03-20 09:15
