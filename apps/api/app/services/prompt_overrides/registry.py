"""
提示词覆盖服务
提供针对不同学科和场景的提示词模板覆盖

类比 ManimCat 的 prompt-overrides
"""

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class PromptOverride:
    """提示词覆盖"""
    id: str
    name: str
    domain: str
    stage: str  # concept_design, code_generation, critique
    template: str
    variables: list[str] = field(default_factory=list)
    metadata: dict = field(default_factory=dict)
    
    def render(self, **kwargs) -> str:
        """渲染提示词"""
        template = self.template
        for key, value in kwargs.items():
            template = template.replace(f"{{{key}}}", str(value))
        return template


class PromptOverrideRegistry:
    """
    提示词覆盖注册表
    
    职责:
    1. 管理提示词模板
    2. 按学科/场景提供覆盖
    3. 支持动态注册
    """
    
    def __init__(self):
        self._overrides: dict[str, PromptOverride] = {}
        self._register_defaults()
    
    def register(self, override: PromptOverride):
        """注册提示词覆盖"""
        self._overrides[override.id] = override
    
    def get(self, override_id: str) -> Optional[PromptOverride]:
        """获取提示词覆盖"""
        return self._overrides.get(override_id)
    
    def get_for_domain(self, domain: str, stage: str) -> list[PromptOverride]:
        """获取指定学科和阶段的提示词覆盖"""
        return [
            o for o in self._overrides.values()
            if o.domain == domain and o.stage == stage
        ]
    
    def render(self, override_id: str, **kwargs) -> Optional[str]:
        """渲染提示词"""
        override = self.get(override_id)
        if not override:
            return None
        return override.render(**kwargs)
    
    def list_overrides(self) -> list[PromptOverride]:
        """列出所有提示词覆盖"""
        return list(self._overrides.values())
    
    def _register_defaults(self):
        """注册默认提示词覆盖"""
        
        # ========== 算法领域 ==========
        self.register(PromptOverride(
            id="algorithm_concept_v1",
            name="算法概念设计 v1",
            domain="algorithm",
            stage="concept_design",
            template="""你是一个算法可视化专家。

任务：为以下算法创建动画概念设计
算法：{algorithm_name}
输入：{input_description}
输出：{output_description}

请提取:
1. 核心数据结构 (数组/链表/树/图等)
2. 关键变量和状态
3. 算法的主要步骤
4. 需要高亮的关键时刻

约束:
- 保持视觉清晰
- 突出状态变化
- 显示复杂度分析""",
            variables=["algorithm_name", "input_description", "output_description"]
        ))
        
        self.register(PromptOverride(
            id="algorithm_code_v1",
            name="算法代码生成 v1",
            domain="algorithm",
            stage="code_generation",
            template="""根据概念设计生成 Manim 代码。

概念设计:
{concept_design}

要求:
1. 使用 Text 和 Rectangle 展示数据结构
2. 用颜色区分不同状态
3. 添加 self.play 动画展示变化
4. 包含 self.wait 控制节奏
5. 添加注释说明每一步

视觉风格：tech_minimal""",
            variables=["concept_design"]
        ))
        
        # ========== 数学领域 ==========
        self.register(PromptOverride(
            id="math_concept_v1",
            name="数学概念设计 v1",
            domain="math",
            stage="concept_design",
            template="""你是一个数学可视化专家。

任务：为以下数学概念创建动画设计
主题：{math_topic}
公式：{formula}
应用场景：{application}

请提取:
1. 核心数学对象 (函数/图形/变换等)
2. 坐标系和范围
3. 推导步骤
4. 关键转折点

约束:
- 公式推导连续
- 保持数学严谨
- 显示几何直观""",
            variables=["math_topic", "formula", "application"]
        ))
        
        self.register(PromptOverride(
            id="math_code_v1",
            name="数学代码生成 v1",
            domain="math",
            stage="code_generation",
            template="""根据概念设计生成 Manim 代码。

概念设计:
{concept_design}

要求:
1. 使用 Axes 或 NumberPlane 建立坐标系
2. 使用 MathTex 渲染公式
3. 使用 Transform 展示推导过程
4. 保持公式变量命名一致
5. 添加几何解释

视觉风格：academic_clean""",
            variables=["concept_design"]
        ))
        
        # ========== 物理领域 ==========
        self.register(PromptOverride(
            id="physics_concept_v1",
            name="物理概念设计 v1",
            domain="physics",
            stage="concept_design",
            template="""你是一个物理模拟专家。

任务：为以下物理场景创建动画设计
主题：{physics_topic}
对象：{objects}
物理定律：{physics_laws}
初始条件：{initial_conditions}

请提取:
1. 受力对象和方向
2. 运动约束
3. 守恒关系
4. 时间演化过程

约束:
- 符合物理定律
- 单位一致性
- 方向正确""",
            variables=["physics_topic", "objects", "physics_laws", "initial_conditions"]
        ))
        
        self.register(PromptOverride(
            id="physics_code_v1",
            name="物理代码生成 v1",
            domain="physics",
            stage="code_generation",
            template="""根据概念设计生成 Manim 代码。

概念设计:
{concept_design}

要求:
1. 使用 Arrow 展示力和速度
2. 使用 Dot 或 Circle 表示物体
3. 使用 ValueTracker 跟踪变量
4. 使用 always_redraw 创建动态更新
5. 显示物理公式

视觉风格：realistic_diagram""",
            variables=["concept_design"]
        ))
        
        # ========== 通用提示词 ==========
        self.register(PromptOverride(
            id="critique_general_v1",
            name="通用评论 v1",
            domain="general",
            stage="critique",
            template="""请检查以下内容:

CIR 文档:
{cir_document}

生成的代码:
{generated_code}

检查项:
1. CIR 步骤是否连贯
2. 代码是否实现 CIR 描述
3. 动画节奏是否合理
4. 视觉元素是否清晰
5. 是否存在技术错误

请提供具体改进建议。""",
            variables=["cir_document", "generated_code"]
        ))
    
    def export_templates(self) -> dict:
        """导出所有模板"""
        return {
            override.id: {
                "name": override.name,
                "domain": override.domain,
                "stage": override.stage,
                "template": override.template,
                "variables": override.variables
            }
            for override in self._overrides.values()
        }
