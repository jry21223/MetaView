from __future__ import annotations

import time

from app.schemas import CirDocument, SandboxMode, SandboxReport, SandboxStatus
from app.services.manim_script import inspect_manim_script


class PreviewDryRunSandbox:
    def __init__(self, timeout_ms: int = 1500) -> None:
        self.timeout_ms = timeout_ms
        self.engine_name = "python-manim-static"

    def run(self, script: str, cir: CirDocument, mode: SandboxMode) -> SandboxReport:
        if mode == SandboxMode.OFF:
            return SandboxReport(
                mode=mode,
                engine=self.engine_name,
                status=SandboxStatus.SKIPPED,
                warnings=["已跳过 dry-run 沙盒校验。"],
            )

        started_at = time.perf_counter()
        inspection = inspect_manim_script(script)
        warnings = list(inspection.warnings)
        errors = list(inspection.errors)

        elapsed_ms = int((time.perf_counter() - started_at) * 1000)
        status = SandboxStatus.FAILED if errors else SandboxStatus.PASSED

        if not cir.steps:
            errors.append("CIR 为空，无法执行 dry-run。")

        return SandboxReport(
            mode=mode,
            engine=self.engine_name,
            status=status,
            duration_ms=elapsed_ms,
            warnings=warnings,
            errors=errors,
        )
