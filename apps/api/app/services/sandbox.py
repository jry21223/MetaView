from __future__ import annotations

import shutil
import subprocess
import tempfile
import textwrap
import time
from pathlib import Path

from app.schemas import CirDocument, SandboxMode, SandboxReport, SandboxStatus


class PreviewDryRunSandbox:
    def __init__(self, timeout_ms: int = 1500) -> None:
        self.timeout_ms = timeout_ms
        self.engine_name = "preview-dry-run"

    def run(self, script: str, cir: CirDocument, mode: SandboxMode) -> SandboxReport:
        if mode == SandboxMode.OFF:
            return SandboxReport(
                mode=mode,
                engine=self.engine_name,
                status=SandboxStatus.SKIPPED,
                warnings=["已跳过 dry-run 沙盒校验。"],
            )

        started_at = time.perf_counter()
        warnings: list[str] = []
        errors = self._static_validate(script=script, cir=cir)

        node_binary = shutil.which("node")
        engine = self.engine_name
        if not errors and node_binary:
            execution_error = self._node_validate(node_binary=node_binary, script=script, cir=cir)
            if execution_error:
                errors.append(execution_error)
        elif not errors:
            warnings.append("未检测到 node，可执行 dry-run 已回退到静态校验。")
            engine = f"{self.engine_name}-static"

        elapsed_ms = int((time.perf_counter() - started_at) * 1000)
        status = SandboxStatus.FAILED if errors else SandboxStatus.PASSED

        if script.count("id:") != len(cir.steps):
            warnings.append("脚本镜头数量与 CIR 步骤数不完全一致，请在正式渲染前复核。")

        return SandboxReport(
            mode=mode,
            engine=engine,
            status=status,
            duration_ms=elapsed_ms,
            warnings=warnings,
            errors=errors,
        )

    def _static_validate(self, script: str, cir: CirDocument) -> list[str]:
        errors: list[str] = []
        if "export const previewTimeline = [" not in script:
            errors.append("渲染脚本缺少 previewTimeline 导出。")
        if "visualKind:" not in script:
            errors.append("渲染脚本缺少 visualKind 字段。")
        if not cir.steps:
            errors.append("CIR 为空，无法执行 dry-run。")
        return errors

    def _node_validate(self, node_binary: str, script: str, cir: CirDocument) -> str | None:
        executable_script = script.replace("export const", "const", 1)
        probe = textwrap.dedent(
            f"""
            {executable_script}

            const expectedCount = {len(cir.steps)};

            if (!Array.isArray(previewTimeline)) {{
              throw new Error("previewTimeline must be an array");
            }}

            if (previewTimeline.length !== expectedCount) {{
              throw new Error(
                `previewTimeline length ${{previewTimeline.length}} !== ${{expectedCount}}`
              );
            }}

            for (const [index, step] of previewTimeline.entries()) {{
              if (!step || typeof step !== "object") {{
                throw new Error(`step ${{index}} must be an object`);
              }}
              if (typeof step.id !== "string" || step.id.length === 0) {{
                throw new Error(`step ${{index}} missing id`);
              }}
              if (typeof step.title !== "string" || step.title.length === 0) {{
                throw new Error(`step ${{index}} missing title`);
              }}
              if (typeof step.visualKind !== "string" || step.visualKind.length === 0) {{
                throw new Error(`step ${{index}} missing visualKind`);
              }}
              if (!Array.isArray(step.tokens)) {{
                throw new Error(`step ${{index}} tokens must be an array`);
              }}
            }}
            """
        ).strip()

        with tempfile.TemporaryDirectory(prefix="algo-vis-sandbox-") as temp_dir:
            probe_path = Path(temp_dir) / "preview-probe.mjs"
            probe_path.write_text(probe, encoding="utf-8")
            result = subprocess.run(
                [node_binary, str(probe_path)],
                capture_output=True,
                text=True,
                timeout=self.timeout_ms / 1000,
                check=False,
            )

        if result.returncode == 0:
            return None

        stderr = result.stderr.strip()
        stdout = result.stdout.strip()
        return stderr or stdout or "node dry-run 执行失败。"
