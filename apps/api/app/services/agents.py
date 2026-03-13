from __future__ import annotations

import json
import re
from dataclasses import dataclass

from app.schemas import (
    AgentDiagnostic,
    CirDocument,
    CirStep,
    LayoutInstruction,
    PipelineRequest,
    TopicDomain,
    VisualKind,
    VisualToken,
)
from app.services.providers.base import CodingHints, CritiqueHints, PlanningHints
from app.services.skill_catalog import SubjectSkill


def _normalize_title(prompt: str) -> str:
    cleaned = re.sub(r"\s+", " ", prompt).strip()
    if len(cleaned) <= 24:
        return cleaned
    return f"{cleaned[:24]}..."


def _layout_for(index: int) -> LayoutInstruction:
    return LayoutInstruction(x=64, y=96 + (index - 1) * 152, width=640, height=120)


def _make_tokens(items: list[tuple[str, str, str]]) -> list[VisualToken]:
    return [
        VisualToken(
            id=f"token-{index}",
            label=label,
            value=value,
            emphasis=emphasis,
        )
        for index, (label, value, emphasis) in enumerate(items, start=1)
    ]


def _build_step(
    *,
    index: int,
    title: str,
    narration: str,
    visual_kind: VisualKind,
    items: list[tuple[str, str, str]],
    annotations: list[str],
) -> CirStep:
    return CirStep(
        id=f"step-{index}",
        title=title,
        narration=narration,
        visual_kind=visual_kind,
        layout=_layout_for(index),
        tokens=_make_tokens(items),
        annotations=annotations,
    )


def _algorithm_tokens(prompt: str) -> list[str]:
    prompt_lower = prompt.lower()
    if "二分" in prompt or "binary" in prompt_lower:
        return ["left", "mid", "right", "answer"]
    if "排序" in prompt or "sort" in prompt_lower:
        return ["array", "pivot", "swap", "order"]
    if "动态规划" in prompt or "dp" in prompt_lower:
        return ["state", "transition", "base", "answer"]
    if "图" in prompt or "graph" in prompt_lower:
        return ["node", "edge", "frontier", "path"]
    if "树" in prompt or "tree" in prompt_lower or "递归" in prompt:
        return ["root", "stack", "depth", "return"]
    return ["input", "state", "update", "result"]


def _math_tokens(prompt: str) -> list[str]:
    prompt_lower = prompt.lower()
    if "导数" in prompt or "derivative" in prompt_lower:
        return ["f(x)", "slope", "tangent", "limit"]
    if "积分" in prompt or "integral" in prompt_lower:
        return ["interval", "area", "slice", "sum"]
    if "矩阵" in prompt or "matrix" in prompt_lower or "线性代数" in prompt:
        return ["matrix", "vector", "transform", "basis"]
    if "概率" in prompt or "probability" in prompt_lower:
        return ["sample", "event", "measure", "expectation"]
    return ["object", "rule", "transform", "conclusion"]


def _physics_tokens(prompt: str) -> list[str]:
    prompt_lower = prompt.lower()
    if "电路" in prompt or "circuit" in prompt_lower:
        return ["source", "current", "voltage", "equivalent"]
    if "电场" in prompt or "磁场" in prompt or "field" in prompt_lower:
        return ["field", "charge", "force", "trajectory"]
    if "碰撞" in prompt or "抛体" in prompt or "projectile" in prompt_lower:
        return ["body", "velocity", "force", "trajectory"]
    return ["body", "constraint", "law", "result"]


def _chemistry_tokens(prompt: str) -> list[str]:
    prompt_lower = prompt.lower()
    if "平衡" in prompt or "equilibrium" in prompt_lower:
        return ["reactant", "product", "shift", "equilibrium"]
    if "滴定" in prompt or "titration" in prompt_lower:
        return ["acid", "base", "indicator", "endpoint"]
    return ["atom", "bond", "transition", "product"]


def _biology_tokens(prompt: str) -> list[str]:
    prompt_lower = prompt.lower()
    if "细胞" in prompt or "cell" in prompt_lower:
        return ["membrane", "nucleus", "phase", "division"]
    if "遗传" in prompt or "gene" in prompt_lower:
        return ["gene", "allele", "expression", "trait"]
    if "生态" in prompt or "ecosystem" in prompt_lower:
        return ["producer", "consumer", "flow", "balance"]
    return ["structure", "signal", "process", "outcome"]


