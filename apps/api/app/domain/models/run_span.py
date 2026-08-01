"""Telemetry spans for a single pipeline run.

A span records one bounded stage of a run: routing, lesson planning, a single
agent attempt, a reviewer call, a quality repair, and so on. Retries are
expressed as sibling spans sharing a ``parent_span_id`` and differing by
``attempt_index`` — never as a collapsed ``attempts=3`` counter, because a
counter cannot say which layer retried or why.

Spans are observability only. Nothing in the generation path may read a span
back to make a decision.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

SpanStatus = Literal["running", "ok", "error", "timeout", "skipped"]


class RunStage:
    """Canonical stage names.

    Kept as plain string constants rather than an Enum so a new stage can be
    recorded by a caller without a schema migration.
    """

    PIPELINE_TOTAL = "pipeline.total"
    ROUTER = "router"
    LESSON_PLAN = "lesson_plan"
    COVERAGE_RESOLUTION = "coverage_resolution"
    SKILL_PACK = "skill_pack"
    GENERATION_SINGLE = "generation.single"
    GENERATION_AGENT_PROVIDER = "generation.agent_provider"
    AGENT_SIDECAR = "agent.sidecar"
    AGENT_ATTEMPT = "agent.attempt"
    REVIEWER = "reviewer"
    QUALITY_GATE = "quality_gate"
    QUALITY_REPAIR = "quality_repair"
    FINALIZE = "finalize"


ALL_STAGES: frozenset[str] = frozenset(
    {
        RunStage.PIPELINE_TOTAL,
        RunStage.ROUTER,
        RunStage.LESSON_PLAN,
        RunStage.COVERAGE_RESOLUTION,
        RunStage.SKILL_PACK,
        RunStage.GENERATION_SINGLE,
        RunStage.GENERATION_AGENT_PROVIDER,
        RunStage.AGENT_SIDECAR,
        RunStage.AGENT_ATTEMPT,
        RunStage.REVIEWER,
        RunStage.QUALITY_GATE,
        RunStage.QUALITY_REPAIR,
        RunStage.FINALIZE,
    }
)


class TokenUsage(BaseModel):
    """Token counts reported by a provider for one model call.

    Every field is optional: a provider that does not report a counter must
    leave it ``None`` so "not measured" stays distinguishable from
    "measured zero". That distinction is the whole point of this batch — a
    silent zero would read as "prompt caching is off" when the truth is
    "nobody asked".
    """

    model_config = ConfigDict(frozen=True)

    input_tokens: int | None = None
    output_tokens: int | None = None
    cache_read_tokens: int | None = None
    cache_write_tokens: int | None = None


class RunSpan(BaseModel):
    """One recorded stage of a pipeline run."""

    model_config = ConfigDict(frozen=True)

    span_id: str
    run_id: str
    parent_span_id: str | None = None
    stage: str
    attempt_index: int = 0
    status: SpanStatus = "running"

    started_at: str
    finished_at: str | None = None
    duration_ms: int | None = None

    provider: str | None = None
    model: str | None = None

    input_tokens: int | None = None
    output_tokens: int | None = None
    cache_read_tokens: int | None = None
    cache_write_tokens: int | None = None

    model_turns: int | None = None
    tool_batches: int | None = None
    tool_calls: int | None = None

    error_code: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class RunTelemetrySummary(BaseModel):
    """Public, run-level metrics derived from the span tree."""

    started_at: str | None = None
    finished_at: str | None = None
    generator_path: str | None = None
    total_duration_ms: int | None = None

    input_tokens: int | None = None
    output_tokens: int | None = None
    cache_read_tokens: int | None = None
    cache_write_tokens: int | None = None
    generation_model_turns: int | None = None
    tool_batches: int | None = None
    tool_calls: int | None = None

    single_model_requests: int = 0
    agent_provider_calls: int = 0
    agent_attempts: int = 0
    reviewer_calls: int = 0
    quality_repair_calls: int = 0

    time_to_first_committed_step_ms: int | None = None
    time_to_first_quality_decision_ms: int | None = None
    time_to_first_valid_candidate_ms: int | None = None
    time_to_final_result_ms: int | None = None
