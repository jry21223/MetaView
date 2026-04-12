"""
HTML Renderer — saves a self-contained HTML string to disk and returns a
serveable URL with per-request artifact metadata.
"""

from __future__ import annotations

import html as html_lib
import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path


@dataclass(frozen=True)
class HtmlRenderArtifacts:
    file_path: Path
    url: str
    request_id: str
    manifest_path: Path


class HtmlRenderer:
    """Persist generated HTML as a request-specific artifact with manifest metadata."""

    def __init__(
        self,
        output_dir: str | Path = "data/html_previews",
        *,
        prerender_steps: int = 2,
    ) -> None:
        self._output_dir = Path(output_dir)
        self._manifest_path = self._output_dir / "manifest.json"
        self._prerender_steps = max(1, prerender_steps)

    def render(
        self,
        html: str,
        request_id: str,
        *,
        cir_json: str,
        ui_theme: str | None = None,
        prompt_version: str = "unknown",
        inject_prerender: bool = False,
    ) -> HtmlRenderArtifacts:
        self._output_dir.mkdir(parents=True, exist_ok=True)
        manifest = self._load_manifest()

        if inject_prerender:
            html = self._inject_prerender_shell(
                html=html,
                cir_json=cir_json,
                ui_theme=ui_theme,
            )

        path = self._output_dir / f"{request_id}.html"
        path.write_text(html, encoding="utf-8")

        now = self._utcnow()
        manifest["entries"][request_id] = {
            "request_id": request_id,
            "created_at": manifest["entries"].get(request_id, {}).get("created_at", now),
            "last_access_at": now,
            "size_bytes": path.stat().st_size if path.exists() else 0,
            "ui_theme": ui_theme,
            "prompt_version": prompt_version,
            "file_name": path.name,
        }
        self._save_manifest(manifest)

        return HtmlRenderArtifacts(
            file_path=path,
            url=f"/api/v1/html_preview/{path.name}",
            request_id=request_id,
            manifest_path=self._manifest_path,
        )

    def _load_manifest(self) -> dict[str, object]:
        if not self._manifest_path.exists():
            return {"version": 1, "entries": {}}
        try:
            data = json.loads(self._manifest_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return {"version": 1, "entries": {}}
        if not isinstance(data, dict):
            return {"version": 1, "entries": {}}
        entries = data.get("entries")
        if not isinstance(entries, dict):
            data["entries"] = {}
        return data

    def _save_manifest(self, manifest: dict[str, object]) -> None:
        manifest["updated_at"] = self._utcnow()
        self._manifest_path.write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True),
            encoding="utf-8",
        )

    def _inject_prerender_shell(
        self,
        *,
        html: str,
        cir_json: str,
        ui_theme: str | None,
    ) -> str:
        if 'id="metaview-prerender"' in html:
            return html
        try:
            cir = json.loads(cir_json)
        except json.JSONDecodeError:
            return html

        steps = cir.get("steps") if isinstance(cir, dict) else None
        if not isinstance(steps, list) or not steps:
            return html

        preview_steps = steps[: self._prerender_steps]
        cards = []
        for index, step in enumerate(preview_steps, start=1):
            if not isinstance(step, dict):
                continue
            title = html_lib.escape(str(step.get("title", f"步骤 {index}")))
            narration = html_lib.escape(str(step.get("narration", "")))
            visual_kind = html_lib.escape(str(step.get("visual_kind", "text")))
            article_style = (
                "border:1px solid rgba(127,127,127,.14);"
                "border-radius:16px;padding:12px 14px;"
                "background:rgba(127,127,127,.06)"
            )
            kind_style = (
                "font-size:12px;font-weight:700;opacity:.72;"
                "text-transform:uppercase"
            )
            title_style = "margin-top:6px;font-weight:700"
            narration_style = (
                "margin:8px 0 0;font-size:13px;line-height:1.6;opacity:.82"
            )
            card_html = (
                f'<article style="{article_style}">'
                f'<div style="{kind_style}">{visual_kind}</div>'
                f'<div style="{title_style}">{title}</div>'
                f'<p style="{narration_style}">{narration}</p>'
                f'</article>'
            )
            cards.append(card_html)
        if not cards:
            return html

        prerender = (
            f'<section id="metaview-prerender" data-theme="{html_lib.escape(ui_theme or "dark")}" '
            'style="padding:12px 16px;display:grid;gap:10px;">'
            f'{"".join(cards)}</section>'
        )
        return re.sub(r"(<body\b[^>]*>)", r"\1" + prerender, html, count=1, flags=re.IGNORECASE)

    def _utcnow(self) -> str:
        return datetime.now(timezone.utc).isoformat()
