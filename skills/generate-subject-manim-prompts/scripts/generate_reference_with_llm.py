#!/usr/bin/env python3
"""Generate or refine a subject reference file with an OpenAI-compatible LLM."""

from __future__ import annotations

import argparse
import json
import re
import sys
from textwrap import dedent
from pathlib import Path
from typing import Any

import httpx

REQUIRED_SECTIONS = ("Common", "Planner", "Coder", "Critic", "Repair")

SUBJECT_DETAILS: dict[str, dict[str, str]] = {
    "algorithm": {
        "title": "Algorithm Prompt Guidance",
        "core_objects": "array cells, pointers, queue/stack, visited set, DP table",
        "key_relations": "indices, invariants, loop condition, state transition",
        "non_negotiable_truth": "exact control flow and update order",
        "critical_transitions": "compare, swap, overwrite, boundary move, push/pop, return",
        "domain_logic_error": "visual order differs from code order",
    },
    "math": {
        "title": "Math Prompt Guidance",
        "core_objects": "symbols, axes, geometric entities, shaded regions",
        "key_relations": "notation definitions, variable dependencies, equation continuity",
        "non_negotiable_truth": "symbolic correctness and consistent notation",
        "critical_transitions": "formula transform, graph update, geometric dependency change",
        "domain_logic_error": "transformed formula not equivalent to previous one",
    },
    "code": {
        "title": "Code Prompt Guidance",
        "core_objects": "source lines, variables, data structures, call stack",
        "key_relations": "control flow, mutation order, termination path",
        "non_negotiable_truth": "source code is ground truth",
        "critical_transitions": "highlighted line change, variable mutation, recursive call/return",
        "domain_logic_error": "animation invents behavior not present in code",
    },
    "physics": {
        "title": "Physics Prompt Guidance",
        "core_objects": "bodies, forces, vectors, reference frame, known quantities",
        "key_relations": "constraints, units, direction, governing laws",
        "non_negotiable_truth": "physical model before motion",
        "critical_transitions": "force decomposition, motion update, energy/current/field change",
        "domain_logic_error": "direction, sign, or unit inconsistency",
    },
    "chemistry": {
        "title": "Chemistry Prompt Guidance",
        "core_objects": "atoms, bonds, charges, phases, reagents/products",
        "key_relations": "bond changes, stoichiometry, electron/charge balance",
        "non_negotiable_truth": "species identity and bond logic",
        "critical_transitions": "bond break/form, intermediate formation, rearrangement",
        "domain_logic_error": "impossible valence or charge inconsistency",
    },
    "biology": {
        "title": "Biology Prompt Guidance",
        "core_objects": "organelles, cells, tissues, molecules, populations",
        "key_relations": "scale, stage order, causal regulation",
        "non_negotiable_truth": "biological level and process order",
        "critical_transitions": "stage switch, signal flow, division/expression/metabolism",
        "domain_logic_error": "mixing scales without explanation",
    },
    "geography": {
        "title": "Geography Prompt Guidance",
        "core_objects": "map, regions, arrows, climate bands, plates, flows",
        "key_relations": "orientation, legend, time anchor, regional contrast",
        "non_negotiable_truth": "fixed map frame before change over time",
        "critical_transitions": "migration, circulation, tectonic movement, rainfall/temperature shift",
        "domain_logic_error": "map direction or regional labeling inconsistency",
    },
}


def repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def references_root() -> Path:
    return repo_root() / "skills" / "generate-subject-manim-prompts" / "references"


def subject_output_path(subject: str) -> Path:
    return references_root() / f"{subject}.md"


def load_current_reference(subject: str) -> str:
    path = subject_output_path(subject)
    if not path.is_file():
        return ""
    return path.read_text(encoding="utf-8").strip()


def load_runtime_context() -> str:
    return dedent(
        """
    Runtime context you must respect:
    - The production pipeline is staged: router -> planner -> coder -> critic -> repair.
    - Subject reference files are loaded by stage and only inject `## Common` plus the active stage section.
    - Global runtime rules already cover output contracts, Simplified Chinese explanatory text,
      no text/object overlap, and theme-aligned backgrounds.
    - Do not duplicate generic JSON-output requirements, markdown-fence rules, or broad Manim boilerplate.
    - The goal of this file is subject truth and stage-specific guidance, not provider protocol instructions.
        """
    ).strip()


