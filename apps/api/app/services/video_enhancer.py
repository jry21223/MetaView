#!/usr/bin/env python3
"""
MetaView 视频增强服务
将配音、字幕等嵌入到视频中
"""

import subprocess
import tempfile
from pathlib import Path
from typing import Optional
from dataclasses import dataclass


@dataclass
class VideoEnhancementResult:
    """视频增强结果"""
    success: bool
    output_path: Optional[str] = None
    has_audio: bool = False
    has_subtitles: bool = False
    error: Optional[str] = None


class VideoEnhancer:
    """
    视频增强器
    
    功能：
    1. 添加配音音轨
    2. 添加字幕
    3. 调整音量
    4. 视频格式转换
    """
    
    def __init__(self, ffmpeg_path: str = "ffmpeg"):
        self.ffmpeg_path = ffmpeg_path
    
    def _check_ffmpeg(self) -> bool:
        """检查 ffmpeg 是否可用"""
        try:
            result = subprocess.run(
                [self.ffmpeg_path, "-version"],
                capture_output=True,
                text=True,
                timeout=5
            )
            return result.returncode == 0
        except:
            return False
    
    def add_narration(
        self,
        video_path: str,
        audio_path: str,
        output_path: str,
        volume: float = 0.8
    ) -> VideoEnhancementResult:
        """
        为视频添加配音
        
        Args:
            video_path: 原始视频路径
            audio_path: 配音音频路径
            output_path: 输出视频路径
            volume: 音频音量 (0.0-1.0)
        
        Returns:
            VideoEnhancementResult: 增强结果
        """
        if not self._check_ffmpeg():
            return VideoEnhancementResult(
                success=False,
                error="ffmpeg not found"
            )
        
        video = Path(video_path)
        audio = Path(audio_path)
        output = Path(output_path)
        
        if not video.exists():
            return VideoEnhancementResult(
                success=False,
                error=f"Video file not found: {video_path}"
            )
        
        if not audio.exists():
            return VideoEnhancementResult(
                success=False,
                error=f"Audio file not found: {audio_path}"
            )
        
        output.parent.mkdir(parents=True, exist_ok=True)
        
        # 使用 ffmpeg 合并视频和音频
        cmd = [
            self.ffmpeg_path,
            "-y",  # 覆盖输出
            "-i", str(video),  # 输入视频
            "-i", str(audio),  # 输入音频
            "-c:v", "copy",  # 复制视频流
            "-c:a", "aac",  # 音频编码为 AAC
            "-b:a", "128k",  # 音频比特率
            "-filter:a", f"volume={volume}",  # 调整音量
            "-shortest",  # 以较短的流为准
            "-map", "0:v:0",  # 使用第一个输入的视频
            "-map", "1:a:0",  # 使用第二个输入的音频
            str(output)
        ]
        
        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=300  # 5 分钟超时
            )
            
            if result.returncode == 0 and output.exists():
                return VideoEnhancementResult(
                    success=True,
                    output_path=str(output),
                    has_audio=True
                )
            else:
                return VideoEnhancementResult(
                    success=False,
                    error=result.stderr or "ffmpeg 执行失败"
                )
        except subprocess.TimeoutExpired:
            return VideoEnhancementResult(
                success=False,
                error="视频增强超时"
            )
        except Exception as e:
            return VideoEnhancementResult(
                success=False,
                error=str(e)
            )
    
    def create_slideshow_with_audio(
        self,
        image_path: str,
        audio_path: str,
        output_path: str,
        duration: Optional[float] = None
    ) -> VideoEnhancementResult:
        """
        创建带配音的幻灯片视频
        
        Args:
            image_path: 图片路径
            audio_path: 配音音频路径
            output_path: 输出视频路径
            duration: 视频时长（秒），默认使用音频时长
        
        Returns:
            VideoEnhancementResult: 增强结果
        """
        if not self._check_ffmpeg():
            return VideoEnhancementResult(
                success=False,
                error="ffmpeg not found"
            )
        
        image = Path(image_path)
        audio = Path(audio_path)
        output = Path(output_path)
        
        if not image.exists():
            return VideoEnhancementResult(
                success=False,
                error=f"Image file not found: {image_path}"
            )
        
        if not audio.exists():
            return VideoEnhancementResult(
                success=False,
                error=f"Audio file not found: {audio_path}"
            )
        
        output.parent.mkdir(parents=True, exist_ok=True)
        
        # 构建 ffmpeg 命令
        cmd = [
            self.ffmpeg_path,
            "-y",
            "-loop", "1",  # 循环图片
            "-i", str(image),  # 输入图片
            "-i", str(audio),  # 输入音频
            "-c:v", "libx264",  # 视频编码
            "-tune", "stillimage",
            "-c:a", "aac",
            "-b:a", "128k",
            "-pix_fmt", "yuv420p",
            "-shortest"
        ]
        
        if duration:
            cmd.extend(["-t", str(duration)])
        
        cmd.append(str(output))
        
        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=300
            )
            
            if result.returncode == 0 and output.exists():
                return VideoEnhancementResult(
                    success=True,
                    output_path=str(output),
                    has_audio=True
                )
            else:
                return VideoEnhancementResult(
                    success=False,
                    error=result.stderr or "ffmpeg 执行失败"
                )
        except Exception as e:
            return VideoEnhancementResult(
                success=False,
                error=str(e)
            )


def enhance_preview_video(
    video_path: str,
    narration_text: str,
    output_dir: str,
    tts_service=None,
    enhancer=None
) -> VideoEnhancementResult:
    """
    增强预览视频：添加配音
    
    Args:
        video_path: 原始视频路径
        narration_text: 讲解文本
        output_dir: 输出目录
        tts_service: TTS 服务实例
        enhancer: 视频增强器实例
    
    Returns:
        VideoEnhancementResult: 增强结果
    """
    from .tts_service import SystemTTS, generate_narration_audio
    
    if enhancer is None:
        enhancer = VideoEnhancer()
    
    if tts_service is None:
        tts_service = SystemTTS()
    
    output_path = Path(output_dir) / "enhanced_video.mp4"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    # 1. 生成配音
    audio_result = generate_narration_audio(
        {'summary': narration_text},
        str(output_dir),
        tts_service
    )
    
    if not audio_result.get('success'):
        return VideoEnhancementResult(
            success=False,
            error=f"TTS 失败：{audio_result.get('error')}"
        )
    
    audio_path = audio_result['audio_path']
    
    # 2. 将配音嵌入视频
    result = enhancer.add_narration(
        video_path=video_path,
        audio_path=audio_path,
        output_path=str(output_path),
        volume=0.8
    )
    
    return result


if __name__ == "__main__":
    # 测试视频增强
    enhancer = VideoEnhancer()
    
    if enhancer._check_ffmpeg():
        print("✅ ffmpeg 可用")
    else:
        print("❌ ffmpeg 不可用")
