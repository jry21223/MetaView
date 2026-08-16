"""End-to-end verification of tickets #235 / #237 / #239 / #240 across the
real process-local chain:

    RunPipelineUseCase (agent mode, stub agent provider)
      → quality gate → director persistence (SQLite)
      → ExportVideoUseCase (with_audio, stub TTS writing real WAV files)
      → _stretch_end_frames → remap_director_beats_to_playbook
      → export readiness recheck → inputProps.json

The only stubs are the agent provider, the reviewer LLM, TTS synthesis, and
the Remotion subprocess (out of scope for a process-local run). Everything
else — SQLite repositories, the canonical quality gate, self-check, stretch,
remap, duration probing (ffprobe/wave), quality-report merging — is the
production code path.

Coverage note: the unit suites in test_run_pipeline_agent_mode.py /
test_export_director_props.py already pin the same behaviors on in-memory
fakes; this file reruns them as one real chain so frame-dependent conclusions
(#237/#240) are verified against what will actually render, and persistence
degradation (#235) is verified through real SQLite.
"""

from __future__ import annotations

import json
import math
import os
import shutil
import struct
import subprocess
import wave
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import httpx
import pytest

from app.application.dto.pipeline_dto import PipelineRequest
from app.application.use_cases import run_pipeline as run_pipeline_module
from app.application.use_cases.export_video import ExportVideoUseCase
from app.application.use_cases.run_pipeline import (
    CANONICAL_QUALITY_REPAIR_ATTEMPTS,
    RunPipelineUseCase,
)
from app.domain.models.export_job import ExportJob, ExportOptions, TtsConfig
from app.domain.models.pipeline_run import PipelineRunStatus
from app.domain.models.quality_report import QualityReport
from app.domain.models.review import (
    PlaybookIssueSeverity,
    PlaybookReviewIssue,
    PlaybookReviewStatus,
    PlaybookReviewVerdict,
)
from app.domain.services.playbook_quality import estimate_step_frames
from app.infrastructure.persistence.db_init import init_db
from app.infrastructure.persistence.in_memory_export_repository import (
    InMemoryExportJobRepository,
)
from app.infrastructure.persistence.sqlite_director_repository import (
    SqliteRunDirectorRepository,
)
from app.infrastructure.persistence.sqlite_run_repository import SqliteRunRepository
from tests.coverage_test_utils import ComposableCoverageResolver

_PROMPT = "Show the array state during a bubble sort pass and explain the result."

# ---------------------------------------------------------------------------
# Fixtures / stubs
# ---------------------------------------------------------------------------


class _RaisingLLM:
    async def complete(self, system: str, user: str) -> str:  # noqa: ARG002
        raise AssertionError("LLM.complete must not be called in agent mode")