def build_system_prompt() -> str:
    return dedent(
        """
    You are a senior prompt engineer for a staged educational animation runtime.

    Your job is to write one complete markdown reference file for a single subject.
    This file is consumed by a backend that separately assembles planner, coder, critic,
    and repair prompts for Python Manim generation.

    Return only markdown.
    Do not wrap the file in code fences.
    Do not add explanations before or after the file.

    The file must use exactly this top-level structure:
    # <Subject> Prompt Guidance

    ## Common
    - ...

    ## Planner
    - ...

    ## Coder
    - ...

    ## Critic
    - ...

    ## Repair
    - ...

    Writing rules:
    - Keep each section to 4-8 bullet points.
    - Keep bullets short, specific, and operational.
    - `Common` contains domain truths that must not be violated.
    - `Planner` contains scene decomposition, example choice, and risk discovery rules.
    - `Coder` contains layout, object identity, pacing, and synchronization rules.
    - `Critic` contains failure checks and regression checks.
    - `Repair` contains minimum-change repair strategy.
    - Remove redundant generic advice that belongs in shared runtime rules.
    - Prefer domain truth over style language.
    - Do not mention JSON keys, API protocols, provider names, or chat formatting.
        """
    ).strip()


def build_user_prompt(subject: str, notes: str | None = None) -> str:
    details = SUBJECT_DETAILS[subject]
    current_reference = load_current_reference(subject) or "(empty)"
    extra_notes = notes.strip() if notes else "None"
    return "\n".join(
        [
            f"Subject: {subject}",
            f"File title: {details['title']}",
            "",
            "Domain seed:",
            f"- Core objects: {details['core_objects']}",
            f"- Key relations: {details['key_relations']}",
            f"- Non-negotiable domain truth: {details['non_negotiable_truth']}",
            f"- Critical transitions: {details['critical_transitions']}",
            f"- Domain logic error to prevent: {details['domain_logic_error']}",
            "",
            load_runtime_context(),
            "",
            "Additional authoring notes:",
            extra_notes,
            "",
            "Current reference file to refine or replace:",
            current_reference,
            "",
            "Produce a stronger replacement file for this subject.",
            "Focus on subject fidelity and stage-specific usefulness.",
            "Keep it concise.",
        ]
    ).strip()


def strip_code_fences(text: str) -> str:
    stripped = dedent(text).strip()
    fenced = re.search(r"```(?:markdown|md)?\s*\n(?P<body>.*)\n```", stripped, re.DOTALL)
    if fenced:
        return fenced.group("body").strip()
    return stripped


def validate_reference_markdown(subject: str, markdown: str) -> str:
    normalized = strip_code_fences(markdown).strip()
    expected_title = f"# {SUBJECT_DETAILS[subject]['title']}"
    if not normalized.startswith(expected_title):
        raise ValueError(f"输出缺少正确标题，预期以 `{expected_title}` 开头。")

    headings = re.findall(r"^##\s+(.+?)\s*$", normalized, flags=re.MULTILINE)
    if tuple(headings) != REQUIRED_SECTIONS:
        raise ValueError(
            "输出的二级标题不符合要求。"
            f" 当前为 {headings}，预期为 {list(REQUIRED_SECTIONS)}。"
        )

    for section in REQUIRED_SECTIONS:
        body = extract_markdown_section(normalized, section)
        bullets = [line for line in body.splitlines() if line.strip().startswith("- ")]
        if len(bullets) < 4:
            raise ValueError(f"`## {section}` 至少需要 4 条 bullet。")
    return normalized


def extract_markdown_section(text: str, title: str) -> str:
    pattern = re.compile(
        rf"^## {re.escape(title)}\s*$\n(?P<body>.*?)(?=^## |\Z)",
        flags=re.MULTILINE | re.DOTALL,
    )
    match = pattern.search(text)
    if not match:
        return ""
    return match.group("body").strip()


