from __future__ import annotations

import argparse
import asyncio
import gc
import json
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml

API_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = Path(__file__).resolve().parents[3]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))

from app.application.dto.followup_dto import FollowUpRequest  # noqa: E402
from app.application.use_cases.export_video import ExportVideoUseCase  # noqa: E402
from app.application.use_cases.follow_up import FollowUpPatchUseCase  # noqa: E402
from app.domain.models.export_job import ExportJob, ExportOptions  # noqa: E402
from app.domain.models.pipeline_run import PipelineRunStatus  # noqa: E402
from app.domain.models.playbook import PlaybookScript  # noqa: E402
from app.domain.models.quality_report import QualityReport  # noqa: E402
from app.domain.services.director_builder import build_default_director  # noqa: E402
from app.infrastructure.persistence.db_init import init_db  # noqa: E402
from app.infrastructure.persistence.in_memory_export_repository import (  # noqa: E402
    InMemoryExportJobRepository,
)
from app.infrastructure.persistence.sqlite_director_repository import (  # noqa: E402
    SqliteRunDirectorRepository,
)
from app.infrastructure.persistence.sqlite_run_repository import (  # noqa: E402
    SqliteRunRepository,
)

PROMPTS_DEFAULT = REPO_ROOT / "eval" / "prompts" / "director_product_loop_cases.yaml"
REPORTS_DIR = REPO_ROOT / "eval" / "reports"

_FIXTURE_BY_CASE = {
    "math-quadratic-director": "math-quadratic-vertex.json",
    "algorithm-bfs-director": "algorithm-bfs-tree.json",
    "code-recursion-stack": "code-recursion-factorial.json",
    "physics-incline-motion": "physics-free-body.json",
}


class SequenceLLM:
    def __init__(self, responses: list[str]) -> None:
        self.responses = list(responses)
        self.calls = 0

    async def complete(self, system: str, user: str) -> str:
        self.calls += 1
        if len(self.responses) == 1:
            return self.responses[0]
        return self.responses.pop(0)


class RecordingExportVideoUseCase(ExportVideoUseCase):
    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self.input_props: dict[str, Any] | None = None

    def _build_export_quality_report(
        self,
        playbook: PlaybookScript,
        run: Any,
    ) -> QualityReport:
        return QualityReport(status="clean", generator_path="director_product_loop_eval")

    async def _run_remotion_render(
        self,
        job_id: str,
        props_path: Path,
        output_path: Path,
        options: ExportOptions,
    ) -> None:
        self.input_props = json.loads(props_path.read_text(encoding="utf-8"))
        output_path.write_bytes(b"director product-loop local evidence")


def load_cases(path: Path, ids: list[str] | None = None) -> list[dict[str, Any]]:
    data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    cases = list(data.get("cases", []))
    if ids:
        wanted = set(ids)
        cases = [case for case in cases if case.get("id") in wanted]
    return cases


async def run_cases(
    *,
    prompts_path: Path = PROMPTS_DEFAULT,
    output_path: Path | None = None,
    ids: list[str] | None = None,
    repo_root: Path = REPO_ROOT,
) -> dict[str, Any]:
    cases = load_cases(prompts_path, ids)
    if not cases:
        raise ValueError(f"No Director product-loop cases found in {prompts_path}")

    with tempfile.TemporaryDirectory(prefix="metaview-director-loop-") as tmp:
        tmp_root = Path(tmp)
        results = [
            await _run_case(case, repo_root=repo_root, tmp_root=tmp_root / str(case["id"]))
            for case in cases
        ]
        gc.collect()

    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    report = {
        "timestamp": ts,
        "mode": "local_recorded_product_loop",
        "total_cases": len(results),
        "passed": sum(1 for result in results if _case_passed(result)),
        "cases": results,
    }

    target = output_path or REPORTS_DIR / f"director_product_loop_{ts}.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    report["report_path"] = str(target)
    return report