def _geography_tokens(prompt: str) -> list[str]:
    prompt_lower = prompt.lower()
    if "水循环" in prompt or "water cycle" in prompt_lower:
        return ["evaporation", "transport", "precipitation", "runoff"]
    if "人口" in prompt or "migration" in prompt_lower:
        return ["origin", "route", "destination", "pressure"]
    if "板块" in prompt or "plate" in prompt_lower:
        return ["plate", "boundary", "uplift", "landform"]
    return ["region", "driver", "change", "pattern"]


def _tokens_for_domain(prompt: str, domain: TopicDomain) -> list[str]:
    if domain == TopicDomain.ALGORITHM:
        return _algorithm_tokens(prompt)
    if domain == TopicDomain.PHYSICS:
        return _physics_tokens(prompt)
    if domain == TopicDomain.CHEMISTRY:
        return _chemistry_tokens(prompt)
    if domain == TopicDomain.BIOLOGY:
        return _biology_tokens(prompt)
    if domain == TopicDomain.GEOGRAPHY:
        return _geography_tokens(prompt)
    return _math_tokens(prompt)


def _primary_visual_kind(prompt: str, domain: TopicDomain, skill: SubjectSkill) -> VisualKind:
    prompt_lower = prompt.lower()
    if domain == TopicDomain.ALGORITHM:
        if "图" in prompt or "graph" in prompt_lower or "树" in prompt or "tree" in prompt_lower:
            return VisualKind.GRAPH
        if "动态规划" in prompt or "dp" in prompt_lower or "递归" in prompt:
            return VisualKind.FLOW
        return VisualKind.ARRAY
    if domain == TopicDomain.MATH:
        return VisualKind.FORMULA
    if domain == TopicDomain.PHYSICS:
        if "电路" in prompt or "circuit" in prompt_lower:
            return VisualKind.CIRCUIT
        return VisualKind.MOTION
    if domain == TopicDomain.CHEMISTRY:
        return VisualKind.MOLECULE
    if domain == TopicDomain.BIOLOGY:
        return VisualKind.CELL
    if domain == TopicDomain.GEOGRAPHY:
        return VisualKind.MAP
    return skill.visual_sequence[0]


