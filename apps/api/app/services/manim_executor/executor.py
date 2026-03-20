"""
Manim 执行器服务
负责执行 Manim 脚本并生成视频

类比 ManimCat 的 manim-executor
"""

import subprocess
import os
import tempfile
import shutil
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional
import uuid


@dataclass
class ExecutionConfig:
    """执行配置"""
    python_path: str = "python3"
    manim_cli: str = "manim"
    output_dir: str = "./media"
    quality: str = "m"  # l, m, h, k
    format: str = "mp4"
    disable_caching: bool = True
    timeout_seconds: int = 180


@dataclass
class ExecutionResult:
    """执行结果"""
    success: bool
    video_path: Optional[str] = None
    video_url: Optional[str] = None
    stdout: str = ""
    stderr: str = ""
    error: Optional[str] = None
    duration_ms: int = 0
    metadata: dict = field(default_factory=dict)


class ManimExecutor:
    """
    Manim 执行器
    
    职责:
    1. 执行 Manim 脚本
    2. 管理输出文件
    3. 错误处理与重试
    4. 资源清理
    """
    
    def __init__(self, config: Optional[ExecutionConfig] = None):
        self.config = config or ExecutionConfig()
        self._ensure_output_dir()
    
    def execute(self, code: str, scene_class_name: str = "GeneratedScene", 
                request_id: Optional[str] = None) -> ExecutionResult:
        """
        执行 Manim 脚本
        
        Args:
            code: Python 代码
            scene_class_name: 场景类名
            request_id: 请求 ID (用于文件命名)
        
        Returns:
            ExecutionResult: 执行结果
        """
        import time
        start_time = time.time()
        
        try:
            # 创建临时文件
            with tempfile.NamedTemporaryFile(
                mode='w', 
                suffix='.py', 
                delete=False,
                encoding='utf-8'
            ) as f:
                f.write(code)
                temp_file = f.name
            
            try:
                # 构建命令
                cmd = self._build_command(temp_file, scene_class_name)
                
                # 执行
                result = subprocess.run(
                    cmd,
                    capture_output=True,
                    text=True,
                    timeout=self.config.timeout_seconds,
                    cwd=os.path.dirname(temp_file)
                )
                
                # 检查执行结果
                if result.returncode != 0:
                    return ExecutionResult(
                        success=False,
                        stderr=result.stderr,
                        error=f"Manim 执行失败：{result.stderr[:500]}"
                    )
                
                # 查找生成的视频
                video_path = self._find_video_file(scene_class_name)
                
                if not video_path:
                    return ExecutionResult(
                        success=False,
                        error="未找到生成的视频文件"
                    )
                
                # 生成 URL
                video_url = self._generate_video_url(video_path, request_id)
                
                duration_ms = int((time.time() - start_time) * 1000)
                
                return ExecutionResult(
                    success=True,
                    video_path=video_path,
                    video_url=video_url,
                    stdout=result.stdout[-1000:],  # 只保留最后 1000 行
                    stderr=result.stderr[-1000:],
                    duration_ms=duration_ms,
                    metadata={
                        "scene_class": scene_class_name,
                        "quality": self.config.quality,
                        "format": self.config.format
                    }
                )
                
            finally:
                # 清理临时文件
                self._cleanup_temp_file(temp_file)
                
        except subprocess.TimeoutExpired:
            return ExecutionResult(
                success=False,
                error=f"执行超时 ({self.config.timeout_seconds}秒)"
            )
        except Exception as e:
            return ExecutionResult(
                success=False,
                error=f"执行异常：{str(e)}"
            )
    
    def _build_command(self, script_path: str, scene_class_name: str) -> list[str]:
        """构建执行命令"""
        cmd = [
            self.config.python_path,
            "-m",
            self.config.manim_cli,
            script_path,
            scene_class_name,
            f"-{self.config.quality}",  # 质量
            f"--format={self.config.format}",
        ]
        
        if self.config.disable_caching:
            cmd.append("--disable_caching")
        
        # 输出目录
        cmd.extend(["--media_dir", self.config.output_dir])
        
        return cmd
    
    def _find_video_file(self, scene_class_name: str) -> Optional[str]:
        """查找生成的视频文件"""
        # Manim 默认输出路径
        possible_paths = [
            Path(self.config.output_dir) / "videos" / "**" / f"{scene_class_name}.mp4",
            Path(self.config.output_dir) / "videos" / "**" / f"{scene_class_name}.mov",
            Path(self.config.output_dir) / "videos" / "**" / "*.mp4",
        ]
        
        for pattern in possible_paths:
            for video_file in Path(self.config.output_dir).rglob(pattern.name):
                if video_file.exists():
                    return str(video_file)
        
        return None
    
    def _generate_video_url(self, video_path: str, request_id: Optional[str] = None) -> str:
        """生成视频 URL"""
        if request_id:
            # 复制到请求目录
            request_dir = Path(self.config.output_dir) / "requests" / request_id
            request_dir.mkdir(parents=True, exist_ok=True)
            
            dest_path = request_dir / "video.mp4"
            shutil.copy2(video_path, dest_path)
            
            return f"/preview-media/{request_id}/video.mp4"
        
        # 返回相对路径
        return f"/preview-media/{Path(video_path).name}"
    
    def _cleanup_temp_file(self, temp_file: str):
        """清理临时文件"""
        try:
            if os.path.exists(temp_file):
                os.remove(temp_file)
        except Exception:
            pass
    
    def _ensure_output_dir(self):
        """确保输出目录存在"""
        Path(self.config.output_dir).mkdir(parents=True, exist_ok=True)
        (Path(self.config.output_dir) / "requests").mkdir(parents=True, exist_ok=True)
    
    def test_connection(self) -> bool:
        """测试 Manim 连接"""
        try:
            result = subprocess.run(
                [self.config.python_path, "-m", self.config.manim_cli, "--version"],
                capture_output=True,
                text=True,
                timeout=10
            )
            return result.returncode == 0
        except Exception:
            return False
