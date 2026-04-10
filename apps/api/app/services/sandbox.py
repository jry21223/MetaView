from __future__ import annotations

import re
import time

from app.schemas import CirDocument, SandboxMode, SandboxReport, SandboxStatus
from app.services.manim_script import inspect_manim_script

_ALLOWED_HTML_RUNTIME_SCRIPTS = (
    "https://cdn.jsdelivr.net/npm/gsap@3.13/dist/gsap.min.js",
    "https://cdn.jsdelivr.net/npm/p5@1.11.8/lib/p5.min.js",
)


class PreviewDryRunSandbox:
    def __init__(self) -> None:
        self.engine_name = "hybrid-runtime-dry-run"

    def run(
        self,
        script: str,
        cir: CirDocument | None,
        mode: SandboxMode,
    ) -> SandboxReport:
        engine = self._detect_engine(script)
        if mode == SandboxMode.OFF:
            return SandboxReport(
                mode=mode,
                engine=engine,
                status=SandboxStatus.SKIPPED,
                warnings=["已跳过 dry-run 沙盒校验。"],
            )

        started_at = time.perf_counter()
        if engine == "html-interactive-runtime":
            warnings, errors = self._inspect_html_runtime(script)
        else:
            inspection = inspect_manim_script(script)
            warnings = list(inspection.warnings)
            errors = list(inspection.errors)

        if cir is not None and not cir.steps:
            errors.append("CIR 为空，无法执行 dry-run。")

        elapsed_ms = int((time.perf_counter() - started_at) * 1000)
        status = SandboxStatus.FAILED if errors else SandboxStatus.PASSED

        return SandboxReport(
            mode=mode,
            engine=engine,
            status=status,
            duration_ms=elapsed_ms,
            warnings=warnings,
            errors=errors,
        )

    def _detect_engine(self, script: str) -> str:
        normalized = script.lstrip()
        if normalized.startswith("<!DOCTYPE html"):
            return "html-interactive-runtime"
        return "python-manim-static"

    def _inspect_html_runtime(self, html: str) -> tuple[list[str], list[str]]:
        warnings: list[str] = []
        errors: list[str] = []
        advisory_markers = (
            ("const runtime =", "HTML runtime 缺少 runtime 对象。"),
            (
                'window.addEventListener("message"',
                "HTML runtime 缺少 message 监听。",
            ),
            (
                'document.addEventListener("DOMContentLoaded"',
                "HTML runtime 缺少 DOMContentLoaded 初始化。",
            ),
            ("window.parent.postMessage", "HTML runtime 缺少 postMessage 握手。"),
        )
        for marker, message in advisory_markers:
            if marker not in html:
                warnings.append(message)

        for src in _ALLOWED_HTML_RUNTIME_SCRIPTS:
            if src not in html:
                warnings.append(f"HTML runtime 未显式固定依赖：{src}")

        script_src_matches = re.findall(
            r'<script[^>]+src=["\']([^"\']+)["\']',
            html,
            flags=re.IGNORECASE,
        )
        for src in script_src_matches:
            if src not in _ALLOWED_HTML_RUNTIME_SCRIPTS:
                errors.append(f"HTML runtime 包含未允许的外部脚本：{src}")

        disallowed_patterns = (
            (r"<iframe\b", "HTML runtime 不允许嵌套 iframe。"),
            (r"<object\b", "HTML runtime 不允许 object 标签。"),
            (r"<embed\b", "HTML runtime 不允许 embed 标签。"),
            (r"\bon[a-z]+\s*=", "HTML runtime 不允许内联事件处理器。"),
            (
                r"\.setAttribute\(\s*[\"']on[a-z]+[\"']",
                "HTML runtime 不允许动态内联事件处理器。",
            ),
            (
                r"\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\b",
                "HTML runtime 不允许网络请求 API。",
            ),
            (
                r"\b(?:localStorage|sessionStorage|indexedDB)\b",
                "HTML runtime 不允许浏览器持久化存储。",
            ),
        )
        for pattern, message in disallowed_patterns:
            if re.search(pattern, html, flags=re.IGNORECASE):
                errors.append(message)

        ready_markers = (
            'type: "ready"',
            "type:'ready'",
            'type = "ready"',
            "type = 'ready'",
            'notifyParent("ready"',
            "notifyParent('ready'",
        )
        if not any(marker in html for marker in ready_markers):
            warnings.append("HTML runtime 缺少 ready 信号。")
        step_markers = (
            'type: "step"',
            "type:'step'",
            'type = "step"',
            "type = 'step'",
            'notifyParent("step"',
            "notifyParent('step'",
        )
        if not any(marker in html for marker in step_markers):
            warnings.append("HTML runtime 未显式发送 step 消息。")

        return warnings, errors