@dataclass
class PlannerAgent:
    name: str = "planner"

    def run(
        self,
        request: PipelineRequest,
        *,
        skill: SubjectSkill,
        hints: PlanningHints | None = None,
    ) -> CirDocument:
        tokens = _tokens_for_domain(request.prompt, request.domain)
        primary_visual = _primary_visual_kind(request.prompt, request.domain, skill)
        title = _normalize_title(request.prompt)

        if request.domain == TopicDomain.ALGORITHM:
            steps = self._algorithm_steps(tokens, primary_visual)
            summary = "算法题会被拆成状态建模、过程推进与复杂度收束三个镜头。"
        elif request.domain == TopicDomain.MATH:
            steps = self._math_steps(tokens)
            summary = "数学题会被拆成对象定义、推导形变与结论落点三个镜头。"
        elif request.domain == TopicDomain.PHYSICS:
            steps = self._physics_steps(
                tokens,
                primary_visual,
                has_image=bool(request.source_image),
                image_name=request.source_image_name,
            )
            summary = "物理题会先完成建模，再进入定律驱动的动态演化与结果校核。"
        elif request.domain == TopicDomain.CHEMISTRY:
            steps = self._chemistry_steps(tokens)
            summary = "化学题会围绕分子结构、反应过渡和结果校核展开。"
        elif request.domain == TopicDomain.BIOLOGY:
            steps = self._biology_steps(tokens)
            summary = "生物题会按结构层级、过程流转与功能结论展开。"
        else:
            steps = self._geography_steps(tokens)
            summary = "地理题会先固定空间底图，再展示时空演化与区域解释。"

        steps[0].annotations.insert(
            0,
            f"Skill 路由：{skill.descriptor.id} / {skill.descriptor.label}。",
        )

        if request.source_image and skill.descriptor.supports_image_input:
            summary = f"{summary} 已结合静态题图进行对象提取与建模。"

        if hints:
            summary = f"{summary} 当前规划焦点：{hints.focus}。"
            if hints.concepts:
                steps[0].annotations.append(f"Provider 概念提示：{', '.join(hints.concepts)}。")
            if hints.warnings:
                steps[-1].annotations.extend(hints.warnings)

        return CirDocument(
            title=title,
            domain=request.domain,
            summary=summary,
            steps=steps,
        )

    def _algorithm_steps(self, tokens: list[str], primary_visual: VisualKind) -> list[CirStep]:
        return [
            _build_step(
                index=1,
                title="问题拆解",
                narration="先明确输入结构、目标输出和将要被追踪的关键状态。",
                visual_kind=primary_visual,
                items=[
                    ("输入", tokens[0], "primary"),
                    ("状态", tokens[1], "secondary"),
                ],
                annotations=["提炼循环不变量与状态边界。"],
            ),
            _build_step(
                index=2,
                title="状态推进",
                narration="按时间顺序展示比较、转移、搜索扩展或调用栈展开。",
                visual_kind=primary_visual,
                items=[
                    ("更新", tokens[2], "accent"),
                    ("约束", "invariant", "secondary"),
                ],
                annotations=["若存在递归或回溯，需显式展示调用栈。"],
            ),
            _build_step(
                index=3,
                title="结果收束",
                narration="最后把答案、复杂度和关键决策依据收束到同一视图。",
                visual_kind=VisualKind.TEXT,
                items=[
                    ("输出", tokens[3], "primary"),
                    ("复杂度", "time/space", "secondary"),
                ],
                annotations=["结论页需要支持题解复盘。"],
            ),
        ]

    def _math_steps(self, tokens: list[str]) -> list[CirStep]:
        return [
            _build_step(
                index=1,
                title="对象定义",
                narration="先摆出核心公式、变量定义和坐标系或几何对象。",
                visual_kind=VisualKind.FORMULA,
                items=[
                    ("对象", tokens[0], "primary"),
                    ("规则", tokens[1], "secondary"),
                ],
                annotations=["第一屏要先把符号语义讲清楚。"],
            ),
            _build_step(
                index=2,
                title="推导形变",
                narration="通过连续形变推动公式推导或图像变换，不允许跳步。",
                visual_kind=VisualKind.FORMULA,
                items=[
                    ("变换", tokens[2], "accent"),
                    ("中间结论", "lemma", "secondary"),
                ],
                annotations=["导数、积分和矩阵变换要显式跟踪变量。"],
            ),
            _build_step(
                index=3,
                title="结论落点",
                narration="把最终结论和几何或直觉解释并排收尾。",
                visual_kind=VisualKind.TEXT,
                items=[
                    ("结论", tokens[3], "primary"),
                    ("解释", "intuition", "secondary"),
                ],
                annotations=["结论页可直接复用到课堂讲解。"],
            ),
        ]

    def _physics_steps(
        self,
        tokens: list[str],
        primary_visual: VisualKind,
        *,
        has_image: bool,
        image_name: str | None,
    ) -> list[CirStep]:
        steps: list[CirStep] = []
        start_index = 1
        if has_image:
            steps.append(
                _build_step(
                    index=1,
                    title="题图解析",
                    narration="先从静态题图提取对象、几何约束、已知量和目标量。",
                    visual_kind=VisualKind.TEXT,
                    items=[
                        ("题图", image_name or "source-image", "primary"),
                        ("对象", tokens[0], "secondary"),
                    ],
                    annotations=["优先识别接触面、角度、支点、连杆或电路元件连接关系。"],
                )
            )
            start_index = 2

        mid_title = "电路建模" if primary_visual == VisualKind.CIRCUIT else "受力建模"
        mid_narration = (
            "把元件拓扑、端点和等效关系映射成可计算的电路结构。"
            if primary_visual == VisualKind.CIRCUIT
            else "把受力、速度、约束和边界条件映射成可计算的动力学模型。"
        )
        steps.append(
            _build_step(
                index=start_index,
                title=mid_title,
                narration=mid_narration,
                visual_kind=primary_visual,
                items=[
                    ("对象", tokens[0], "primary"),
                    ("定律", tokens[2], "accent"),
                ],
                annotations=["必须先完成建模，再进入时间演化。"],
            )
        )
        steps.append(
            _build_step(
                index=start_index + 1,
                title="动态演化",
                narration="在时间轴上展示位置、电流、速度或场量如何随约束变化。",
                visual_kind=primary_visual,
                items=[
                    ("约束", tokens[1], "secondary"),
                    ("演化", tokens[3], "primary"),
                ],
                annotations=["确保方向、单位和变化趋势符合物理定律。"],
            )
        )
        steps.append(
            _build_step(
                index=start_index + 2,
                title="结果校核",
                narration="用守恒关系、边界条件或量纲检查收束最后一屏。",
                visual_kind=VisualKind.TEXT,
                items=[
                    ("结果", tokens[3], "primary"),
                    ("校核", "law-check", "secondary"),
                ],
                annotations=["结果页必须解释为什么动画满足题目中的物理定律。"],
            )
        )
        return steps

    def _chemistry_steps(self, tokens: list[str]) -> list[CirStep]:
        return [
            _build_step(
                index=1,
                title="结构识别",
                narration="先建立反应物或初始分子的球棍结构与关键键位。",
                visual_kind=VisualKind.MOLECULE,
                items=[
                    ("原子", tokens[0], "primary"),
                    ("键", tokens[1], "secondary"),
                ],
                annotations=["第一步就要明确键连接和空间构型。"],
            ),
            _build_step(
                index=2,
                title="反应推进",
                narration="展示断键、成键、构型重组以及中间体变化。",
                visual_kind=VisualKind.MOLECULE,
                items=[
                    ("过渡态", tokens[2], "accent"),
                    ("生成物", tokens[3], "primary"),
                ],
                annotations=["关键步骤可附带能量或催化条件说明。"],
            ),
            _build_step(
                index=3,
                title="结果解释",
                narration="把反应结果、守恒关系和机理结论并排收束。",
                visual_kind=VisualKind.TEXT,
                items=[
                    ("生成物", tokens[3], "primary"),
                    ("机理", "mechanism", "secondary"),
                ],
                annotations=["审查价态与元素守恒是否成立。"],
            ),
        ]

    def _biology_steps(self, tokens: list[str]) -> list[CirStep]:
        return [
            _build_step(
                index=1,
                title="结构定位",
                narration="先把器官、细胞或生态角色放进正确层级。",
                visual_kind=VisualKind.CELL,
                items=[
                    ("结构", tokens[0], "primary"),
                    ("阶段", tokens[1], "secondary"),
                ],
                annotations=["避免把不同层级的对象压在同一镜头里。"],
            ),
            _build_step(
                index=2,
                title="过程流转",
                narration="展示分裂、表达、信号转导或能量流动的阶段切换。",
                visual_kind=VisualKind.FLOW,
                items=[
                    ("过程", tokens[2], "accent"),
                    ("结果", tokens[3], "primary"),
                ],
                annotations=["箭头要区分激活、抑制或流向。"],
            ),
            _build_step(
                index=3,
                title="功能结论",
                narration="把最终表型、功能后果或生态平衡结论收束到结尾。",
                visual_kind=VisualKind.TEXT,
                items=[
                    ("结论", tokens[3], "primary"),
                    ("解释", "function", "secondary"),
                ],
                annotations=["结论页强调结构与功能的因果关系。"],
            ),
        ]

    def _geography_steps(self, tokens: list[str]) -> list[CirStep]:
        return [
            _build_step(
                index=1,
                title="空间底图",
                narration="先固定区域边界、底图坐标和主要地理单元。",
                visual_kind=VisualKind.MAP,
                items=[
                    ("区域", tokens[0], "primary"),
                    ("驱动", tokens[1], "secondary"),
                ],
                annotations=["所有后续变化都应基于同一空间底图。"],
            ),
            _build_step(
                index=2,
                title="时空演化",
                narration="在统一底图上展示迁移、环流、板块或降水过程的变化。",
                visual_kind=VisualKind.MAP,
                items=[
                    ("变化", tokens[2], "accent"),
                    ("模式", tokens[3], "primary"),
                ],
                annotations=["箭头方向、强度和区域差异要可比较。"],
            ),
            _build_step(
                index=3,
                title="区域解释",
                narration="收束影响因素、结果格局和区域对比结论。",
                visual_kind=VisualKind.TEXT,
                items=[
                    ("格局", tokens[3], "primary"),
                    ("解释", "region-analysis", "secondary"),
                ],
                annotations=["最后一屏应回到区域分析结论。"],
            ),
        ]


