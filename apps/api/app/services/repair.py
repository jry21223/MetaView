from __future__ import annotations

from app.schemas import (
    CirDocument,
    CirValidationReport,
    SandboxReport,
    VisualKind,
    VisualToken,
)


class PipelineRepairService:
    def repair_cir(
        self, cir: CirDocument, validation_report: CirValidationReport
    ) -> tuple[CirDocument, list[str]]:
        repaired = cir.model_copy(deep=True)
        actions: list[str] = []

        if not repaired.summary.strip():
            repaired.summary = f"{repaired.title} 的教学摘要由系统自动补齐。"
            actions.append("为 CIR 自动补齐摘要。")

        next_y = 96
        seen_step_ids: set[str] = set()
        for index, step in enumerate(repaired.steps, start=1):
            if not step.id or step.id in seen_step_ids:
                step.id = f"step-{index}"
                actions.append(f"修复第 {index} 步的重复或缺失 id。")
            seen_step_ids.add(step.id)

            if not step.title.strip():
                step.title = f"步骤 {index}"
                actions.append(f"为 {step.id} 自动补齐标题。")

            if not step.narration.strip():
                step.narration = "系统已自动补齐讲解文案，请在教研阶段进一步润色。"
                actions.append(f"为 {step.id} 自动补齐讲解文案。")

            if not step.tokens:
                step.tokens = [
                    VisualToken(
                        id=f"{step.id}-token-1",
                        label="补位实体",
                        value="placeholder",
                        emphasis="secondary",
                    )
                ]
                actions.append(f"为 {step.id} 自动补齐占位视觉实体。")

            if step.layout.y < next_y:
                step.layout.y = next_y
                actions.append(f"重新排列 {step.id} 的纵向布局，降低重叠风险。")

            next_y = step.layout.y + step.layout.height + 18

        if (
            validation_report.status.value == "invalid"
            and repaired.steps
            and repaired.steps[-1].visual_kind != VisualKind.TEXT
        ):
            repaired.steps[-1].visual_kind = VisualKind.TEXT
            repaired.steps[-1].annotations.append("系统已将收尾镜头修复为结论面板。")
            actions.append("将最后一步修复为 TEXT 结论面板。")

        return repaired, actions

    def repair_script(self, cir: CirDocument, sandbox_report: SandboxReport) -> list[str]:
        actions: list[str] = []
        if sandbox_report.errors:
            actions.append("检测到脚本 dry-run 失败，已触发重新生成。")
        if any("length" in error for error in sandbox_report.errors):
            actions.append("脚本镜头数与 CIR 不一致，已按 CIR 重新同步时间线。")
        if cir.steps:
            actions.append("重新按修复后的 CIR 生成预览脚本。")
        return actions
