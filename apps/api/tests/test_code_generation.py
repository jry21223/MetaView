"""
代码生成服务测试
"""

import pytest
from app.services.code_generation import CodeGenerator, CodeGenerationResult
from app.services.concept_design import ConceptDesign, SceneDesign


class TestCodeGenerator:
    """代码生成器测试"""
    
    def setup_method(self):
        """测试前设置"""
        self.generator = CodeGenerator()
    
    def test_generate_basic(self):
        """测试基本代码生成"""
        concept = ConceptDesign(
            title="冒泡排序可视化",
            description="可视化冒泡排序算法过程",
            domain="algorithm",
            objects=["数组", "指针"],
            key_moments=["初始状态", "比较交换", "结果展示"]
        )
        
        scenes = [
            SceneDesign(
                scene_id="scene_1",
                title="开场",
                objects=["数组"],
                actions=["展示"],
                transitions=["fade_in"],
                camera_moves=["zoom_in"],
                duration=5.0
            )
        ]
        
        result = self.generator.generate(concept, scenes)
        
        assert result.success is True
        assert result.code is not None
        assert "class GeneratedScene" in result.code
        assert "from manim import" in result.code
        assert "def construct" in result.code
    
    def test_code_framework(self):
        """测试代码框架生成"""
        concept = ConceptDesign(
            title="测试",
            description="测试描述",
            domain="algorithm",
            complexity_score=2,
            duration_estimate=20.0,
            visual_style="tech_minimal"
        )
        
        code = self.generator._generate_code_framework(concept)
        
        assert "class GeneratedScene" in code
        assert "def construct" in code
        assert "title = Text" in code
    
    def test_scene_code_generation(self):
        """测试场景代码生成"""
        scene = SceneDesign(
            scene_id="scene_1",
            title="测试场景",
            objects=["对象 A", "对象 B"],
            actions=["动作 1"],
            transitions=["transform"],
            camera_moves=["pan"],
            duration=8.0
        )
        
        code = self.generator._generate_scene_code(scene)
        
        assert "对象 A" in code
        assert "对象 B" in code
        assert "self.play" in code
        assert "self.wait" in code
    
    def test_code_validation(self):
        """测试代码验证"""
        # 有效代码
        valid_code = """
from manim import *

class TestScene(Scene):
    def construct(self):
        self.play(Write(Text("Hello")))
        self.wait(1)
"""
        diagnostics = self.generator._validate_code(valid_code)
        assert len(diagnostics) == 0 or all("警告" in d or "提示" in d for d in diagnostics)
        
        # 缺少 manim 导入
        invalid_code = """
class TestScene(Scene):
    def construct(self):
        pass
"""
        diagnostics = self.generator._validate_code(invalid_code)
        assert any("manim" in d for d in diagnostics)
    
    def test_summary_generation(self):
        """测试总结代码生成"""
        concept = ConceptDesign(
            title="测试",
            description="这是一个很长的描述" * 10,
            domain="algorithm"
        )
        
        code = self.generator._generate_summary_code(concept)
        
        assert "总结" in code
        assert "self.play" in code


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
