from __future__ import annotations

import argparse
import asyncio
import json
import sys
from dataclasses import asdict
from pathlib import Path
from typing import Any

API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))

from app.application.use_cases.run_pipeline import (  # noqa: E402
    _strip_markdown_fences,
    try_parse_combined_output,
)
from app.config import Settings  # noqa: E402
from app.domain.models.topic import TopicDomain  # noqa: E402
from app.domain.services.cir_prompt import build_cir_prompt  # noqa: E402
from app.domain.services.domain_router import SkillMode  # noqa: E402
from app.domain.services.skill_eval import metrics_from_parse_result  # noqa: E402
from app.infrastructure.llm.openai_provider import OpenAIProvider  # noqa: E402


def metrics_payload_from_raw(raw: str, prompt: str) -> dict[str, Any]:
    parsed = try_parse_combined_output(_strip_markdown_fences(raw))
    return asdict(metrics_from_parse_result(parsed, prompt))


def parsed_summary_from_raw(raw: str, prompt: str) -> dict[str, Any]:
    parsed = try_parse_combined_output(_strip_markdown_fences(raw))
    metrics = metrics_from_parse_result(parsed, prompt)
    cir = parsed.cir
    return {
        "parse_ok": metrics.parse_ok,
        "title": cir.title if cir else None,
        "domain": metrics.domain,
        "step_count": metrics.step_count,
        "visual_kind_counts": metrics.visual_kind_counts,
        "validation_error_count": metrics.validation_error_count,
        "validation_warning_count": metrics.validation_warning_count,
    }


def compare_metrics(
    specialized_metrics: dict[str, Any],
    generic_metrics: dict[str, Any],
) -> dict[str, Any]:
    specialized_counts = specialized_metrics.get("visual_kind_counts", {})
    generic_counts = generic_metrics.get("visual_kind_counts", {})
    visual_kinds = sorted(set(specialized_counts) | set(generic_counts))
    return {
        "domain_changed": specialized_metrics.get("domain") != generic_metrics.get("domain"),
        "step_count_delta": (
            generic_metrics.get("step_count", 0) - specialized_metrics.get("step_count", 0)
        ),
        "visual_kind_count_delta": {
            kind: generic_counts.get(kind, 0) - specialized_counts.get(kind, 0)
            for kind in visual_kinds
        },
    }


async def run_eval(args: argparse.Namespace) -> dict[str, Any]:
    domain = TopicDomain(args.domain.lower())
    settings = Settings()
    api_key = args.api_key or settings.openai_api_key
    if not api_key:
        raise SystemExit("Set METAVIEW_OPENAI_API_KEY or pass --api-key to run real eval.")

    provider = OpenAIProvider(
        api_key=api_key,
        base_url=args.base_url or settings.openai_base_url,
        model=args.model or settings.openai_model or "gpt-4o-mini",
        timeout=settings.openai_timeout_s,
        max_tokens=settings.openai_max_tokens,
        reasoning_effort=settings.openai_reasoning_effort,
    )

    specialized_system, specialized_user = build_cir_prompt(
        args.prompt,
        domain,
        skill_mode=SkillMode.SPECIALIZED,
    )
    generic_system, generic_user = build_cir_prompt(
        args.prompt,
        None,
        skill_mode=SkillMode.GENERIC,
    )

    specialized_raw, generic_raw = await asyncio.gather(
        provider.complete(specialized_system, specialized_user),
        provider.complete(generic_system, generic_user),
    )
    specialized_metrics = metrics_payload_from_raw(specialized_raw, args.prompt)
    generic_metrics = metrics_payload_from_raw(generic_raw, args.prompt)

    return {
        "prompt": args.prompt,
        "domain": domain.value,
        "specialized": {
            "system": specialized_system,
            "user": specialized_user,
            "raw": specialized_raw,
            "parsed_summary": parsed_summary_from_raw(specialized_raw, args.prompt),
            "metrics": specialized_metrics,
        },
        "generic": {
            "system": generic_system,
            "user": generic_user,
            "raw": generic_raw,
            "parsed_summary": parsed_summary_from_raw(generic_raw, args.prompt),
            "metrics": generic_metrics,
        },
        "comparison": compare_metrics(specialized_metrics, generic_metrics),
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Compare specialized vs generic skill prompts with a real LLM.",
    )
    parser.add_argument("--prompt", required=True)
    parser.add_argument("--domain", required=True, choices=[domain.value for domain in TopicDomain])
    parser.add_argument("--out", required=True)
    parser.add_argument("--api-key", default=None)
    parser.add_argument("--base-url", default=None)
    parser.add_argument("--model", default=None)
    return parser


def main() -> None:
    args = build_parser().parse_args()
    result = asyncio.run(run_eval(args))
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(str(out_path))


if __name__ == "__main__":
    main()
