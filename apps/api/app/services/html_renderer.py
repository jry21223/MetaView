"""
HTML Renderer — saves a self-contained HTML string to disk and returns a
serveable URL with content-addressable cache and manifest metadata.
"""

from __future__ import annotations

import hashlib
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
    cache_key: str
    cache_hit: bool
    manifest_path: Path


class HtmlRenderer:
    """Persist generated HTML with content-addressable cache and manifest metadata."""

    def __init__(
        self,
        output_dir: str | Path = "data/html_previews",
        *,
        ttl_seconds: int = 7 * 24 * 60 * 60,
        max_entries: int = 128,
        prerender_steps: int = 2,
    ) -> None:
        self._output_dir = Path(output_dir)
        self._ttl_seconds = ttl_seconds
        self._max_entries = max_entries
        self._prerender_steps = max(1, prerender_steps)
        self._manifest_path = self._output_dir / "manifest.json"

    def render(
        self,
        html: str,
        request_id: str,
        *,
        cir_json: str,
        ui_theme: str | None = None,
        prompt_version: str = "unknown",
    ) -> HtmlRenderArtifacts:
        self._output_dir.mkdir(parents=True, exist_ok=True)
        manifest = self._load_manifest()
        cache_key = self._build_cache_key(
            cir_json=cir_json,
            ui_theme=ui_theme,
            prompt_version=prompt_version,
        )
        self._evict_entries(manifest)

        path = self._output_dir / f"{cache_key}.html"
        cache_hit = path.exists()
        if not cache_hit:
            html = self._inject_prerender_shell(
                html=html,
                cir_json=cir_json,
                ui_theme=ui_theme,
            )
            path.write_text(html, encoding="utf-8")

        now = self._utcnow()
        size_bytes = path.stat().st_size if path.exists() else 0
        manifest["entries"][cache_key] = {
            "cache_key": cache_key,
            "request_id": request_id,
            "created_at": manifest["entries"].get(cache_key, {}).get("created_at", now),
            "last_access_at": now,
            "size_bytes": size_bytes,
            "ui_theme": ui_theme,
            "prompt_version": prompt_version,
            "file_name": path.name,
        }
        self._save_manifest(manifest)

        return HtmlRenderArtifacts(
            file_path=path,
            url=f"/api/v1/html_preview/{path.name}",
            cache_key=cache_key,
            cache_hit=cache_hit,
            manifest_path=self._manifest_path,
        )

    def _build_cache_key(
        self,
        *,
        cir_json: str,
        ui_theme: str | None,
        prompt_version: str,
    ) -> str:
        try:
            normalized_cir = json.dumps(
                json.loads(cir_json),
                ensure_ascii=False,
                sort_keys=True,
                separators=(",", ":"),
            )
        except json.JSONDecodeError:
            normalized_cir = cir_json.strip()
        digest = hashlib.sha256()
        digest.update(normalized_cir.encode("utf-8"))
        digest.update(b"\x1f")
        digest.update((ui_theme or "default").encode("utf-8"))
        digest.update(b"\x1f")
        digest.update(prompt_version.encode("utf-8"))
        return digest.hexdigest()[:20]

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

    def _evict_entries(self, manifest: dict[str, object]) -> None:
        entries = manifest.setdefault("entries", {})
        if not isinstance(entries, dict):
            manifest["entries"] = {}
            entries = manifest["entries"]

        now = datetime.now(timezone.utc)
        expired_keys: list[str] = []
        normalized: list[tuple[str, dict[str, object], datetime]] = []
        for key, raw_meta in list(entries.items()):
            if not isinstance(raw_meta, dict):
                expired_keys.append(key)
                continue
            access_at = self._parse_dt(raw_meta.get("last_access_at")) or self._parse_dt(
                raw_meta.get("created_at")
            )
            if access_at is None:
                access_at = now
            if (now - access_at).total_seconds() > self._ttl_seconds:
                expired_keys.append(key)
                continue
            normalized.append((key, raw_meta, access_at))

        for key in expired_keys:
            self._delete_entry(entries, key)

        if len(normalized) <= self._max_entries:
            return

        normalized.sort(key=lambda item: item[2])
        overflow = len(normalized) - self._max_entries
        for key, _, _ in normalized[:overflow]:
            self._delete_entry(entries, key)

    def _delete_entry(self, entries: dict[str, object], key: str) -> None:
        meta = entries.pop(key, None)
        if isinstance(meta, dict):
            file_name = meta.get("file_name")
            if isinstance(file_name, str):
                (self._output_dir / file_name).unlink(missing_ok=True)
        else:
            (self._output_dir / f"{key}.html").unlink(missing_ok=True)

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
            cards.append(
                f'<article style="border:1px solid rgba(127,127,127,.14);border-radius:16px;padding:12px 14px;background:rgba(127,127,127,.06)">'
                f'<div style="font-size:12px;font-weight:700;opacity:.72;text-transform:uppercase;">{visual_kind}</div>'
                f'<div style="margin-top:6px;font-weight:700;">{title}</div>'
                f'<p style="margin:8px 0 0;font-size:13px;line-height:1.6;opacity:.82;">{narration}</p>'
                f'</article>'
            )
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

    def _parse_dt(self, value: object) -> datetime | None:
        if not isinstance(value, str) or not value:
            return None
        try:
            return datetime.fromisoformat(value)
        except ValueError:
            return None