async def _run_case(case: dict[str, Any], *, repo_root: Path, tmp_root: Path) -> dict[str, Any]:
    errors: list[str] = []
    run_id = str(case["id"])
    tmp_root.mkdir(parents=True, exist_ok=True)
    db = str(tmp_root / "director_product_loop.db")
    init_db(db)
    run_repo = SqliteRunRepository(db)
    director_repo = SqliteRunDirectorRepository(db)
    export_repo = InMemoryExportJobRepository()
    now = datetime.now(timezone.utc).isoformat()

    try:
        playbook = _load_playbook(case, repo_root=repo_root)
        playbook_json = playbook.model_dump_json()
        await run_repo.create(run_id, str(case["prompt"]), now)
        await run_repo.update(
            run_id,
            status=PipelineRunStatus.SUCCEEDED,
            playbook_json=playbook_json,
        )
        director = build_default_director(playbook, run_id)
        await director_repo.upsert(director, now)
        initial_version_id = await run_repo.ensure_initial_version(
            run_id,
            playbook_json,
            created_at=now,
            director_json=director.model_dump_json(),
        )

        target_index = min(_target_beat_index(case), max(len(director.beats) - 1, 0))
        patch = _director_patch_for(case, target_index)
        followup = await FollowUpPatchUseCase(
            SequenceLLM([_llm_payload(patch)]),
            default_step_frames=60,
        ).execute(
            playbook,
            FollowUpRequest(message=str(case["follow_up"])),
            director,
        )
        if followup.director is None:
            raise RuntimeError("follow-up did not return a DirectorScript patch")

        version_id = f"{run_id}:v1"
        await run_repo.append_version(
            run_id,
            version_id=version_id,
            playbook_json=playbook_json,
            source="followup",
            followup_id=None,
            parent_version_id=initial_version_id,
            summary=followup.change_summary,
            created_at=datetime.now(timezone.utc).isoformat(),
            director_json=followup.director.model_dump_json(),
        )
        await director_repo.upsert(followup.director, datetime.now(timezone.utc).isoformat())

        export_job = ExportJob(
            job_id=f"{run_id}-export",
            run_id=run_id,
            with_audio=False,
            created_at=datetime.now(timezone.utc).isoformat(),
        )
        await export_repo.create(export_job)
        export_use_case = RecordingExportVideoUseCase(
            export_repo,
            run_repo,
            director_repo,
            web_app_dir=tmp_root,
            artifacts_dir=tmp_root / "artifacts",
        )
        await export_use_case.execute(
            export_job.job_id,
            run_id,
            with_audio=False,
            tts=None,
            version_id=version_id,
        )
        exported_job = await export_repo.get(export_job.job_id)
        export_props = export_use_case.input_props or {}
        patched_beat = followup.director.beats[target_index]
        active_run = await run_repo.get(run_id)

        playbook_unchanged = (
            active_run is not None
            and active_run.playbook is not None
            and active_run.playbook.model_dump(mode="json") == playbook.model_dump(mode="json")
        )
        export_director = export_props.get("director") if isinstance(export_props, dict) else None
        export_ok = (
            exported_job is not None
            and exported_job.status.value == "completed"
            and isinstance(export_director, dict)
            and export_director.get("source") == "manual"
            and export_director.get("beats", [])[target_index]["pacing"] == patched_beat.pacing
        )

        return {
            "id": run_id,
            "prompt": case["prompt"],
            "follow_up": case["follow_up"],
            "expected": case["expected"],
            "run_id": run_id,
            "run_status": PipelineRunStatus.SUCCEEDED.value,
            "has_playbook": True,
            "has_director": True,
            "step_count": len(playbook.steps),
            "beat_count": len(followup.director.beats),
            "current_beat_visible_in_inspector": _inspector_fields_available(
                followup.director.model_dump(mode="json"),
                target_index,
            ),
            "followup_ok": followup.target == "director" and followup.director is not None,
            "director_patch_ok": _director_patch_applied(
                followup.director.model_dump(mode="json"),
                target_index,
                patch,
            ),
            "playbook_unchanged_when_director_patch": playbook_unchanged,
            "export_ok": export_ok,
            "version_id": version_id,
            "patched_beat_index": target_index,
            "errors": errors,
        }
    except Exception as exc:  # noqa: BLE001 - report captures local evidence failures.
        errors.append(str(exc))
        return {
            "id": run_id,
            "prompt": case.get("prompt"),
            "follow_up": case.get("follow_up"),
            "expected": case.get("expected"),
            "run_id": run_id,
            "run_status": "failed",
            "has_playbook": False,
            "has_director": False,
            "step_count": 0,
            "beat_count": 0,
            "current_beat_visible_in_inspector": False,
            "followup_ok": False,
            "director_patch_ok": False,
            "playbook_unchanged_when_director_patch": False,
            "export_ok": False,
            "version_id": None,
            "patched_beat_index": None,
            "errors": errors,
        }


