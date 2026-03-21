#!/usr/bin/env python3
"""
MetaView TTS 服务
支持多种 TTS 后端：
1. 阿里云 DashScope TTS（推荐，中文音质最佳）
2. espeak - 开源 TTS（Linux 默认）
3. say - macOS 系统 TTS
4. pyttsx3 - 跨平台离线 TTS
"""

import subprocess
import tempfile
import os
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


class MimoTTS:
    """
    小米 MiMo V2 TTS 服务
    模型：mimo-v2-tts
    音色：female（女声）, male（男声）
    API: https://api.xiaomimimo.com/v1/chat/completions
    
    返回格式：base64 编码的 WAV 音频数据
    """
    
    BASE_URL = "https://api.xiaomimimo.com/v1/chat/completions"
    
    def __init__(self, api_key: Optional[str] = None, voice: str = "female"):
        # 尝试从多个来源加载 API Key
        if not api_key:
            # 1. 环境变量
            api_key = os.getenv("MIMO_API_KEY")
            # 2. 尝试加载 .env 文件
            if not api_key:
                env_path = Path(__file__).parent.parent.parent.parent.parent / ".env"
                if env_path.exists():
                    from dotenv import load_dotenv
                    load_dotenv(env_path)
                    api_key = os.getenv("MIMO_API_KEY")
        
        self.api_key = api_key
        self.voice = voice
        self.available = bool(api_key)
    
    def synthesize(self, text: str, output_path: str) -> TTSResult:
        """
        使用小米 MiMo TTS 合成语音
        
        Args:
            text: 要合成的文本
            output_path: 输出音频文件路径
        
        Returns:
            TTSResult: 合成结果
        """
        if not self.available:
            return TTSResult(success=False, error="小米 MiMo TTS 不可用（缺少 API Key）")
        
        import time
        import requests
        import base64
        
        start_time = time.time()
        
        try:
            payload = {
                "model": "mimo-v2-tts",
                "messages": [
                    {"role": "user", "content": text},
                    {"role": "assistant", "content": ""}
                ],
                "voice": self.voice
            }
            
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json"
            }
            
            response = requests.post(
                self.BASE_URL,
                json=payload,
                headers=headers,
                timeout=60
            )
            
            if response.status_code == 200:
                data = response.json()
                if 'choices' in data and len(data['choices']) > 0:
                    msg = data['choices'][0].get('message', {})
                    audio = msg.get('audio', {})
                    audio_data = audio.get('data')
                    
                    if audio_data:
                        # Base64 解码
                        audio_bytes = base64.b64decode(audio_data)
                        with open(output_path, 'wb') as f:
                            f.write(audio_bytes)
                        
                        duration_ms = int((time.time() - start_time) * 1000)
                        return TTSResult(
                            success=True,
                            audio_path=output_path,
                            duration_ms=duration_ms
                        )
                    else:
                        return TTSResult(
                            success=False,
                            error="MiMo TTS 返回空音频数据"
                        )
                else:
                    return TTSResult(
                        success=False,
                        error="MiMo TTS 响应格式错误"
                    )
            else:
                return TTSResult(
                    success=False,
                    error=f"MiMo TTS API 错误：{response.status_code} - {response.text[:200]}"
                )
                
        except Exception as e:
            return TTSResult(
                success=False,
                error=f"MiMo TTS 异常：{str(e)}"
            )


class SiliconFlowTTS:
    """
    智谱 AI (SiliconFlow) TTS 服务
    模型：
    - fnlp/MOSS-TTSD-v0.5（复旦大学，中文优化）
    - FunAudioLLM/CosyVoice2-0.5B（阿里通义，高质量）
    
    音色：alex, benjamin, charles, david, anna, bella, claire, diana
    API: https://api.1ip.icu/v1/audio/speech
    """
    
    BASE_URL = "https://api.1ip.icu/v1/audio/speech"
    
    def __init__(self, api_key: Optional[str] = None, model: str = "FunAudioLLM/CosyVoice2-0.5B", voice: str = "claire"):
        # 尝试从多个来源加载 API Key
        if not api_key:
            # 1. 环境变量
            api_key = os.getenv("SILICONFLOW_API_KEY")
            # 2. 尝试加载 .env 文件
            if not api_key:
                env_path = Path(__file__).parent.parent.parent.parent.parent / ".env"
                if env_path.exists():
                    from dotenv import load_dotenv
                    load_dotenv(env_path)
                    api_key = os.getenv("SILICONFLOW_API_KEY")
        
        self.api_key = api_key
        self.model = model
        self.voice = f"{model}:{voice}"  # 格式：模型名：音色名
        self.available = bool(api_key)
    
    def synthesize(self, text: str, output_path: str) -> TTSResult:
        """
        使用智谱 AI TTS 合成语音
        
        Args:
            text: 要合成的文本
            output_path: 输出音频文件路径
        
        Returns:
            TTSResult: 合成结果
        """
        if not self.available:
            return TTSResult(success=False, error="智谱 AI TTS 不可用（缺少 API Key）")
        
        import time
        import requests
        
        start_time = time.time()
        
        try:
            payload = {
                "model": self.model,
                "input": text,
                "voice": self.voice,
                "response_format": "mp3",
                "stream": False
            }
            
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json"
            }
            
            response = requests.post(
                self.BASE_URL,
                json=payload,
                headers=headers,
                timeout=60,
                stream=False
            )
            
            if response.status_code == 200:
                with open(output_path, 'wb') as f:
                    f.write(response.content)
                
                duration_ms = int((time.time() - start_time) * 1000)
                return TTSResult(
                    success=True,
                    audio_path=output_path,
                    duration_ms=duration_ms
                )
            else:
                return TTSResult(
                    success=False,
                    error=f"智谱 AI TTS API 错误：{response.status_code} - {response.text[:200]}"
                )
                
        except Exception as e:
            return TTSResult(
                success=False,
                error=f"智谱 AI TTS 异常：{str(e)}"
            )


