"""
HTML Renderer — saves a self-contained HTML string to disk and returns a
serveable URL.  Completely independent from the Manim video renderer.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class HtmlRenderArtifacts:
    file_path: Path
    url: str


class HtmlRenderer:
    """Persist generated HTML to disk so it can be served via static route."""

    def __init__(self, output_dir: str | Path = "data/html_previews") -> None:
        self._output_dir = Path(output_dir)

    def render(self, html: str, request_id: str) -> HtmlRenderArtifacts:
        self._output_dir.mkdir(parents=True, exist_ok=True)
        path = self._output_dir / f"{request_id}.html"
        path.write_text(html, encoding="utf-8")
        url = f"/api/v1/html_preview/{request_id}.html"
        return HtmlRenderArtifacts(file_path=path, url=url)
