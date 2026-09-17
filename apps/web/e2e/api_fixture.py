"""Isolated HTTP acceptance server: real API/SQLite, deterministic LLM only.

Never imported by the production app. No real model, login, or payment calls.
The explicit gate prevents accidentally using this fixture as a deployment.
"""
from __future__ import annotations

import json
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

if os.environ.get("METAVIEW_E2E") != "1":
    raise RuntimeError("This server is only available to isolated E2E tests")

from app.config import get_settings  # noqa: E402
from app.domain.models.pipeline_run import PipelineRunStatus  # noqa: E402
from app.domain.models.playbook import PlaybookScript  # noqa: E402
from app.infrastructure.persistence.sqlite_run_repository import SqliteRunRepository  # noqa: E402
from app.main import app  # noqa: E402
from app.presentation.dependencies import _MockLLMProvider, get_llm_provider  # noqa: E402


class FixtureLLM:
    async def complete(self, system: str, user: str) -> str:
        if "Playbook 局部修改助手" not in system:
            return await _MockLLMProvider().complete(system, user)
        request = json.loads(user)["user_request"]
        patch = ([{"op": "replace", "path": "/title", "value": "E2E 修改后的课程"}]
                 if request == "E2E 修改课程标题" else [])
        return json.dumps({
            "reply": "E2E：已修改课程标题。" if patch else "E2E：这是确定性的解释回复。",
            "change_summary": "e2e: title patch" if patch else "e2e: explanation only",
            "target": "playbook" if patch else "reply", "patch": patch,
        }, ensure_ascii=False)


app.dependency_overrides[get_llm_provider] = lambda: FixtureLLM()
_original_lifespan = app.router.lifespan_context


@asynccontextmanager
async def lifespan(application):
    settings = get_settings()
    db = Path(settings.history_db_path)
    if settings.app_edition != "self" or db.parent.name != "e2e":
        raise RuntimeError("E2E requires self edition and a dedicated data/e2e database")
    db.parent.mkdir(parents=True, exist_ok=True)
    async with _original_lifespan(application):
        repo = SqliteRunRepository(str(db))
        now = datetime.now(timezone.utc).isoformat()
        # Same minimal derivative geometry used by the existing interaction tests.
        snapshot = {
            "kind": "math_plot", "marker_x": 1,
            "x_min": -5, "x_max": 5, "y_min": -1, "y_max": 25,
            "curves": [
                {"expression": "x^2", "semantic_role": "curve"},
                {"expression": "2*x-1", "semantic_role": "tangent", "emphasis": "accent"},
            ],
        }
        script = PlaybookScript.model_validate({
            "fps": 30, "total_frames": 60, "domain": "math",
            "title": "E2E 切线沙盒", "summary": "交互保存与导出版本验收",
            "parameter_controls": [], "steps": [{
                "step_id": "plot", "end_frame": 60, "title": "移动切点",
                "voiceover_text": "沿曲线移动切点，观察切线斜率。",
                "snapshot": snapshot, "layers": [{"body": snapshot}], "tokens": [],
            }],
        })
        for viewport in ("desktop", "mobile"):
            run_id = f"e2e-sandbox-{viewport}"
            await repo.delete(run_id)
            await repo.create(run_id, "E2E seeded interaction fixture (not generated)", now)
            await repo.update(run_id, status=PipelineRunStatus.SUCCEEDED,
                              playbook_json=script.model_dump_json())
        yield


app.router.lifespan_context = lifespan