class AliyunTTS:
    """
    阿里云 DashScope TTS 服务
    模型：qwen3-tts-instruct-flash-2026-01-26
    中文 MOS 4.3+，自然度高
    """
    
    def __init__(self, api_key: Optional[str] = None, model: str = "qwen3-tts-instruct-flash-2026-01-26"):
        # 尝试从多个来源加载 API Key
        if not api_key:
            # 1. 环境变量
            api_key = os.getenv("DASHSCOPE_API_KEY")
            # 2. 尝试加载 .env 文件
            if not api_key:
                env_path = Path(__file__).parent.parent.parent.parent.parent / ".env"
                if env_path.exists():
                    from dotenv import load_dotenv
                    load_dotenv(env_path)
                    api_key = os.getenv("DASHSCOPE_API_KEY")
        
        self.api_key = api_key
        self.model = model
        self.available = self._check_availability()
    
    def _check_availability(self) -> bool:
        """检查阿里云 TTS 是否可用"""
        if not self.api_key:
            return False
        try:
            import dashscope
            from dashscope import SpeechSynthesizer
            return True
        except ImportError:
            print("⚠️  dashscope 未安装，运行：pip install dashscope")
            return False
    
    def synthesize(self, text: str, output_path: str) -> TTSResult:
        """
        使用阿里云 TTS 合成语音
        
        Args:
            text: 要合成的文本
            output_path: 输出音频文件路径
        
        Returns:
            TTSResult: 合成结果
        """
        if not self.available:
            return TTSResult(success=False, error="阿里云 TTS 不可用（缺少 API Key 或 dashscope 库）")
        
        import time
        start_time = time.time()
        
        try:
            from dashscope import SpeechSynthesizer
            
            # 阿里云 TTS API 调用
            response = SpeechSynthesizer.call(
                model=self.model,
                text=text,
                voice="zh-CN-XiaoxiaoNeural",  # 中文女声，自然度高
                format="mp3",
                sample_rate=48000,
                rate=1.0,  # 语速
                volume=50,  # 音量
                pitch=50,  # 音调
            )
            
            # 检查响应是否有错误
            if hasattr(response, 'status_code') and response.status_code != 200:
                return TTSResult(
                    success=False,
                    error=f"阿里云 TTS API 错误：{response.status_code}"
                )
            
            # 获取音频数据
            audio_data = response.get_audio_data()
            if audio_data:
                with open(output_path, 'wb') as f:
                    f.write(audio_data)
                
                duration_ms = int((time.time() - start_time) * 1000)
                return TTSResult(
                    success=True,
                    audio_path=output_path,
                    duration_ms=duration_ms
                )
            else:
                return TTSResult(
                    success=False,
                    error="阿里云 TTS 返回空音频数据"
                )
                
        except Exception as e:
            return TTSResult(
                success=False,
                error=f"阿里云 TTS 异常：{str(e)}"
            )


