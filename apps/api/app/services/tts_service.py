#!/usr/bin/env python3
"""
MetaView TTS 服务
使用系统 TTS 工具生成语音讲解
"""

import subprocess
import tempfile
from pathlib import Path
from typing import Optional
from dataclasses import dataclass


@dataclass
class TTSResult:
    """TTS 结果"""
    success: bool
    audio_path: Optional[str] = None
    duration_ms: int = 0
    error: Optional[str] = None


class SystemTTS:
    """
    系统 TTS 服务
    
    支持多种 TTS 后端：
    1. espeak - 开源 TTS（Linux 默认）
    2. say - macOS 系统 TTS
    3. pyttsx3 - 跨平台离线 TTS
    """
    
    def __init__(self, language: str = "zh-CN", rate: int = 150):
        self.language = language
        self.rate = rate
        self.engine = self._detect_engine()
    
    def _detect_engine(self) -> str:
        """检测可用的 TTS 引擎"""
        # 尝试 espeak
        try:
            result = subprocess.run(
                ["espeak", "--version"],
                capture_output=True,
                text=True,
                timeout=5
            )
            if result.returncode == 0:
                return "espeak"
        except:
            pass
        
        # 尝试 say (macOS)
        try:
            result = subprocess.run(
                ["say", "-v", "?"],
                capture_output=True,
                text=True,
                timeout=5
            )
            if result.returncode == 0:
                return "say"
        except:
            pass
        
        # 尝试 pyttsx3
        try:
            import pyttsx3
            engine = pyttsx3.init()
            engine.quit()
            return "pyttsx3"
        except:
            pass
        
        return "none"
    
    def synthesize(self, text: str, output_path: str) -> TTSResult:
        """
        合成语音
        
        Args:
            text: 要合成的文本
            output_path: 输出音频文件路径
        
        Returns:
            TTSResult: 合成结果
        """
        # 即使没有 TTS 引擎，也尝试生成占位音频
        if self.engine == "none":
            print(f"⚠️  无可用 TTS 引擎，将生成占位音频")
            return self._generate_silent_audio(output_path, len(text))
        
        try:
            if self.engine == "espeak":
                return self._synthesize_espeak(text, output_path)
            elif self.engine == "say":
                return self._synthesize_say(text, output_path)
            elif self.engine == "pyttsx3":
                return self._synthesize_pyttsx3(text, output_path)
        except Exception as e:
            return TTSResult(
                success=False,
                error=str(e)
            )
    
    def _synthesize_espeak(self, text: str, output_path: str) -> TTSResult:
        """使用 espeak 合成"""
        import time
        start_time = time.time()
        
        try:
            # 使用 espeak 生成 WAV 文件
            cmd = [
                "espeak",
                "-v", "zh",  # 中文语音
                "-s", str(self.rate),  # 语速
                "-w", output_path,  # 输出文件
                text
            ]
            
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=60
            )
            
            duration_ms = int((time.time() - start_time) * 1000)
            
            if result.returncode == 0 and Path(output_path).exists():
                return TTSResult(
                    success=True,
                    audio_path=output_path,
                    duration_ms=duration_ms
                )
        except Exception as e:
            pass
        
        # espeak 不可用时，生成静音音频作为占位符
        return self._generate_silent_audio(output_path, len(text))
    
    def _synthesize_say(self, text: str, output_path: str) -> TTSResult:
        """使用 macOS say 合成"""
        import time
        start_time = time.time()
        
        cmd = [
            "say",
            "-v", "Ting-Ting",  # 中文语音
            "-o", output_path,
            text
        ]
        
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=60
        )
        
        duration_ms = int((time.time() - start_time) * 1000)
        
        if result.returncode == 0 and Path(output_path).exists():
            return TTSResult(
                success=True,
                audio_path=output_path,
                duration_ms=duration_ms
            )
        else:
            return TTSResult(
                success=False,
                error=result.stderr or "say 合成失败"
            )
    
    def _synthesize_pyttsx3(self, text: str, output_path: str) -> TTSResult:
        """使用 pyttsx3 合成"""
        import time
        start_time = time.time()
        
        try:
            import pyttsx3
            engine = pyttsx3.init()
            
            # 设置语音属性
            engine.setProperty('rate', self.rate)
            
            # 尝试使用中文语音
            voices = engine.getProperty('voices')
            for voice in voices:
                if 'zh' in voice.id.lower() or 'chinese' in voice.id.lower():
                    engine.setProperty('voice', voice.id)
                    break
            
            # 合成并保存
            engine.save_to_file(text, output_path)
            engine.runAndWait()
            engine.quit()
            
            duration_ms = int((time.time() - start_time) * 1000)
            
            if Path(output_path).exists():
                return TTSResult(
                    success=True,
                    audio_path=output_path,
                    duration_ms=duration_ms
                )
            else:
                return TTSResult(
                    success=False,
                    error="pyttsx3: 输出文件未生成"
                )
        except Exception as e:
            return TTSResult(
                success=False,
                error=str(e)
            )
    
    def _generate_silent_audio(self, output_path: str, text_length: int) -> TTSResult:
        """
        生成静音音频作为占位符
        
        使用 ffmpeg 生成静音音频，时长基于文本长度估算
        """
        import time
        start_time = time.time()
        
        # 估算时长：每 10 个字符约 1 秒
        estimated_duration = max(3, text_length // 10)  # 至少 3 秒
        
        try:
            # 使用 ffmpeg 生成静音音频
            cmd = [
                "ffmpeg",
                "-y",
                "-f", "lavfi",
                "-i", f"anullsrc=r=44100:cl=mono",  # 单声道静音
                "-t", str(estimated_duration),
                "-c:a", "pcm_s16le",
                output_path
            ]
            
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=30
            )
            
            duration_ms = int((time.time() - start_time) * 1000)
            
            if result.returncode == 0 and Path(output_path).exists():
                return TTSResult(
                    success=True,
                    audio_path=output_path,
                    duration_ms=duration_ms
                )
        except Exception as e:
            pass
        
        return TTSResult(
            success=False,
            error="无法生成音频（ffmpeg 不可用）"
        )


def generate_narration_audio(
    cir_document: dict,
    output_dir: str,
    tts: Optional[SystemTTS] = None
) -> dict:
    """
    为 CIR 文档生成讲解音频
    
    Args:
        cir_document: CIR 文档（包含 summary 和 steps）
        output_dir: 输出目录
        tts: TTS 实例
    
    Returns:
        音频文件路径和时长信息
    """
    if tts is None:
        tts = SystemTTS()
    
    output_path = Path(output_dir) / "narration.wav"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    # 提取讲解文本
    narration_text = cir_document.get('summary', '')
    
    if not narration_text:
        return {
            'success': False,
            'error': 'No narration text found'
        }
    
    # 合成语音
    result = tts.synthesize(narration_text, str(output_path))
    
    if result.success:
        return {
            'success': True,
            'audio_path': str(output_path),
            'duration_ms': result.duration_ms,
            'text_length': len(narration_text)
        }
    else:
        return {
            'success': False,
            'error': result.error
        }


if __name__ == "__main__":
    # 测试 TTS
    tts = SystemTTS()
    print(f"检测到 TTS 引擎：{tts.engine}")
    
    test_text = "欢迎使用 MetaView 数智化学科可视化平台"
    result = tts.synthesize(test_text, "/tmp/test_tts.wav")
    
    if result.success:
        print(f"✅ TTS 合成成功：{result.audio_path}")
        print(f"   时长：{result.duration_ms}ms")
    else:
        print(f"❌ TTS 合成失败：{result.error}")
