# 🎙️ MetaView 配音功能配置说明

## ✅ 新增功能

### 1. TTS 语音合成服务

**文件**: `apps/api/app/services/tts_service.py`

**功能**:
- 支持多种 TTS 引擎（espeak, macOS say, pyttsx3）
- 自动检测可用引擎
- 无引擎时生成占位静音音频

**支持的引擎**:
1. **espeak** - Linux 开源 TTS（需要安装）
2. **say** - macOS 系统 TTS
3. **pyttsx3** - 跨平台离线 TTS
4. **Fallback** - 生成静音音频占位符

### 2. 视频增强服务

**文件**: `apps/api/app/services/video_enhancer.py`

**功能**:
- 为视频添加配音音轨
- 调整音量
- 创建带配音的幻灯片视频
- 视频格式转换

### 3. 自动配音集成

**文件**: `apps/api/app/services/preview_video_renderer.py`

**更新内容**:
- 在 fallback 视频渲染后自动添加配音
- 使用 CIR summary 作为讲解文本
- 自动生成并嵌入音频

## 🔧 安装 TTS 引擎（可选）

### Ubuntu/Debian

```bash
sudo apt-get update
sudo apt-get install -y espeak espeak-data
```

### macOS

```bash
# 系统自带 say 命令，无需安装
say -v Ting-Ting "测试语音合成"
```

### Python TTS (跨平台)

```bash
pip install pyttsx3
```

## 📊 工作流程

```
1. 用户提交题目
   ↓
2. 生成 CIR 文档（包含 summary）
   ↓
3. 生成 fallback 视频（PNG 幻灯片序列）
   ↓
4. TTS 合成讲解音频
   ↓
5. ffmpeg 合并视频和音频
   ↓
6. 输出带配音的视频
```

## 🎯 使用示例

### API 调用

```python
from app.services.tts_service import SystemTTS, generate_narration_audio
from app.services.video_enhancer import VideoEnhancer

# 1. 初始化 TTS
tts = SystemTTS(language="zh-CN", rate=150)

# 2. 生成配音
cir_document = {
    "summary": "算法题会被拆成状态建模、过程推进与复杂度收束三个镜头..."
}
audio_result = generate_narration_audio(
    cir_document,
    "/tmp/audio",
    tts
)

# 3. 增强视频
enhancer = VideoEnhancer()
result = enhancer.add_narration(
    video_path="/tmp/video.mp4",
    audio_path=audio_result["audio_path"],
    output_path="/tmp/enhanced.mp4",
    volume=0.8
)
```

### 自动集成

在 `preview_video_renderer.py` 中，配音功能已自动集成：

```python
# 渲染 fallback 视频后自动添加配音
self._run_ffmpeg(input_pattern=input_pattern, output_path=output_path)

# 生成配音并嵌入到视频中
if cir is not None and output_path.exists():
    self._add_narration_to_video(output_path, cir)
```

## 📝 配置选项

### TTS 配置

```python
# 语速 (字符/分钟)
ALGO_VIS_TTS_RATE=150

# 语言
ALGO_VIS_TTS_LANGUAGE=zh-CN

# 音量 (0.0-1.0)
ALGO_VIS_TTS_VOLUME=0.8
```

### 视频增强配置

```python
# 音频比特率
ALGO_VIS_AUDIO_BITRATE=128k

# 音频编码
ALGO_VIS_AUDIO_CODEC=aac

# 视频编码
ALGO_VIS_VIDEO_CODEC=libx264
```

## ⚠️ 注意事项

1. **TTS 引擎缺失**: 如果没有安装 TTS 引擎，会生成静音音频作为占位符
2. **ffmpeg 必需**: 视频增强需要 ffmpeg
3. **音频时长**: 基于文本长度估算（每 10 字符约 1 秒）
4. **中文支持**: 优先使用中文语音（espeak -v zh, say -v Ting-Ting）

## 🧪 测试

### 测试 TTS

```bash
cd /home/jerry/.openclaw/workspace/metaview
python3 apps/api/app/services/tts_service.py
```

### 测试视频增强

```bash
python3 apps/api/app/services/video_enhancer.py
```

### 完整测试

```bash
# 提交一个测试题目
curl -X POST http://localhost:8000/api/v1/pipeline \
  -H "Content-Type: application/json" \
  -d '{"prompt": "可视化讲解冒泡排序", "sandbox_mode": "off"}'

# 检查响应中的 preview_video_url
# 视频应该包含配音（或静音占位符）
```

## 📈 未来改进

1. **在线 TTS**: 集成 Azure TTS、Google TTS 等在线服务
2. **多语言支持**: 自动检测文本语言并选择对应语音
3. **语音情感**: 根据内容调整语调和情感
4. **字幕生成**: 自动生成 SRT 字幕文件
5. **音频优化**: 添加背景音乐、音效等

---

**创建时间**: 2026-03-20  
**最后更新**: 2026-03-20  
**状态**: ✅ 已部署