@dataclass
class CoderAgent:
    name: str = "coder"

    def run(self, cir: CirDocument, hints: CodingHints | None = None) -> str:
        import_line = (
            'import { Scene, Text, MathTex, Rectangle, Circle, Line, Arrow, VGroup, '
            'FadeIn, FadeOut, Write, Create, DOWN } from "manim-web";'
        )
        lines = [
            f"// renderer-target: {hints.target}" if hints else "// renderer-target: manim-web-ts",
            import_line,
            "",
            "export const previewTimeline = [",
        ]

        for step in cir.steps:
            serialized_tokens = ", ".join(
                f'"{token.label}:{token.value or token.label}"' for token in step.tokens
            )
            lines.append("  {")
            lines.append(f'    id: "{step.id}",')
            lines.append(f'    title: "{step.title}",')
            lines.append(f'    visualKind: "{step.visual_kind.value}",')
            lines.append(f"    tokens: [{serialized_tokens}],")
            lines.append("  },")

        lines.append("];")
        lines.append("")
        lines.append("export async function construct(scene: Scene) {")
        lines.append(
            "  const title = new Text("
            f"{{ text: {json.dumps(cir.title)}, fontSize: 40, color: \"#f8fafc\" }}"
            ").toEdge(DOWN, 6.8);"
        )
        lines.append("  scene.add(title);")
        lines.append("  await scene.play(new FadeIn(title));")
        lines.append("")
        lines.append("  for (const step of previewTimeline) {")
        lines.append(
            "    const card = new Rectangle("
            "{ width: 10.5, height: 4.2, color: \"#93c5fd\", fillOpacity: 0.08 }"
            ").moveTo([0, 0.2, 0]);"
        )
        lines.append(
            "    const heading = new Text("
            "{ text: step.title, fontSize: 28, color: \"#e2e8f0\" }"
            ").moveTo([0, 1.5, 0]);"
        )
        lines.append("    const body = step.visualKind === \"formula\"")
        lines.append(
            "      ? new MathTex({"
            " latex: step.tokens.map((token) => token.split(\":\")[1]).join(\"\\\\quad\"),"
            " fontSize: 34, color: \"#f8fafc\" }).moveTo([0, 0.4, 0])"
        )
        lines.append(
            "      : new Text({ text: step.tokens.join(\"   \"),"
            " fontSize: 22, color: \"#cbd5e1\" }).moveTo([0, 0.4, 0]);"
        )
        lines.append("    scene.add(card, heading, body);")
        lines.append(
            "    await scene.play(new Create(card), new Write(heading), new FadeIn(body));"
        )
        lines.append("    await scene.wait(0.4);")
        lines.append(
            "    await scene.play(new FadeOut(card), new FadeOut(heading), new FadeOut(body));"
        )
        lines.append("  }")
        lines.append("}")
        if hints and hints.style_notes:
            lines.append("")
            lines.append(f"// style-notes: {' | '.join(hints.style_notes)}")
        return "\n".join(lines)