class _SequenceAgent:
    """Stub IAgentProvider (legacy ``generate`` contract) returning scripted playbooks."""

    def __init__(self, playbooks: list[dict[str, Any]]) -> None:
        self.playbooks = playbooks
        self.calls: list[dict[str, Any]] = []

    async def generate(
        self,
        prompt: str,
        provider_config: dict[str, Any] | None = None,
        route_decision: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        self.calls.append({
            "prompt": prompt,
            "provider_config": provider_config,
            "route_decision": route_decision,
        })
        index = min(len(self.calls) - 1, len(self.playbooks) - 1)
        return self.playbooks[index]


class _SequenceReviewer:
    model_name = "critic-e2e"

    def __init__(self, responses: list[str]) -> None:
        self.responses = responses
        self.calls: list[tuple[str, str]] = []

    async def complete(self, system: str, user: str) -> str:
        self.calls.append((system, user))
        index = min(len(self.calls) - 1, len(self.responses) - 1)
        return self.responses[index]


class _RejectingDirectorRepo:
    async def upsert(self, director: Any, updated_at: str) -> None:  # noqa: ARG002
        raise RuntimeError("director database unavailable")


def _reviewer_response(status: str) -> str:
    return json.dumps({
        "status": status,
        "summary": f"Reviewer returned {status}.",
        "issues": [],
    })


def _write_wav(path: Path, seconds: float, rate: int = 22050) -> None:
    """Real mono 16-bit WAV so the production duration probe (ffprobe, or the
    wave fallback) measures a genuine duration."""
    samples = max(1, int(seconds * rate))
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(
            b"".join(
                struct.pack("<h", int(12000 * math.sin(2 * math.pi * 440 * i / rate)))
                for i in range(samples)
            )
        )


class _StubTtsExportUseCase(ExportVideoUseCase):
    """Export use case with stub TTS synthesis writing real WAV files;
    Remotion rendering stays whatever the subclass inherits."""

    def __init__(self, *args: Any, audio_seconds: float = 8.0, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self.audio_seconds = audio_seconds

    async def _generate_step_audio(
        self,
        playbook: dict[str, Any],
        tts: TtsConfig,
        audio_dir: Path,
    ) -> list[str]:
        files = []
        for index in range(len(playbook.get("steps", []))):
            path = audio_dir / f"step_{index:03d}.wav"
            _write_wav(path, self.audio_seconds)
            files.append(str(path))
        return files


class _RealAudioExportUseCase(_StubTtsExportUseCase):
    """Stub Remotion subprocess; everything else stays production code.

    The stub render also fetches every non-empty ``audioFiles`` URL and
    compares the bytes to the on-disk WAV, proving the loopback server is
    alive for the whole render and serves the real audio (#244).
    """

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self.input_props: dict[str, Any] | None = None

    async def _run_remotion_render(
        self,
        job_id: str,
        props_path: Path,
        output_path: Path,
        options: Any,
    ) -> None:
        self.input_props = json.loads(props_path.read_text(encoding="utf-8"))
        audio_dir = props_path.parent / "audio"
        async with httpx.AsyncClient() as client:
            for i, url in enumerate(self.input_props.get("audioFiles") or []):
                if not url:
                    continue
                # Reachability while the render runs (server must stay alive).
                resp = await client.get(url)
                assert resp.status_code == 200, (
                    f"audioFiles[{i}] {url} unreachable during render: {resp.status_code}"
                )
                expected = (audio_dir / f"step_{i:03d}.wav").read_bytes()
                assert resp.content == expected, (
                    f"audioFiles[{i}] {url} served different bytes than step_{i:03d}.wav"
                )
        output_path.write_bytes(b"e2e-rendered")


class _RealRenderExportUseCase(_StubTtsExportUseCase):
    """Real Remotion subprocess; only TTS synthesis is stubbed (local WAVs)."""


# ---------------------------------------------------------------------------
# Playbook fixtures
# ---------------------------------------------------------------------------

_FIT_VOICEOVER = "展示数组当前状态"
_TIGHT_VOICEOVER = "第一轮冒泡排序将最大的元素与相邻元素依次比较并交换到数组末尾位置"
_FRAMES_PER_STEP = 180
_STEP_COUNT = 8  # agent-mode self-check requires MIN_AGENT_STEPS..MAX_AGENT_STEPS (8-14)
_ENGLISH_TAIL = "The array result is shown."  # overlaps prompt tokens; satisfies the final-answer check


def _algorithm_step(index: int, voiceover: str) -> dict[str, Any]:
    snapshot = {
        "kind": "algorithm_bars",
        "array_values": ["3", "1", "4", "2"],
        "numeric_values": [3, 1, 4, 2],
        "active_indices": [],
        "swap_indices": [],
        "sorted_indices": [],
        "pointers": {"cursor": 0},
    }
    return {
        "step_id": f"step_{index:02d}",
        "end_frame": index * _FRAMES_PER_STEP,
        "title": f"数组状态 {index}",
        "voiceover_text": voiceover,
        "tokens": [
            {"id": "t0", "label": "3", "value": "3", "emphasis": "primary"},
            {"id": "t1", "label": "1", "value": "1", "emphasis": "accent"},
            {"id": "t2", "label": "4", "value": "4", "emphasis": "secondary"},
            {"id": "t3", "label": "2", "value": "2", "emphasis": "secondary"},
        ],
        "snapshot": snapshot,
        "layers": [{"timing": {"enter_at": 0, "exit_at": 1}, "body": snapshot}],
    }


def _playbook(*, tight_voiceover: bool = False) -> dict[str, Any]:
    base = _TIGHT_VOICEOVER if tight_voiceover else _FIT_VOICEOVER
    steps = [
        _algorithm_step(index, f"{base}（第{index}步）{_ENGLISH_TAIL}")
        for index in range(1, _STEP_COUNT + 1)
    ]
    return {
        "schema_version": "1.0.0",
        "fps": 30,
        "total_frames": _STEP_COUNT * _FRAMES_PER_STEP,
        "domain": "algorithm",
        "title": "冒泡排序演示",
        "summary": "展示冒泡排序过程中数组状态的变化。",
        "steps": steps,
        "parameter_controls": [],
        "initial_data": {},
    }


def _repairable_gate_report(generator_path: str, coverage_mode: str) -> QualityReport:
    return QualityReport.from_review_verdict(
        PlaybookReviewVerdict(
            status=PlaybookReviewStatus.BLOCKED,
            summary="Canonical gate flagged a repairable issue.",
            issues=[
                PlaybookReviewIssue(
                    code="step.empty_voiceover",
                    severity=PlaybookIssueSeverity.ERROR,
                    path="steps[0].voiceover_text",
                    message="Every step must have non-empty voiceover_text.",
                    suggestion="Write narration.",
                    requires_repair=True,
                )
            ],
        ),
        generator_path=generator_path,
        coverage_mode=coverage_mode,
    )


def _clean_gate_report(generator_path: str, coverage_mode: str) -> QualityReport:
    return QualityReport.from_review_verdict(
        PlaybookReviewVerdict(
            status=PlaybookReviewStatus.CLEAN,
            summary="Playbook passed the canonical backend quality gate.",
            issues=[],
        ),
        generator_path=generator_path,
        coverage_mode=coverage_mode,
    )


def _sequence_quality_gate(reports: list[QualityReport]):
    """Stand-in for ``quality_gate_playbook`` returning scripted reports.

    The agent self-check and the canonical gate run the same checks
    (playbook_quality._review_playbook), so a genuinely ``repairable`` gate
    result is not reachable end-to-end with the real gate; this seam drives the
    canonical repair loop exactly as the unit suite does, but through the real
    SQLite repositories and full pipeline.
    """
    calls = 0

    def gate(
        playbook: Any,
        prompt: str,
        *,
        generator_path: str,
        coverage_mode: str,
        coverage_decision: Any = None,
        lesson_plan: Any = None,
    ) -> QualityReport:
        nonlocal calls
        report = reports[min(calls, len(reports) - 1)]
        calls += 1
        return report

    return gate


def _make_repos(db_path: str) -> tuple[SqliteRunRepository, SqliteRunDirectorRepository]:
    init_db(db_path)
    return SqliteRunRepository(db_path), SqliteRunDirectorRepository(db_path)


async def _run_agent_pipeline(
    run_repo: SqliteRunRepository,
    *,
    run_id: str,
    agent: _SequenceAgent,
    director_repo: Any = None,
    reviewer_llm: Any = None,
) -> None:
    use_case = RunPipelineUseCase(
        run_repo,
        _RaisingLLM(),
        reviewer_llm=reviewer_llm,
        agent_provider=agent,
        generation_mode="agent",
        coverage_resolver=ComposableCoverageResolver(),
        director_repo=director_repo,
    )
    await use_case.execute(
        run_id,
        PipelineRequest(prompt=_PROMPT, domain="algorithm"),
    )


# ---------------------------------------------------------------------------
# Scenario A — #237 + #240: agent run → audio export → stretched timeline
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_e2e_agent_run_then_audio_export_remaps_beats_to_stretched_boundaries(
    tmp_path,
) -> None:
    """Full chain: real RunPipelineUseCase (agent mode) → real
    ExportVideoUseCase with audio whose duration exceeds the animation, so the
    production stretch + beat remap + post-stretch recheck all run for real."""
    db = str(tmp_path / "e2e-a.db")
    run_repo, director_repo = _make_repos(db)
    export_repo = InMemoryExportJobRepository()
    run_id = "run-e2e-a"
    await run_repo.create(run_id, _PROMPT, "2026-08-16T00:00:00+00:00")

    # Voiceovers fit the pre-stretch 180-frame steps: estimate <= 180 frames so
    # the run-time gate stays clean (checked below for evidence).
    for index in range(1, _STEP_COUNT + 1):
        estimate = estimate_step_frames(
            f"{_FIT_VOICEOVER}（第{index}步）{_ENGLISH_TAIL}", fps=30
        )
        assert estimate - 12 <= _FRAMES_PER_STEP, (
            f"fit voiceover step {index} unexpectedly tight (estimate {estimate})"
        )

    agent = _SequenceAgent([_playbook()])
    await _run_agent_pipeline(
        run_repo, run_id=run_id, agent=agent, director_repo=director_repo
    )

    run = await run_repo.get(run_id)
    assert run is not None and run.status == PipelineRunStatus.SUCCEEDED
    assert len(agent.calls) == 1
    run_issue_codes = {issue.code for issue in run.quality_report.issues}
    assert "timeline.voiceover_too_short" not in run_issue_codes

    # -- Director really persisted in SQLite with full beat semantics ---------
    persisted = await director_repo.get(run_id)
    assert persisted is not None
    assert persisted.source == "rule"
    assert [beat.step_id for beat in persisted.beats] == [
        f"step_{index:02d}" for index in range(1, _STEP_COUNT + 1)
    ]
    assert [beat.start_frame for beat in persisted.beats] == [
        index * _FRAMES_PER_STEP for index in range(_STEP_COUNT)
    ]
    assert [beat.end_frame for beat in persisted.beats] == [
        (index + 1) * _FRAMES_PER_STEP for index in range(_STEP_COUNT)
    ]
    assert persisted.beats[0].intent == "hook"
    assert persisted.beats[0].camera_motion == "push_in"
    assert persisted.beats[-1].intent == "summary"
    assert persisted.beats[-1].shot_type == "wide"
    assert persisted.beats[-1].camera_motion == "pull_out"
    assert persisted.beats[-1].pacing == "slow"

    # -- Export with 8s audio per step: 240 frames > 180 animation frames -----
    job_id = "job-e2e-a"
    await export_repo.create(
        ExportJob(job_id=job_id, run_id=run_id, created_at=datetime.now(timezone.utc).isoformat())
    )
    artifacts = tmp_path / "artifacts"
    exporter = _RealAudioExportUseCase(
        export_repo,
        run_repo,
        director_repo,
        web_app_dir=tmp_path,
        artifacts_dir=artifacts,
        audio_seconds=8.0,
    )
    await exporter.execute(job_id, run_id, with_audio=True, tts=TtsConfig(api_key="test"))

    job = await export_repo.get(job_id)
    assert job is not None and job.status == "completed"
    assert job.output_path is not None
    assert exporter.input_props is not None

    # Stretch actually happened: each step 8s * 30fps = 240 frames.
    stretched_ends = [(index + 1) * 240 for index in range(_STEP_COUNT)]
    steps = exporter.input_props["script"]["steps"]
    assert [step["end_frame"] for step in steps] == stretched_ends
    assert exporter.input_props["script"]["total_frames"] == stretched_ends[-1]

    # -- #237: every beat frame == stretched cumulative step boundary ---------
    beats = exporter.input_props["director"]["beats"]
    assert [beat["start_frame"] for beat in beats] == [0, *stretched_ends[:-1]]
    assert [beat["end_frame"] for beat in beats] == stretched_ends
    assert [beat["step_id"] for beat in beats] == [
        f"step_{index:02d}" for index in range(1, _STEP_COUNT + 1)
    ]
    # Semantic fields survive the remap (rule-built director).
    assert beats[0]["intent"] == "hook" and beats[0]["camera_motion"] == "push_in"
    assert beats[-1]["intent"] == "summary"
    assert beats[-1]["shot_type"] == "wide"
    assert beats[-1]["camera_motion"] == "pull_out"
    assert beats[-1]["pacing"] == "slow"

    # inputProps.json really written to disk by the use case.
    props_file = artifacts / job_id / "inputProps.json"
    assert props_file.exists()
    assert json.loads(props_file.read_text(encoding="utf-8")) == exporter.input_props

    # -- #244: audioFiles must be loopback http:// URLs, not filesystem paths.
    # The stub render above already fetched each URL and compared bytes, so
    # reachability + content are proven while the render "runs".
    served = exporter.input_props["audioFiles"]
    assert len(served) == _STEP_COUNT
    for i, url in enumerate(served):
        parsed = urlparse(url)
        assert parsed.scheme == "http", f"audioFiles[{i}] not http: {url}"
        assert parsed.hostname == "127.0.0.1", f"audioFiles[{i}] not loopback: {url}"
        assert parsed.path == f"/step_{i:03d}.wav", f"audioFiles[{i}] bad path: {url}"

    # -- #240: post-stretch recheck adds no false frame-based warning ---------
    after = await run_repo.get(run_id)
    assert after is not None and after.quality_report is not None
    codes = {issue.code for issue in after.quality_report.issues}
    assert "timeline.voiceover_too_short" not in codes
    assert after.quality_report.status not in {"repairable", "blocked"}


@pytest.mark.asyncio
async def test_e2e_agent_run_then_export_drops_stale_frame_warning(tmp_path) -> None:
    """Regression test for #245: a run→export chain must not carry a stale
    pre-stretch frame warning into the merged export report.

    The run-time gate evaluates the PRE-stretch timeline, so a tight voiceover
    legitimately warns at run time. Audio stretching then lengthens the steps
    enough that the export recheck (on the final timeline) is clean. The merged
    report must therefore drop the frame-count-dependent warning
    (timeline.voiceover_too_short); stretch-independent warnings keep their
    preserve-on-merge semantics (unit-level merge coverage in
    test_export_director_props.py).

    The unit suite (test_export_recheck_uses_stretched_timeline...) only seeds
    runs WITHOUT a prior quality report, so only this end-to-end chain sees the
    merge of a real prior report.
    """
    db = str(tmp_path / "e2e-a2.db")
    run_repo, director_repo = _make_repos(db)
    export_repo = InMemoryExportJobRepository()
    run_id = "run-e2e-a2"
    await run_repo.create(run_id, _PROMPT, "2026-08-16T00:00:00+00:00")

    for index in range(1, _STEP_COUNT + 1):
        estimate = estimate_step_frames(
            f"{_TIGHT_VOICEOVER}（第{index}步）{_ENGLISH_TAIL}", fps=30
        )
        assert estimate - 12 > _FRAMES_PER_STEP, (
            f"tight voiceover step {index} not tight enough (estimate {estimate})"
        )

    agent = _SequenceAgent([_playbook(tight_voiceover=True)])
    await _run_agent_pipeline(
        run_repo, run_id=run_id, agent=agent, director_repo=director_repo
    )
    run = await run_repo.get(run_id)
    assert run is not None and run.status == PipelineRunStatus.SUCCEEDED
    assert "timeline.voiceover_too_short" in {
        issue.code for issue in run.quality_report.issues
    }, "pre-stretch run gate should flag the tight voiceover"

    # 11s audio = 330 frames >= estimate - 12 (~230), so the stretch resolves it.
    job_id = "job-e2e-a2"
    await export_repo.create(
        ExportJob(job_id=job_id, run_id=run_id, created_at=datetime.now(timezone.utc).isoformat())
    )
    exporter = _RealAudioExportUseCase(
        export_repo,
        run_repo,
        director_repo,
        web_app_dir=tmp_path,
        artifacts_dir=tmp_path / "artifacts",
        audio_seconds=11.0,
    )
    await exporter.execute(job_id, run_id, with_audio=True, tts=TtsConfig(api_key="test"))

    job = await export_repo.get(job_id)
    assert job is not None and job.status == "completed"
    assert exporter.input_props is not None
    stretched_ends = [(index + 1) * 330 for index in range(_STEP_COUNT)]
    assert [step["end_frame"] for step in exporter.input_props["script"]["steps"]] == (
        stretched_ends
    )

    after = await run_repo.get(run_id)
    assert after is not None and after.quality_report is not None
    codes = {issue.code for issue in after.quality_report.issues}
    assert "timeline.voiceover_too_short" not in codes, (
        "the stretched timeline resolves the tight voiceover, so the merged "
        "export report must not resurrect the pre-stretch warning (#245)"
    )


# ---------------------------------------------------------------------------
# Scenario B — #235: director persistence failure degrades, export rebuilds
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_e2e_agent_mode_director_persist_failure_degrades_then_export_rebuilds(
    tmp_path,
) -> None:
    db = str(tmp_path / "e2e-b.db")
    run_repo, _ = _make_repos(db)
    export_repo = InMemoryExportJobRepository()
    run_id = "run-e2e-b"
    await run_repo.create(run_id, _PROMPT, "2026-08-16T00:00:00+00:00")

    # Run with a director repository whose upsert always fails (#235).
    agent = _SequenceAgent([_playbook()])
    await _run_agent_pipeline(
        run_repo, run_id=run_id, agent=agent, director_repo=_RejectingDirectorRepo()
    )

    run = await run_repo.get(run_id)
    assert run is not None and run.status == PipelineRunStatus.SUCCEEDED
    assert run.error is None
    assert run.quality_report is not None
    assert run.quality_report.status == "warnings"
    persist_issues = [
        issue
        for issue in run.quality_report.issues
        if issue.code == "director.persistence_failed"
    ]
    assert len(persist_issues) == 1
    assert persist_issues[0].severity == PlaybookIssueSeverity.WARNING
    assert "export" in (persist_issues[0].suggestion or "").lower()

    # Export side: fresh SQLite director table (no row for this run) → the use
    # case rebuilds the default director and completes the export.
    job_id = "job-e2e-b"
    await export_repo.create(
        ExportJob(job_id=job_id, run_id=run_id, created_at=datetime.now(timezone.utc).isoformat())
    )
    director_repo = SqliteRunDirectorRepository(db)
    exporter = _RealAudioExportUseCase(
        export_repo,
        run_repo,
        director_repo,
        web_app_dir=tmp_path,
        artifacts_dir=tmp_path / "artifacts",
        audio_seconds=1.0,
    )
    await exporter.execute(job_id, run_id, with_audio=False, tts=None)

    job = await export_repo.get(job_id)
    assert job is not None and job.status == "completed"
    assert exporter.input_props is not None
    assert exporter.input_props["director"]["run_id"] == run_id
    assert len(exporter.input_props["director"]["beats"]) == _STEP_COUNT
    assert exporter.input_props["director"]["beats"][0]["camera_motion"] == "push_in"


# ---------------------------------------------------------------------------
# Scenario D — #239: default-config agent mode full flow, repair bound
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_e2e_agent_mode_default_config_full_flow(tmp_path) -> None:
    """Default config (no reviewer LLM, reviewer_mode=on_failure) walks
    生成 → 自检 → reviewer 决策 → canonical gate → finalize and succeeds."""
    db = str(tmp_path / "e2e-d.db")
    run_repo, director_repo = _make_repos(db)
    run_id = "run-e2e-d"
    await run_repo.create(run_id, _PROMPT, "2026-08-16T00:00:00+00:00")

    agent = _SequenceAgent([_playbook()])
    await _run_agent_pipeline(
        run_repo, run_id=run_id, agent=agent, director_repo=director_repo
    )

    run = await run_repo.get(run_id)
    assert run is not None and run.status == PipelineRunStatus.SUCCEEDED
    assert run.playbook is not None and run.playbook.title == "冒泡排序演示"
    assert run.quality_report is not None
    assert run.quality_report.status == "clean"
    # The persisted playbook/director/quality columns are all populated.
    assert await director_repo.get(run_id) is not None

    # review_json: the action log proves every leg of the flow ran.
    assert run.review is not None
    actions = run.review.actions
    assert "agent:self_check:clean" in actions
    assert "reviewer:skipped_on_clean_self_check" in actions
    assert not any(
        action.startswith("quality:repair_attempt:2") for action in actions
    ), "clean run must never attempt a second canonical repair"
    assert len(agent.calls) == 1

    # #239: the canonical repair budget is a module constant defaulting to 1.
    assert CANONICAL_QUALITY_REPAIR_ATTEMPTS == 1


@pytest.mark.asyncio
async def test_e2e_agent_mode_canonical_repair_exactly_once_through_real_repos(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> None:
    """The canonical repair loop (CANONICAL_QUALITY_REPAIR_ATTEMPTS) is
    unreachable with the real gate — self-check and gate run the same checks
    (playbook_quality._review_playbook) and self-check blocks first — so the
    gate is scripted through the same seam the unit suite uses. Everything else
    (SQLite repos, reviewer stub, full pipeline) is real: the run must persist
    review_json with exactly ``quality:repair_attempt:1`` and no ``:2``."""
    db = str(tmp_path / "e2e-d2.db")
    run_repo, director_repo = _make_repos(db)
    run_id = "run-e2e-d2"
    await run_repo.create(run_id, _PROMPT, "2026-08-16T00:00:00+00:00")

    agent = _SequenceAgent([_playbook(), _playbook()])
    reviewer = _SequenceReviewer([
        _reviewer_response("clean"),
        _reviewer_response("clean"),
    ])
    monkeypatch.setattr(
        run_pipeline_module,
        "quality_gate_playbook",
        _sequence_quality_gate([
            _repairable_gate_report("agent", "composable"),
            _clean_gate_report("agent", "composable"),
        ]),
    )
    await _run_agent_pipeline(
        run_repo,
        run_id=run_id,
        agent=agent,
        director_repo=director_repo,
        reviewer_llm=reviewer,
    )

    assert len(agent.calls) == 2  # initial generation + one canonical repair
    assert len(reviewer.calls) == 2  # initial review + post-repair review

    run = await run_repo.get(run_id)
    assert run is not None and run.status == PipelineRunStatus.SUCCEEDED
    assert run.review is not None
    actions = run.review.actions
    assert "quality:repair_attempt:1" in actions
    assert not any(
        action.startswith("quality:repair_attempt:2") for action in actions
    ), f"repair must run exactly once, actions were: {actions}"
    assert run.quality_report is not None
    assert run.quality_report.status == "clean"
    assert await director_repo.get(run_id) is not None


# ---------------------------------------------------------------------------
# Scenario E — #244: real Remotion render with audio (manual harness)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_e2e_real_remotion_render_with_audio() -> None:
    """#244 real-render harness: full agent pipeline → export with audio →
    REAL ``remotion render`` subprocess.

    Skipped unless METAVIEW_REAL_RENDER=1 because it spawns headless Chrome
    and takes ~1 minute. Artifacts land in eval/videos/artifacts/ (gitignored)
    so the worktree stays clean; the output video must contain an audio
    stream (ffprobe) proving the loopback-served audio made it into the mix.
    """
    if os.environ.get("METAVIEW_REAL_RENDER") != "1":
        pytest.skip("set METAVIEW_REAL_RENDER=1 to run the real remotion render")

    repo_root = Path(__file__).resolve().parents[3]
    artifacts = repo_root / "eval" / "videos" / "artifacts" / "job-render-with-audio"
    db = str(artifacts / "render.db")
    run_repo, director_repo = _make_repos(db)
    export_repo = InMemoryExportJobRepository()
    run_id = "run-render-with-audio"
    await run_repo.create(run_id, _PROMPT, "2026-08-16T00:00:00+00:00")
    await _run_agent_pipeline(
        run_repo, run_id=run_id, agent=_SequenceAgent([_playbook()]), director_repo=director_repo
    )
    run = await run_repo.get(run_id)
    assert run is not None and run.status == PipelineRunStatus.SUCCEEDED

    job_id = "job-render-with-audio"
    await export_repo.create(
        ExportJob(job_id=job_id, run_id=run_id, created_at=datetime.now(timezone.utc).isoformat())
    )
    exporter = _RealRenderExportUseCase(
        export_repo,
        run_repo,
        director_repo,
        web_app_dir=repo_root / "apps/web",
        artifacts_dir=artifacts,
        audio_seconds=1.0,
    )
    await exporter.execute(
        job_id,
        run_id,
        with_audio=True,
        tts=TtsConfig(api_key="test"),
        options=ExportOptions(quality="720p"),
    )

    job = await export_repo.get(job_id)
    assert job is not None and job.status == "completed"
    video = artifacts / job_id / "video.mp4"
    assert video.exists() and video.stat().st_size > 0, "render produced no video"

    if shutil.which("ffprobe"):
        out = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-select_streams",
                "a",
                "-show_entries",
                "stream=codec_type",
                "-of",
                "csv=p=0",
                str(video),
            ],
            check=True,
            capture_output=True,
            text=True,
        )
        assert "audio" in out.stdout, f"rendered video has no audio stream: {out.stdout!r}"
