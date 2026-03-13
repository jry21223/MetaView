from __future__ import annotations

from dataclasses import dataclass, field

from app.schemas import AgentTrace, ProviderDescriptor, ProviderKind, ProviderName
from app.services.providers.base import CodingHints, CritiqueHints, PlanningHints


def _concepts_from_prompt(prompt: str, domain: str) -> list[str]:
    prompt_lower = prompt.lower()

    if domain == "algorithm":
        if "二分" in prompt or "binary" in prompt_lower:
            return ["边界", "有序性", "收缩"]
        if "动态规划" in prompt or "dp" in prompt_lower:
            return ["状态", "转移", "初始化"]
        if "图" in prompt or "graph" in prompt_lower:
            return ["节点", "边", "遍历"]
        return ["输入", "状态", "输出"]

    if "导数" in prompt or "derivative" in prompt_lower:
        return ["函数", "切线", "极限"]
    if "积分" in prompt or "integral" in prompt_lower:
        return ["区间", "面积", "求和"]
    return ["对象", "变换", "结论"]


@dataclass
class MockModelProvider:
    descriptor: ProviderDescriptor = field(
        default_factory=lambda: ProviderDescriptor(
            name=ProviderName.MOCK.value,
            label="Mock Provider",
            kind=ProviderKind.MOCK,
            model="mock-cir-studio-001",
            description="本地确定性规则提供者，用于 MVP 阶段替代真实大模型。",
            is_custom=False,
        )
    )

    def plan(self, prompt: str, domain: str) -> tuple[PlanningHints, AgentTrace]:
        concepts = _concepts_from_prompt(prompt, domain)
        focus = f"突出 {' / '.join(concepts[:2])} 的教学主线"
        warnings = ["当前为 mock provider，输出稳定但不会做真正的开放域推理。"]
        trace = AgentTrace(
            agent="planner",
            provider=self.descriptor.name,
            model=self.descriptor.model,
            summary=f"{focus}；概念：{', '.join(concepts)}",
        )
        return PlanningHints(focus=focus, concepts=concepts, warnings=warnings), trace

    def code(self, title: str, step_count: int) -> tuple[CodingHints, AgentTrace]:
        style_notes = [
            "优先输出可直接交给 manim-web 的 construct(scene) 草案。",
            "同时保留 previewTimeline 元数据，供 dry-run 沙盒和前端调试使用。",
        ]
        trace = AgentTrace(
            agent="coder",
            provider=self.descriptor.name,
            model=self.descriptor.model,
            summary=f"为《{title}》生成 {step_count} 个镜头的预览脚本草案。",
        )
        return CodingHints(target="manim-web-ts", style_notes=style_notes), trace

    def critique(self, title: str, renderer_script: str) -> tuple[CritiqueHints, AgentTrace]:
        warnings = []
        if "visualKind" not in renderer_script:
            warnings.append("渲染脚本缺少 visualKind 字段。")
        checks = [
            "检查时间线数组结构是否完整。",
            "检查镜头标题与实体数是否适合单屏展示。",
        ]
        trace = AgentTrace(
            agent="critic",
            provider=self.descriptor.name,
            model=self.descriptor.model,
            summary=f"已对《{title}》的预览脚本执行结构审查。",
        )
        return CritiqueHints(checks=checks, warnings=warnings), trace
