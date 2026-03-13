from __future__ import annotations

from app.schemas import (
    CirDocument,
    CirValidationReport,
    ValidationIssue,
    ValidationSeverity,
    ValidationStatus,
    VisualKind,
)


class CirValidator:
    def validate(self, cir: CirDocument) -> CirValidationReport:
        issues: list[ValidationIssue] = []

        if not cir.title.strip():
            issues.append(
                ValidationIssue(
                    severity=ValidationSeverity.ERROR,
                    code="missing_title",
                    message="CIR 缺少标题。",
                )
            )

        if not cir.summary.strip():
            issues.append(
                ValidationIssue(
                    severity=ValidationSeverity.WARNING,
                    code="missing_summary",
                    message="CIR 缺少摘要，建议补充教学目标。",
                )
            )

        if not cir.steps:
            issues.append(
                ValidationIssue(
                    severity=ValidationSeverity.ERROR,
                    code="empty_steps",
                    message="CIR 至少需要一个步骤。",
                )
            )
            return CirValidationReport(status=ValidationStatus.INVALID, issues=issues)

        seen_step_ids: set[str] = set()
        last_bottom = 0

        for index, step in enumerate(cir.steps, start=1):
            if step.id in seen_step_ids:
                issues.append(
                    ValidationIssue(
                        severity=ValidationSeverity.ERROR,
                        code="duplicate_step_id",
                        message=f"步骤 {step.id} 重复。",
                        step_id=step.id,
                    )
                )
            seen_step_ids.add(step.id)

            if not step.title.strip():
                issues.append(
                    ValidationIssue(
                        severity=ValidationSeverity.ERROR,
                        code="missing_step_title",
                        message=f"第 {index} 步缺少标题。",
                        step_id=step.id,
                    )
                )

            if not step.narration.strip():
                issues.append(
                    ValidationIssue(
                        severity=ValidationSeverity.ERROR,
                        code="missing_narration",
                        message=f"第 {index} 步缺少讲解文案。",
                        step_id=step.id,
                    )
                )

            if not step.tokens:
                issues.append(
                    ValidationIssue(
                        severity=ValidationSeverity.WARNING,
                        code="missing_tokens",
                        message=f"第 {index} 步没有视觉实体，正式渲染时信息可能不足。",
                        step_id=step.id,
                    )
                )

            if step.layout.y < last_bottom:
                issues.append(
                    ValidationIssue(
                        severity=ValidationSeverity.WARNING,
                        code="layout_overlap_risk",
                        message=f"{step.id} 的布局可能与前一步重叠。",
                        step_id=step.id,
                    )
                )

            last_bottom = max(last_bottom, step.layout.y + step.layout.height)

        if cir.steps[-1].visual_kind != VisualKind.TEXT:
            issues.append(
                ValidationIssue(
                    severity=ValidationSeverity.INFO,
                    code="non_text_finale",
                    message="最后一步不是 TEXT，若面向课堂收尾可考虑切成结论面板。",
                    step_id=cir.steps[-1].id,
                )
            )

        status = ValidationStatus.INVALID if any(
            issue.severity == ValidationSeverity.ERROR for issue in issues
        ) else ValidationStatus.VALID
        return CirValidationReport(status=status, issues=issues)
