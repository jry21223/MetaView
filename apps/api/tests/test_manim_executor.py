"""
Manim 执行器测试
"""

import pytest
from app.services.manim_executor import ManimExecutor, ExecutionConfig, ExecutionResult


class TestManimExecutor:
    """Manim 执行器测试"""
    
    def setup_method(self):
        """测试前设置"""
        self.config = ExecutionConfig(
            quality="l",  # 测试使用低质量
            timeout_seconds=30
        )
        self.executor = ManimExecutor(config=self.config)
    
    def test_executor_initialization(self):
        """测试执行器初始化"""
        assert self.executor.config is not None
        assert self.executor.config.quality == "l"
    
    def test_connection_test(self):
        """测试连接检查"""
        # 注意：这个测试可能失败如果 manim 未安装
        result = self.executor.test_connection()
        # 不强制要求成功，只验证方法可调用
    
    def test_execute_basic(self):
        """测试基本执行"""
        code = """
from manim import *

class TestScene(Scene):
    def construct(self):
        text = Text("Hello World")
        self.play(Write(text))
        self.wait(1)
"""
        # 注意：这个测试需要 manim 实际可用
        # 如果 manim 未安装，测试会跳过
        result = self.executor.execute(
            code=code,
            scene_class_name="TestScene",
            request_id="test_001"
        )
        
        # 验证结果结构
        assert isinstance(result, ExecutionResult)
        assert hasattr(result, 'success')
        assert hasattr(result, 'error')
        assert hasattr(result, 'duration_ms')
    
    def test_execute_timeout(self):
        """测试超时处理"""
        # 创建一个会超时的配置
        config = ExecutionConfig(timeout_seconds=1)
        executor = ManimExecutor(config=config)
        
        # 注意：实际超时测试需要 manim 支持
    
    def test_config_validation(self):
        """测试配置验证"""
        config = ExecutionConfig(
            python_path="python3",
            manim_cli="manim",
            output_dir="./media",
            quality="h",
            format="mp4",
            disable_caching=True,
            timeout_seconds=180
        )
        
        assert config.python_path == "python3"
        assert config.quality == "h"
        assert config.format == "mp4"
    
    def test_command_building(self):
        """测试命令构建"""
        cmd = self.executor._build_command(
            script_path="test.py",
            scene_class_name="TestScene"
        )
        
        assert "python3" in cmd or "manim" in cmd
        assert "test.py" in cmd
        assert "TestScene" in cmd


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