class SystemTTS:
    """
    系统 TTS 服务
    
    支持多种 TTS 后端（优先级从高到低）：
    1. 小米 MiMo V2 TTS（推荐，已测试可用）
    2. 智谱 AI TTS（推荐，中文 MOS 4.3+，已测试可用）
    3. 阿里云 DashScope TTS（需要原生 API Key）
    4. espeak - 开源 TTS（Linux 默认）
    5. say - macOS 系统 TTS
    6. pyttsx3 - 跨平台离线 TTS
    """
    
    def __init__(self, language: str = "zh-CN", rate: int = 150, prefer_mimo: bool = True):
        self.language = language
        self.rate = rate
        self.prefer_mimo = prefer_mimo
        self.mimo_tts = MimoTTS() if prefer_mimo else None
        self.siliconflow_tts = SiliconFlowTTS()
        self.aliyun_tts = AliyunTTS()
        
        # 调试输出
        if self.mimo_tts:
            print(f"  MiMo TTS 初始化：api_key={'***' if self.mimo_tts.api_key else 'None'}, available={self.mimo_tts.available}")
        if self.siliconflow_tts:
            print(f"  SiliconFlow TTS 初始化：api_key={'***' if self.siliconflow_tts.api_key else 'None'}, available={self.siliconflow_tts.available}")
        if self.aliyun_tts:
            print(f"  AliyunTTS 初始化：api_key={'***' if self.aliyun_tts.api_key else 'None'}, available={self.aliyun_tts.available}")
        
        self.engine = self._detect_engine()
    
    def _detect_engine(self) -> str:
        """检测可用的 TTS 引擎"""
        # 优先尝试小米 MiMo TTS
        if self.prefer_mimo and self.mimo_tts and self.mimo_tts.available:
            print("✅ 小米 MiMo TTS 可用（mimo-v2-tts）")
            return "mimo"
        
        # 其次尝试智谱 AI TTS
        if self.siliconflow_tts and self.siliconflow_tts.available:
            print("✅ 智谱 AI TTS 可用（CosyVoice2/MOSS-TTSD）")
            return "siliconflow"
        
        # 再尝试阿里云 TTS
        if self.aliyun_tts and self.aliyun_tts.available:
            print("✅ 阿里云 TTS 可用（qwen3-tts-instruct-flash）")
            return "aliyun"
        
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
        # 优先使用小米 MiMo TTS
        if self.engine == "mimo" and self.mimo_tts:
            result = self.mimo_tts.synthesize(text, output_path)
            if result.success:
                return result
            # MiMo 失败，降级到其他引擎
            print(f"⚠️  MiMo TTS 失败：{result.error}")
            print("   降级到其他引擎...")
        
        # 其次使用智谱 AI TTS
        if self.engine == "siliconflow" and self.siliconflow_tts:
            result = self.siliconflow_tts.synthesize(text, output_path)
            if result.success:
                return result
            # 智谱 AI 失败，降级到其他引擎
            print(f"⚠️  智谱 AI TTS 失败：{result.error}")
            print("   降级到其他引擎...")
        
        # 再使用阿里云 TTS
        if self.engine == "aliyun" and self.aliyun_tts:
            result = self.aliyun_tts.synthesize(text, output_path)
            if result.success:
                return result
            # 阿里云失败，降级到其他引擎
            print(f"⚠️  阿里云 TTS 失败：{result.error}")
            print("   降级到其他引擎...")
        
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
    import sys
    from dotenv import load_dotenv
    
    # 加载 .env 文件
    env_path = Path(__file__).parent.parent.parent.parent.parent / ".env"
    if env_path.exists():
        load_dotenv(env_path)
        print(f"✅ 已加载 .env 文件：{env_path}")
    else:
        print(f"⚠️  .env 文件不存在：{env_path}")
    
    print("=" * 60)
    print("MetaView TTS 测试工具")
    print("=" * 60)
    
    # 检查阿里云配置
    aliyun_key = os.getenv("DASHSCOPE_API_KEY")
    if aliyun_key:
        print(f"✅ 阿里云 API Key 已配置 ({aliyun_key[:15]}...)")
    else:
        print("❌ 阿里云 API Key 未配置")
        print("   设置方法：export DASHSCOPE_API_KEY='sk-xxx'")
    
    # 检查 dashscope 库
    try:
        import dashscope
        print("✅ dashscope 库已安装")
    except ImportError:
        print("❌ dashscope 库未安装")
        print("   安装命令：pip install dashscope")
    
    print()
    
    # 测试 TTS
    prefer_mimo = "--no-mimo" not in sys.argv  # 默认启用 MiMo，--no-mimo 禁用
    tts = SystemTTS(prefer_mimo=prefer_mimo)
    print(f"检测到 TTS 引擎：{tts.engine}")
    print()
    
    test_text = "欢迎使用 MetaView 数智化学科可视化平台，我是您的智能助手"
    output_file = "/tmp/test_tts_mimo.wav" if prefer_mimo else "/tmp/test_tts.wav"
    
    print(f"测试文本：{test_text}")
    print(f"输出文件：{output_file}")
    print()
    
    result = tts.synthesize(test_text, output_file)
    
    if result.success:
        print(f"✅ TTS 合成成功！")
        print(f"   音频文件：{result.audio_path}")
        print(f"   时长：{result.duration_ms}ms")
        print()
        print("播放命令：")
        if output_file.endswith(".mp3"):
            print(f"   ffplay -nodisp -autoexit {output_file}")
        else:
            print(f"   ffplay {output_file}")
    else:
        print(f"❌ TTS 合成失败：{result.error}")