def extract_text_content(payload: dict[str, Any]) -> str:
    try:
        content = payload["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise RuntimeError("模型响应缺少 `choices[0].message.content`。") from exc

    if isinstance(content, list):
        chunks = [
            item.get("text", "")
            for item in content
            if isinstance(item, dict) and item.get("type") == "text"
        ]
        content = "\n".join(chunk for chunk in chunks if chunk)

    if not isinstance(content, str):
        raise RuntimeError("模型返回的 content 不是字符串。")
    return content


def post_chat_completion(
    *,
    base_url: str,
    api_key: str,
    model: str,
    system_prompt: str,
    user_prompt: str,
    temperature: float,
    timeout_s: float | None,
) -> dict[str, Any]:
    endpoint = f"{base_url.rstrip('/')}/chat/completions"
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    request_body = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": temperature,
    }

    last_error: Exception | None = None
    for trust_env in (True, False):
        try:
            response = httpx.post(
                endpoint,
                headers=headers,
                json=request_body,
                timeout=timeout_s,
                follow_redirects=True,
                trust_env=trust_env,
            )
            response.raise_for_status()
            return response.json()
        except (httpx.ConnectError, httpx.RemoteProtocolError) as exc:
            last_error = exc
            continue
        except httpx.TimeoutException as exc:
            raise RuntimeError(f"请求模型超时：{exc}") from exc
        except httpx.HTTPStatusError as exc:
            excerpt = " ".join(exc.response.text.split())[:1200]
            raise RuntimeError(
                f"模型请求失败，HTTP {exc.response.status_code}。响应片段：{excerpt}"
            ) from exc
        except json.JSONDecodeError as exc:
            raise RuntimeError("模型响应不是合法 JSON。") from exc
    raise RuntimeError(f"连接模型失败：{last_error}")


def load_runtime_defaults() -> dict[str, Any]:
    api_root = repo_root() / "apps" / "api"
    if str(api_root) not in sys.path:
        sys.path.insert(0, str(api_root))

    from app.config import Settings  # noqa: PLC0415

    settings = Settings(_env_file=repo_root() / ".env")
    return {
        "base_url": settings.openai_base_url,
        "api_key": settings.openai_api_key or "",
        "model": settings.openai_planning_model or settings.openai_model or "",
        "timeout_s": settings.openai_timeout_s,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate a staged subject reference markdown file with an OpenAI-compatible LLM.",
    )
    parser.add_argument(
        "--subject",
        required=True,
        choices=sorted(SUBJECT_DETAILS),
        help="要生成的学科。",
    )
    parser.add_argument("--notes", default="", help="补充要求，会并入用户提示词。")
    parser.add_argument("--base-url", default="", help="覆盖 OpenAI-compatible base URL。")
    parser.add_argument("--api-key", default="", help="覆盖 API Key。")
    parser.add_argument("--model", default="", help="覆盖模型名。")
    parser.add_argument("--temperature", type=float, default=0.2, help="采样温度。")
    parser.add_argument("--timeout-s", type=float, default=None, help="请求超时秒数。")
    parser.add_argument(
        "--output",
        default="",
        help="输出路径；默认指向该学科 reference 文件。",
    )
    parser.add_argument(
        "--write",
        action="store_true",
        help="将验证通过后的结果写回文件；默认只打印到 stdout。",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="不调用模型，只打印 system/user prompt 和目标输出路径。",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    defaults = load_runtime_defaults()

    base_url = (args.base_url or defaults["base_url"]).strip()
    api_key = (args.api_key or defaults["api_key"]).strip()
    model = (args.model or defaults["model"]).strip()
    timeout_s = args.timeout_s if args.timeout_s is not None else defaults["timeout_s"]

    output_path = Path(args.output).expanduser() if args.output else subject_output_path(args.subject)
    system_prompt = build_system_prompt()
    user_prompt = build_user_prompt(args.subject, args.notes)

    if args.dry_run:
        print("=== output_path ===")
        print(output_path)
        print("\n=== system_prompt ===")
        print(system_prompt)
        print("\n=== user_prompt ===")
        print(user_prompt)
        return

    if not base_url:
        raise SystemExit("缺少 base_url。请设置 --base-url 或 ALGO_VIS_OPENAI_BASE_URL。")
    if not model:
        raise SystemExit("缺少 model。请设置 --model 或 ALGO_VIS_OPENAI_MODEL。")
    if not api_key:
        raise SystemExit("缺少 api_key。请设置 --api-key 或 ALGO_VIS_OPENAI_API_KEY。")

    payload = post_chat_completion(
        base_url=base_url,
        api_key=api_key,
        model=model,
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        temperature=args.temperature,
        timeout_s=timeout_s,
    )
    content = extract_text_content(payload)
    validated = validate_reference_markdown(args.subject, content)

    if args.write:
        output_path.write_text(validated + "\n", encoding="utf-8")
        print(f"已写入 {output_path}")
        return

    print(validated)


if __name__ == "__main__":
    main()
