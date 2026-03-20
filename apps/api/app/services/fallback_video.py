#!/usr/bin/env python3
"""
简单的视频生成脚本 - 用于 fallback 模式
生成一个带有标题的简单动画视频
"""

from pathlib import Path
import subprocess
import sys

def generate_fallback_video(output_path: str, title: str = "MetaView"):
    """使用 ffmpeg 生成一个简单的 fallback 视频"""
    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    
    # 使用 ffmpeg 生成一个简单的彩色条测试视频
    cmd = [
        "ffmpeg",
        "-y",  # 覆盖输出
        "-f", "lavfi",
        "-i", "testsrc=duration=5:size=1280x720:rate=30",  # 5 秒测试信号
        "-f", "lavfi",
        "-i", "sine=frequency=440:duration=5",  # 440Hz 音频
        "-vf", f"drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:text='{title}':x=(w-text_w)/2:y=(h-text_h)/2:fontsize=48:fontcolor=white",
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "23",
        "-c:a", "aac",
        "-b:a", "128k",
        "-shortest",
        str(output)
    ]
    
    try:
        subprocess.run(cmd, check=True, capture_output=True, timeout=30)
        return True, str(output)
    except subprocess.CalledProcessError as e:
        print(f"FFmpeg error: {e}", file=sys.stderr)
        return False, None
    except FileNotFoundError:
        print("FFmpeg not found", file=sys.stderr)
        return False, None
    except subprocess.TimeoutExpired:
        print("Timeout", file=sys.stderr)
        return False, None

if __name__ == "__main__":
    output = sys.argv[1] if len(sys.argv) > 1 else "/tmp/test.mp4"
    title = sys.argv[2] if len(sys.argv) > 2 else "MetaView Test"
    
    success, path = generate_fallback_video(output, title)
    if success:
        print(f"✓ Video generated: {path}")
        sys.exit(0)
    else:
        print("✗ Failed to generate video")
        sys.exit(1)
