"""
ManimCat 风格的代码生成服务
根据概念设计生成 Manim 代码

两阶段 AI 生成：
1. 概念设计阶段 - 由 ConceptDesigner 完成
2. 代码生成阶段 - 由 CodeGenerator 完成
"""

from dataclasses import dataclass, field
from typing import Optional
from .concept_design import ConceptDesign, SceneDesign


@dataclass
class CodeGenerationResult:
    """代码生成结果"""
    success: bool
    code: Optional[str] = None
    scene_class_name: str = "GeneratedScene"
    diagnostics: list[str] = field(default_factory=list)
    error: Optional[str] = None
    metadata: dict = field(default_factory=dict)


class CodeGenerator:
    """
    代码生成器 - 两阶段 AI 生成的第二阶段
    
    职责:
    1. 接收概念设计
    2. 生成 Manim 场景代码
    3. 代码验证与优化
    4. 输出可执行脚本
    """
    
    def __init__(self, model_provider=None):
        self.model_provider = model_provider
    
    def generate(self, concept: ConceptDesign, scenes: list[SceneDesign], **kwargs) -> CodeGenerationResult:
        """
        生成 Manim 代码
        
        Args:
            concept: 概念设计
            scenes: 场景列表
            **kwargs: 额外参数
        
        Returns:
            CodeGenerationResult: 代码生成结果
        """
        try:
            # 生成代码框架
            code = self._generate_code_framework(concept)
            
            # 生成场景代码
            for scene in scenes:
                scene_code = self._generate_scene_code(scene)
                code += f"\n{scene_code}\n"
            
            # 生成总结代码
            code += self._generate_summary_code(concept)
            
            return CodeGenerationResult(
                success=True,
                code=code,
                scene_class_name="GeneratedScene",
                diagnostics=self._validate_code(code),
                metadata={
                    "stage": "code_generation",
                    "lines_of_code": len(code.split('\n')),
                    "scenes_generated": len(scenes)
                }
            )
        except Exception as e:
            return CodeGenerationResult(
                success=False,
                error=str(e)
            )
    
    def _generate_code_framework(self, concept: ConceptDesign) -> str:
        """生成代码框架"""
        return f'''from manim import *


class GeneratedScene(Scene):
    """
    {concept.title}
    
    领域：{concept.domain}
    复杂度：{concept.complexity_score}/5
    预估时长：{concept.duration_estimate}秒
    视觉风格：{concept.visual_style}
    """
    
    def construct(self):
        # 标题
        title = Text("{concept.title}", font_size=48, color=WHITE)
        title.to_edge(UP)
        self.play(Write(title))
        self.wait(1)
        
        # 副标题
        subtitle = Text("{concept.description[:100]}...", font_size=24, color=GRAY)
        subtitle.next_to(title, DOWN)
        self.play(FadeIn(subtitle))
        self.wait(1)
        
        # 淡出标题
        self.play(FadeOut(VGroup(title, subtitle)))
'''
    
    def _generate_scene_code(self, scene: SceneDesign) -> str:
        """生成场景代码"""
        objects_var = "_".join([obj[:3] for obj in scene.objects[:3]])
        
        code = f'''
        # ========== {scene.title} ==========
        # 对象：{", ".join(scene.objects)}
        # 动作：{", ".join(scene.actions)}
        # 时长：{scene.duration}秒
        
        # 创建场景容器
        {objects_var}_group = VGroup()
        
        # 创建对象
'''
        
        # 为每个对象生成代码
        for i, obj in enumerate(scene.objects[:5]):
            code += f'''        {obj.lower().replace(" ", "_")}_{i} = Text("{obj}", font_size=32)
'''
        
        code += f'''
        # 排列对象
        {objects_var}_group.add({", ".join([f"{obj.lower().replace(" ", "_")}_{i}" for i, obj in enumerate(scene.objects[:5])])})
        {objects_var}_group.arrange(RIGHT, buff=0.5)
        
        # 入场动画
        self.play(Create({objects_var}_group))
        self.wait({scene.duration / 2})
        
        # 执行动作
'''
        
        # 为每个动作生成代码
        for action in scene.actions:
            code += f'''        # TODO: 实现动作 - {action}
        self.play({objects_var}_group.animate.scale(1.1))
        self.wait(0.5)
        
'''
        
        # 转场
        if scene.transitions:
            code += f'''        # 转场：{", ".join(scene.transitions)}
        self.play(FadeOut({objects_var}_group))
        
'''
        
        return code
    
    def _generate_summary_code(self, concept: ConceptDesign) -> str:
        """生成总结代码"""
        return f'''
        # ========== 总结 ==========
        summary_title = Text("总结", font_size=40, color=WHITE)
        summary_title.to_edge(UP)
        
        summary_text = Text("{concept.description[:200]}...", font_size=28, color=GRAY)
        summary_text.next_to(summary_title, DOWN)
        
        self.play(Write(summary_title))
        self.play(FadeIn(summary_text))
        self.wait(2)
        
        # 结束
        self.play(FadeOut(VGroup(summary_title, summary_text)))
        self.wait(0.5)
'''
    
    def _validate_code(self, code: str) -> list[str]:
        """验证代码"""
        diagnostics = []
        
        # 检查基本结构
        if "class" not in code:
            diagnostics.append("警告：未检测到类定义")
        
        if "def construct" not in code:
            diagnostics.append("警告：未检测到 construct 方法")
        
        if "from manim import" not in code:
            diagnostics.append("警告：未导入 manim 模块")
        
        if "self.play" not in code:
            diagnostics.append("警告：未检测到 self.play 调用")
        
        if "self.wait" not in code:
            diagnostics.append("提示：建议添加 self.wait 控制节奏")
        
        # 代码行数检查
        lines = code.split('\n')
        if len(lines) > 500:
            diagnostics.append("提示：代码较长，建议拆分")
        
        return diagnostics
