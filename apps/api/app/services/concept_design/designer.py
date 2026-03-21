"""
ManimCat 风格的概念设计服务
将用户输入转换为结构化的动画概念设计

两阶段 AI 生成：
1. 概念设计阶段 - 提取动画核心概念、对象、场景
2. 代码生成阶段 - 根据概念设计生成 Manim 代码
"""

from dataclasses import dataclass, field
from typing import Optional
import json


@dataclass
class ConceptDesign:
    """动画概念设计"""
    title: str
    description: str
    domain: str
    objects: list[str] = field(default_factory=list)
    relationships: list[str] = field(default_factory=list)
    constraints: list[str] = field(default_factory=list)
    key_moments: list[str] = field(default_factory=list)
    visual_style: str = "default"
    duration_estimate: float = 30.0  # 秒
    complexity_score: int = 1  # 1-5


@dataclass
class SceneDesign:
    """场景设计"""
    scene_id: str
    title: str
    objects: list[str]
    actions: list[str]
    transitions: list[str]
    camera_moves: list[str]
    duration: float


@dataclass
class ConceptDesignResult:
    """概念设计结果"""
    success: bool
    concept: Optional[ConceptDesign] = None
    scenes: list[SceneDesign] = field(default_factory=list)
    error: Optional[str] = None
    metadata: dict = field(default_factory=dict)


