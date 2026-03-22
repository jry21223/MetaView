from __future__ import annotations

from dataclasses import dataclass, field

from app.schemas import (
    AgentTrace,
    CirDocument,
    ProviderDescriptor,
    ProviderKind,
    ProviderName,
    TopicDomain,
)
from app.services.domain_router import infer_domain
from app.services.providers.base import CodingHints, CritiqueHints, PlanningHints


def _concepts_from_prompt(prompt: str, domain: str) -> list[str]:
    prompt_lower = prompt.lower()

    if domain == "algorithm":
        if "二分" in prompt or "binary" in prompt_lower:
            return ["边界", "有序性", "收缩"]
        if "排序" in prompt or "sort" in prompt_lower:
            return ["比较", "交换", "有序段"]
        if "动态规划" in prompt or "dp" in prompt_lower:
            return ["状态", "转移", "初始化"]
        if "图" in prompt or "graph" in prompt_lower:
            return ["节点", "边", "遍历"]
        return ["输入", "状态", "输出"]

    if domain == "physics":
        if "电路" in prompt or "circuit" in prompt_lower:
            return ["拓扑", "电流", "电压"]
        return ["受力", "约束", "轨迹"]

    if domain == "chemistry":
        return ["键", "构型", "反应物"]

    if domain == "biology":
        return ["结构", "阶段", "调控"]

    if domain == "geography":
        return ["区域", "流向", "时序"]

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
            supports_vision=False,
        )
    )

    def route(
        self,
        prompt: str,
        source_image: str | None = None,
        source_code: str | None = None,
    ) -> tuple[TopicDomain, AgentTrace]:
        domain = infer_domain(prompt, source_image, source_code=source_code)
        trace = AgentTrace(
            agent="router",
            provider=self.descriptor.name,
            model=self.descriptor.model,
            summary=f"基于规则与提示词自动路由到 {domain.value}。",
        )
        return domain, trace

    def plan(
        self,
        prompt: str,
        domain: str,
        skill_brief: str,
        source_image: str | None = None,
        source_code: str | None = None,
        source_code_language: str | None = None,
        ui_theme: str | None = None,
    ) -> tuple[PlanningHints, AgentTrace]:
        concepts = _concepts_from_prompt(prompt, domain)
        focus = f"突出 {' / '.join(concepts[:2])} 的教学主线"
        warnings = ["当前为 mock provider，输出稳定但不会做真正的开放域推理。"]
        if source_image:
            warnings.append(
                "已收到静态题图，当前 mock provider 会按图片辅助建模流程补充受力与约束。"
            )
        if source_code:
            warnings.append(
                f"已收到 {source_code_language or 'unknown'} 源码，"
                "当前 mock provider 会按源码摘要辅助规划。"
            )
        skill_name = skill_brief.splitlines()[0].split("=", 1)[-1]
        trace = AgentTrace(
            agent="planner",
            provider=self.descriptor.name,
            model=self.descriptor.model,
            summary=f"{focus}；概念：{', '.join(concepts)}；skill={skill_name}",
        )
        return PlanningHints(focus=focus, concepts=concepts, warnings=warnings), trace

    def code(self, cir: CirDocument, ui_theme: str | None = None) -> tuple[CodingHints, AgentTrace]:
        style_notes = [
            "输出本地 Python Manim 模板，供 dry-run 沙盒和后端视频预览使用。",
            "主页实际预览以后端渲染的视频为准。",
        ]
        if ui_theme:
            style_notes.append(f"当前 UI 主题={ui_theme}，生成脚本时应尽量保持背景与强调色统一。")
        trace = AgentTrace(
            agent="coder",
            provider=self.descriptor.name,
            model=self.descriptor.model,
            summary=f"为《{cir.title}》生成 {len(cir.steps)} 个镜头的预览脚本草案。",
        )
        return CodingHints(target="python-manim", style_notes=style_notes), trace

    def critique(
        self,
        title: str,
        renderer_script: str,
        domain: TopicDomain,
        ui_theme: str | None = None,
    ) -> tuple[CritiqueHints, AgentTrace]:
        warnings = []
        if "class " not in renderer_script or "Scene" not in renderer_script:
            warnings.append("渲染脚本缺少 Scene 类定义。")
        checks = [
            "检查 Scene 类、construct 方法和动画调用是否完整。",
            "检查镜头标题与实体数是否适合单屏展示。",
        ]
        trace = AgentTrace(
            agent="critic",
            provider=self.descriptor.name,
            model=self.descriptor.model,
            summary=f"已对《{title}》的预览脚本执行结构审查。",
        )
        return CritiqueHints(checks=checks, warnings=warnings, blocking_issues=[]), trace

    def repair_code(
        self,
        cir: CirDocument,
        renderer_script: str,
        issues: list[str],
        ui_theme: str | None = None,
    ) -> tuple[CodingHints, AgentTrace]:
        trace = AgentTrace(
            agent="repair",
            provider=self.descriptor.name,
            model=self.descriptor.model,
            summary=f"mock provider 收到 {len(issues)} 条修复问题，回退到本地模板。",
        )
        return (
            CodingHints(
                target="python-manim",
                style_notes=["mock repair fallback to local template"],
            ),
            trace,
        )