def _load_playbook(case: dict[str, Any], *, repo_root: Path) -> PlaybookScript:
    case_id = str(case["id"])
    fixture = _FIXTURE_BY_CASE.get(case_id)
    if fixture is None:
        raise ValueError(f"No fixture mapping for case {case_id}")
    payload = json.loads((repo_root / "eval" / "fixtures" / fixture).read_text(encoding="utf-8"))
    return PlaybookScript.model_validate(payload)


def _target_beat_index(case: dict[str, Any]) -> int:
    if str(case["id"]) == "code-recursion-stack":
        return 4
    return 1


def _director_patch_for(case: dict[str, Any], beat_index: int) -> list[dict[str, Any]]:
    case_id = str(case["id"])
    focus = {
        "math-quadratic-director": "关键公式",
        "algorithm-bfs-director": "当前出队节点",
        "code-recursion-stack": "每一层返回值",
        "physics-incline-motion": "沿斜面方向的分力",
    }.get(case_id, "重点对象")
    camera_motion = "push_in" if case_id != "algorithm-bfs-director" else "hold"
    return [
        {"op": "replace", "path": f"/beats/{beat_index}/camera_motion", "value": camera_motion},
        {"op": "replace", "path": f"/beats/{beat_index}/pacing", "value": "slow"},
        {"op": "replace", "path": f"/beats/{beat_index}/focus_target", "value": focus},
        {"op": "replace", "path": f"/beats/{beat_index}/emphasis_terms", "value": [focus]},
    ]


def _llm_payload(patch: list[dict[str, Any]]) -> str:
    return json.dumps(
        {
            "reply": "已优先调整 DirectorScript。",
            "change_summary": "director: update camera pacing and focus",
            "target": "director",
            "patch": patch,
        },
        ensure_ascii=False,
    )


def _inspector_fields_available(director: dict[str, Any], beat_index: int) -> bool:
    beats = director.get("beats")
    if not isinstance(beats, list) or beat_index >= len(beats):
        return False
    beat = beats[beat_index]
    required = {
        "beat_id",
        "step_id",
        "intent",
        "shot_type",
        "camera_motion",
        "pacing",
        "focus_target",
        "emphasis_terms",
        "start_frame",
        "end_frame",
    }
    return bool(director.get("source")) and required.issubset(set(beat))


def _director_patch_applied(
    director: dict[str, Any],
    beat_index: int,
    patch: list[dict[str, Any]],
) -> bool:
    beats = director.get("beats")
    if not isinstance(beats, list) or beat_index >= len(beats):
        return False
    beat = beats[beat_index]
    return director.get("source") == "manual" and all(
        beat.get(str(op["path"]).split("/")[-1]) == op.get("value") for op in patch
    )


def _case_passed(result: dict[str, Any]) -> bool:
    return all(
        bool(result.get(field))
        for field in (
            "has_playbook",
            "has_director",
            "current_beat_visible_in_inspector",
            "followup_ok",
            "director_patch_ok",
            "playbook_unchanged_when_director_patch",
            "export_ok",
        )
    ) and result.get("run_status") == PipelineRunStatus.SUCCEEDED.value


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run Director product-loop local cases.")
    parser.add_argument("--prompts", default=str(PROMPTS_DEFAULT))
    parser.add_argument("--ids", nargs="*")
    parser.add_argument("--output")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    report = asyncio.run(
        run_cases(
            prompts_path=Path(args.prompts),
            output_path=Path(args.output) if args.output else None,
            ids=args.ids,
        )
    )
    print(f"Report saved: {report['report_path']}")
    print(f"Passed: {report['passed']}/{report['total_cases']}")
    for result in report["cases"]:
        status = "PASS" if _case_passed(result) else "FAIL"
        print(f"- {result['id']}: {status}")
        if result["errors"]:
            print(f"  errors: {result['errors']}")
    return 0 if report["passed"] == report["total_cases"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