class ConceptDesigner:
    """
    概念设计师 - 两阶段 AI 生成的第一阶段
    
    职责:
    1. 解析用户输入
    2. 提取动画概念
    3. 设计场景结构
    4. 输出结构化设计文档
    """
    
    def __init__(self, model_provider=None):
        self.model_provider = model_provider
    
    def design(self, prompt: str, **kwargs) -> ConceptDesignResult:
        """
        执行概念设计
        
        Args:
            prompt: 用户输入
            **kwargs: 额外参数 (source_image, source_code 等)
        
        Returns:
            ConceptDesignResult: 概念设计结果
        """
        try:
            # 第一阶段：提取核心概念
            concept = self._extract_concept(prompt, **kwargs)
            
            # 第二阶段：设计场景
            scenes = self._design_scenes(concept)
            
            return ConceptDesignResult(
                success=True,
                concept=concept,
                scenes=scenes,
                metadata={
                    "stage": "concept_design",
                    "objects_count": len(concept.objects),
                    "scenes_count": len(scenes)
                }
            )
        except Exception as e:
            return ConceptDesignResult(
                success=False,
                error=str(e)
            )
    
    def _extract_concept(self, prompt: str, **kwargs) -> ConceptDesign:
        """提取核心概念"""
        # TODO: 调用 AI 模型提取概念
        # 这里先实现基础版本
        
        # 分析关键词
        domain = self._detect_domain(prompt)
        objects = self._extract_objects(prompt, domain)
        relationships = self._extract_relationships(prompt, objects)
        constraints = self._extract_constraints(prompt, domain)
        key_moments = self._extract_key_moments(prompt)
        
        return ConceptDesign(
            title=self._generate_title(prompt),
            description=prompt[:500],
            domain=domain,
            objects=objects,
            relationships=relationships,
            constraints=constraints,
            key_moments=key_moments,
            visual_style=self._detect_visual_style(domain),
            duration_estimate=self._estimate_duration(key_moments),
            complexity_score=self._calculate_complexity(objects, relationships)
        )
    
    def _design_scenes(self, concept: ConceptDesign) -> list[SceneDesign]:
        """设计场景结构"""
        scenes = []
        
        # 开场场景
        scenes.append(SceneDesign(
            scene_id="scene_intro",
            title="开场介绍",
            objects=concept.objects[:3],
            actions=["展示标题", "介绍核心对象"],
            transitions=["fade_in"],
            camera_moves=["zoom_in"],
            duration=5.0
        ))
        
        # 核心场景 (根据 key_moments)
        for i, moment in enumerate(concept.key_moments[:3]):
            scenes.append(SceneDesign(
                scene_id=f"scene_core_{i}",
                title=f"核心场景 {i+1}",
                objects=concept.objects,
                actions=[moment],
                transitions=["transform"],
                camera_moves=["pan"],
                duration=8.0
            ))
        
        # 总结场景
        scenes.append(SceneDesign(
            scene_id="scene_summary",
            title="总结",
            objects=[],
            actions=["展示结论", "回顾要点"],
            transitions=["fade_out"],
            camera_moves=["zoom_out"],
            duration=5.0
        ))
        
        return scenes
    
    def _detect_domain(self, prompt: str) -> str:
        """检测学科领域"""
        prompt_lower = prompt.lower()
        
        domain_keywords = {
            "algorithm": ["算法", "排序", "查找", "图论", "动态规划"],
            "math": ["数学", "函数", "导数", "积分", "矩阵"],
            "physics": ["物理", "受力", "加速度", "电路", "磁场", "运动", "抛体", "平抛"],
            "chemistry": ["化学", "分子", "原子", "反应", "化学键"],
            "biology": ["生物", "细胞", "基因", "代谢", "生态"],
            "geography": ["地理", "板块", "洋流", "气候", "人口"],
        }
        
        for domain, keywords in domain_keywords.items():
            if any(kw in prompt_lower for kw in keywords):
                return domain
        
        return "algorithm"
    
    def _extract_objects(self, prompt: str, domain: str) -> list[str]:
        """提取对象"""
        # 简化版本，实际应该用 AI 提取
        objects = []
        
        if domain == "algorithm":
            if "排序" in prompt:
                objects = ["数组", "指针", "临时变量"]
            elif "图" in prompt:
                objects = ["节点", "边", "路径"]
            elif "树" in prompt:
                objects = ["根节点", "子节点", "叶子"]
            else:
                objects = ["输入", "状态", "输出"]
        
        elif domain == "physics":
            objects = ["物体", "力", "速度", "加速度"]
        
        elif domain == "math":
            objects = ["函数", "坐标", "曲线"]
        
        return objects
    
    def _extract_relationships(self, prompt: str, objects: list[str]) -> list[str]:
        """提取关系"""
        relationships = []
        
        if len(objects) >= 2:
            relationships.append(f"{objects[0]} 与 {objects[1]} 的交互")
        
        return relationships
    
    def _extract_constraints(self, prompt: str, domain: str) -> list[str]:
        """提取约束条件"""
        constraints = []
        
        if domain == "physics":
            constraints.append("符合物理定律")
            constraints.append("单位一致性")
        
        elif domain == "math":
            constraints.append("数学严谨性")
            constraints.append("公式推导连续")
        
        return constraints
    
    def _extract_key_moments(self, prompt: str) -> list[str]:
        """提取关键时刻"""
        # 简化版本
        return ["初始状态", "过程演示", "结果展示"]
    
    def _generate_title(self, prompt: str) -> str:
        """生成标题"""
        if len(prompt) <= 24:
            return prompt
        return f"{prompt[:24]}..."
    
    def _detect_visual_style(self, domain: str) -> str:
        """检测视觉风格"""
        styles = {
            "algorithm": "tech_minimal",
            "math": "academic_clean",
            "physics": "realistic_diagram",
            "chemistry": "molecular_visual",
            "biology": "organic_illustration",
            "geography": "map_overlay"
        }
        return styles.get(domain, "default")
    
    def _estimate_duration(self, key_moments: list[str]) -> float:
        """估算时长"""
        base_duration = 5.0  # 开场 + 总结
        moment_duration = len(key_moments) * 8.0  # 每个关键时刻 8 秒
        return base_duration + moment_duration
    
    def _calculate_complexity(self, objects: list[str], relationships: list[str]) -> int:
        """计算复杂度 (1-5)"""
        score = 1
        
        # 对象数量
        if len(objects) > 5:
            score += 1
        if len(objects) > 10:
            score += 1
        
        # 关系数量
        if len(relationships) > 3:
            score += 1
        
        # 上限 5
        return min(score, 5)