@dataclass
class CriticAgent:
    name: str = "critic"

    def run(self, cir: CirDocument, hints: CritiqueHints | None = None) -> list[AgentDiagnostic]:
        diagnostics: list[AgentDiagnostic] = [
            AgentDiagnostic(
                agent=self.name,
                message="已检查 CIR 连贯性，当前版本适合作为 Web 预览输入。",
            )
        ]

        if hints:
            for check in hints.checks:
                diagnostics.append(AgentDiagnostic(agent=self.name, message=f"检查项：{check}"))
            for warning in hints.warnings:
                diagnostics.append(AgentDiagnostic(agent=self.name, message=warning))

        for step in cir.steps:
            if len(step.tokens) > 4:
                diagnostics.append(
                    AgentDiagnostic(
                        agent=self.name,
                        message=f"{step.id} 的可视化实体较多，正式渲染时建议拆成更多镜头。",
                    )
                )

            if step.visual_kind == VisualKind.TEXT:
                diagnostics.append(
                    AgentDiagnostic(
                        agent=self.name,
                        message=f"{step.id} 以结论面板收尾，后续可加入动效锚点。",
                    )
                )
            elif step.visual_kind == VisualKind.MOTION:
                diagnostics.append(
                    AgentDiagnostic(
                        agent=self.name,
                        message=f"{step.id} 使用运动镜头，请复核方向、速度和受力说明是否一致。",
                    )
                )
            elif step.visual_kind == VisualKind.CIRCUIT:
                diagnostics.append(
                    AgentDiagnostic(
                        agent=self.name,
                        message=f"{step.id} 使用电路镜头，请复核元件连接与电流方向。",
                    )
                )
            elif step.visual_kind == VisualKind.MOLECULE:
                diagnostics.append(
                    AgentDiagnostic(
                        agent=self.name,
                        message=f"{step.id} 使用分子镜头，请复核键连接与构型变化。",
                    )
                )
            elif step.visual_kind == VisualKind.MAP:
                diagnostics.append(
                    AgentDiagnostic(
                        agent=self.name,
                        message=f"{step.id} 使用地理底图镜头，请复核方向、区域和时间顺序。",
                    )
                )
            elif step.visual_kind == VisualKind.CELL:
                diagnostics.append(
                    AgentDiagnostic(
                        agent=self.name,
                        message=f"{step.id} 使用生物结构镜头，请复核层级关系和阶段顺序。",
                    )
                )

        return diagnostics
