from __future__ import annotations

import re
from dataclasses import dataclass

from app.schemas import (
    AgentDiagnostic,
    CirDocument,
    CirStep,
    PipelineRequest,
    TopicDomain,
    VisualKind,
    VisualToken,
)


def _normalize_title(prompt: str) -> str:
    cleaned = re.sub(r"\s+", " ", prompt).strip()
    if len(cleaned) <= 24:
        return cleaned
    return f"{cleaned[:24]}..."


def _keyword_tokens(prompt: str, domain: TopicDomain) -> list[str]:
    prompt_lower = prompt.lower()
    if domain == TopicDomain.ALGORITHM:
        if "二分" in prompt or "binary" in prompt_lower:
            return ["left", "mid", "right", "answer"]
        if "动态规划" in prompt or "dp" in prompt_lower:
            return ["state", "transition", "base", "answer"]
        if "图" in prompt or "graph" in prompt_lower:
            return ["node", "edge", "weight", "path"]
        if "树" in prompt or "tree" in prompt_lower:
            return ["root", "child", "depth", "subtree"]
        return ["input", "state", "update", "result"]

    if "导数" in prompt or "derivative" in prompt_lower:
        return ["f(x)", "slope", "tangent", "limit"]
    if "积分" in prompt or "integral" in prompt_lower:
        return ["interval", "area", "slice", "sum"]
    if "矩阵" in prompt or "matrix" in prompt_lower:
        return ["matrix", "vector", "transform", "basis"]
    return ["object", "rule", "transform", "conclusion"]


def _visual_kind(prompt: str, domain: TopicDomain) -> VisualKind:
    prompt_lower = prompt.lower()
    if domain == TopicDomain.ALGORITHM:
        if "图" in prompt or "graph" in prompt_lower or "树" in prompt or "tree" in prompt_lower:
            return VisualKind.GRAPH
        if "动态规划" in prompt or "dp" in prompt_lower:
            return VisualKind.FLOW
        return VisualKind.ARRAY

    if "导数" in prompt or "积分" in prompt or "equation" in prompt_lower:
        return VisualKind.FORMULA
    return VisualKind.TEXT


@dataclass
class PlannerAgent:
    name: str = "planner"

    def run(self, request: PipelineRequest) -> CirDocument:
        tokens = _keyword_tokens(request.prompt, request.domain)
        visual_kind = _visual_kind(request.prompt, request.domain)
        title = _normalize_title(request.prompt)

        if request.domain == TopicDomain.ALGORITHM:
            steps = [
                CirStep(
                    id="step-1",
                    title="问题拆解",
                    narration="识别输入规模、目标输出和关键数据结构。",
                    visual_kind=visual_kind,
                    tokens=[
                        VisualToken(
                            id="token-1", label="输入", value=tokens[0], emphasis="primary"
                        ),
                        VisualToken(id="token-2", label="状态", value=tokens[1]),
                    ],
                    annotations=["先界定状态空间，再决定画面布局。"],
                ),
                CirStep(
                    id="step-2",
                    title="状态推进",
                    narration="按时间顺序展示指针移动、转移方程或图搜索扩展。",
                    visual_kind=visual_kind,
                    tokens=[
                        VisualToken(id="token-3", label="更新", value=tokens[2], emphasis="accent"),
                        VisualToken(id="token-4", label="约束", value="invariant"),
                    ],
                    annotations=["该步骤应强调中间态，而不是只显示最终答案。"],
                ),
                CirStep(
                    id="step-3",
                    title="结果收束",
                    narration="把最终答案与复杂度分析放到同一视图中收尾。",
                    visual_kind=VisualKind.TEXT,
                    tokens=[
                        VisualToken(
                            id="token-5", label="输出", value=tokens[3], emphasis="primary"
                        ),
                        VisualToken(id="token-6", label="复杂度", value="O(n log n) / 视题型而定"),
                    ],
                    annotations=["收尾阶段保留一个可复盘的结论面板。"],
                ),
            ]
            summary = "算法题会被拆解为输入、状态推进与结果收束三个教学片段。"
        else:
            steps = [
                CirStep(
                    id="step-1",
                    title="对象定义",
                    narration="先把核心公式、变量含义和几何对象摆到画布上。",
                    visual_kind=visual_kind,
                    tokens=[
                        VisualToken(
                            id="token-1", label="对象", value=tokens[0], emphasis="primary"
                        ),
                        VisualToken(id="token-2", label="规则", value=tokens[1]),
                    ],
                    annotations=["第一屏必须可读，避免一开始塞入完整推导。"],
                ),
                CirStep(
                    id="step-2",
                    title="变换推导",
                    narration="用局部高亮推动公式变形或几何关系变化。",
                    visual_kind=visual_kind,
                    tokens=[
                        VisualToken(id="token-3", label="变换", value=tokens[2], emphasis="accent"),
                        VisualToken(id="token-4", label="中间结论", value="lemma"),
                    ],
                    annotations=["保留推导链路，避免跳步。"],
                ),
                CirStep(
                    id="step-3",
                    title="结论落点",
                    narration="把最终结论与直观解释并排呈现。",
                    visual_kind=VisualKind.TEXT,
                    tokens=[
                        VisualToken(
                            id="token-5", label="结论", value=tokens[3], emphasis="primary"
                        ),
                        VisualToken(id="token-6", label="解释", value="intuition"),
                    ],
                    annotations=["结论页要能直接复用到课堂或讲解视频。"],
                ),
            ]
            summary = "数学题会被拆解为对象定义、推导变换与结论落点三个教学片段。"

        return CirDocument(
            title=title,
            domain=request.domain,
            summary=summary,
            steps=steps,
        )


@dataclass
class CoderAgent:
    name: str = "coder"

    def run(self, cir: CirDocument) -> str:
        lines = [
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
        return "\n".join(lines)


@dataclass
class CriticAgent:
    name: str = "critic"

    def run(self, cir: CirDocument) -> list[AgentDiagnostic]:
        diagnostics: list[AgentDiagnostic] = [
            AgentDiagnostic(
                agent=self.name,
                message="已检查 CIR 连贯性，当前版本适合作为 Web 预览输入。",
            )
        ]

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

        return diagnostics
