from __future__ import annotations

from dataclasses import dataclass

from app.schemas import SkillDescriptor, TopicDomain, VisualKind


@dataclass(frozen=True)
class SubjectSkill:
    descriptor: SkillDescriptor
    planning_focus: str
    critique_checks: tuple[str, ...]
    visual_sequence: tuple[VisualKind, ...]

    def planning_brief(self, *, has_image: bool) -> str:
        notes = list(self.descriptor.execution_notes)
        if has_image and self.descriptor.supports_image_input:
            notes.append("当前输入附带静态题目图片，先提取对象、受力、约束与已知量，再生成动画。")
        return (
            f"skill={self.descriptor.id}\n"
            f"domain={self.descriptor.domain.value}\n"
            f"focus={self.planning_focus}\n"
            f"notes={' | '.join(notes)}"
        )


class SubjectSkillRegistry:
    def __init__(self) -> None:
        self._skills: dict[TopicDomain, SubjectSkill] = {
            TopicDomain.ALGORITHM: SubjectSkill(
                descriptor=SkillDescriptor(
                    id="algorithm-process-viz",
                    domain=TopicDomain.ALGORITHM,
                    label="算法过程可视化",
                    description="将排序、搜索、图论与动态规划的状态迁移过程转成可交互动画。",
                    version="1.0.0",
                    triggers=["可视化算法", "排序演示", "图论遍历", "状态转移"],
                    dependencies=["manim-web", "manim-algorithm", "manim-code-blocks"],
                    supports_image_input=False,
                    execution_notes=[
                        "提取循环、条件分支与关键变量的数值演变。",
                        "为核心状态建立可追踪的时间线与代码高亮对齐。",
                        "若出现递归，优先把调用栈拆成独立镜头。",
                    ],
                ),
                planning_focus="把代码逻辑拆成状态机，并保持每一步的变量变化可追踪。",
                critique_checks=(
                    "检查代码高亮与状态迁移是否同步。",
                    "检查递归或回溯是否显式展示调用栈。",
                ),
                visual_sequence=(VisualKind.ARRAY, VisualKind.FLOW, VisualKind.TEXT),
            ),
            TopicDomain.MATH: SubjectSkill(
                descriptor=SkillDescriptor(
                    id="math-theorem-walkthrough",
                    domain=TopicDomain.MATH,
                    label="数学定理攻略",
                    description="生成数学证明、函数图像和线性代数变换的视觉步进动画。",
                    version="1.0.0",
                    triggers=["数学证明", "函数图像绘制", "几何变换", "微积分演示"],
                    dependencies=["manim-web", "katex", "sympy", "numpy"],
                    supports_image_input=False,
                    execution_notes=[
                        "先定义坐标系、对象与初始位置。",
                        "优先用公式形变展示推导，不要跳步。",
                        "涉及导数或积分时必须显式跟踪变量与区域变化。",
                    ],
                ),
                planning_focus="保持公式推导连续、对象关系清晰，并给出可复盘的结论页。",
                critique_checks=(
                    "检查公式形变前后变量命名是否一致。",
                    "检查图像、坐标轴和解析表达式是否数值对齐。",
                ),
                visual_sequence=(VisualKind.FORMULA, VisualKind.FORMULA, VisualKind.TEXT),
            ),
            TopicDomain.PHYSICS: SubjectSkill(
                descriptor=SkillDescriptor(
                    id="physics-simulation-viz",
                    domain=TopicDomain.PHYSICS,
                    label="物理模拟可视化",
                    description="支持力学、电学与场论过程演示，并可从静态题目图片提取对象关系。",
                    version="1.0.0",
                    triggers=["物理模拟", "力学实验", "电路分析", "电磁场演示"],
                    dependencies=["manim-web", "manim-physics", "manim-circuit"],
                    supports_image_input=True,
                    execution_notes=[
                        "若输入为题图，先提取受力对象、边界条件、已知量与目标量。",
                        "电路题要显式标注元件拓扑、端点和等效关系。",
                        "动力学过程必须对齐牛顿定律、能量守恒或电路基本定律。",
                    ],
                ),
                planning_focus="先做物理建模，再生成时间演化，避免只复刻题面图形而忽略定律约束。",
                critique_checks=(
                    "检查受力、方向、单位与运动趋势是否自洽。",
                    "检查从题图提取出的几何关系是否影响运动约束。",
                ),
                visual_sequence=(VisualKind.MOTION, VisualKind.MOTION, VisualKind.TEXT),
            ),
            TopicDomain.CHEMISTRY: SubjectSkill(
                descriptor=SkillDescriptor(
                    id="molecular-structure-viz",
                    domain=TopicDomain.CHEMISTRY,
                    label="分子结构可视化",
                    description="解析分子结构、键变化与反应机理，生成球棍模型与过程动画。",
                    version="1.0.0",
                    triggers=["分子结构", "化学反应演示", "分子键断裂", "原子轨道"],
                    dependencies=["manim-web", "manim-chemistry", "rdkit"],
                    supports_image_input=False,
                    execution_notes=[
                        "优先表达键连接、构型变化与反应前后重组。",
                        "在关键断键或成键时同步给出能量或条件说明。",
                        "审查生成构型是否违反基本化合价规则。",
                    ],
                ),
                planning_focus="把分子结构变化、能量条件和反应机理拆成连贯镜头。",
                critique_checks=(
                    "检查原子连接关系与价态是否合理。",
                    "检查反应前后结构重组是否可追踪。",
                ),
                visual_sequence=(VisualKind.MOLECULE, VisualKind.MOLECULE, VisualKind.TEXT),
            ),
            TopicDomain.BIOLOGY: SubjectSkill(
                descriptor=SkillDescriptor(
                    id="biology-process-viz",
                    domain=TopicDomain.BIOLOGY,
                    label="生物过程可视化",
                    description="用于细胞、遗传、代谢与生态系统中具有阶段性变化的知识过程。",
                    version="1.0.0",
                    triggers=["细胞分裂", "遗传规律", "代谢通路", "生态系统"],
                    dependencies=["manim-web", "numpy"],
                    supports_image_input=False,
                    execution_notes=[
                        "先明确结构层级，再展示过程阶段。",
                        "涉及因果链时，优先把调控关系拆成箭头网络。",
                        "细胞或生态过程要避免把多个尺度混到同一帧。",
                    ],
                ),
                planning_focus="突出生命过程中的结构层级、阶段切换和因果路径。",
                critique_checks=(
                    "检查阶段顺序和名词层级是否正确。",
                    "检查通路箭头是否表达激活、抑制或流向差异。",
                ),
                visual_sequence=(VisualKind.CELL, VisualKind.FLOW, VisualKind.TEXT),
            ),
            TopicDomain.GEOGRAPHY: SubjectSkill(
                descriptor=SkillDescriptor(
                    id="geospatial-process-viz",
                    domain=TopicDomain.GEOGRAPHY,
                    label="地理演化可视化",
                    description="展示板块运动、水循环、人口迁移和区域空间演化过程。",
                    version="1.0.0",
                    triggers=["板块运动", "水循环", "人口迁移", "区域分析"],
                    dependencies=["manim-web", "geopandas", "matplotlib"],
                    supports_image_input=False,
                    execution_notes=[
                        "先固定地理底图或区域边界，再叠加时间变化。",
                        "处理迁移、环流或板块运动时必须保持方向与尺度可读。",
                        "大规模空间要素优先压缩成区域块，避免单帧过载。",
                    ],
                ),
                planning_focus="把空间底图、时间演化和区域差异拆成可比较的镜头。",
                critique_checks=(
                    "检查空间方向、迁移路径和区域名称是否一致。",
                    "检查时间序列变化是否从同一底图坐标系出发。",
                ),
                visual_sequence=(VisualKind.MAP, VisualKind.MAP, VisualKind.TEXT),
            ),
        }

    def get(self, domain: TopicDomain) -> SubjectSkill:
        return self._skills[domain]

    def list_descriptors(self) -> list[SkillDescriptor]:
        return [skill.descriptor for skill in self._skills.values()]
