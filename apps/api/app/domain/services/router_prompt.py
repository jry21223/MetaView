from __future__ import annotations

import json

from app.domain.skills.base import SkillManifest, SkillRouteInput, SkillRouteMatch


def build_router_prompt(
    *,
    request: SkillRouteInput,
    manifests: list[SkillManifest],
) -> tuple[str, str]:
    manifest_json = json.dumps(
        [manifest.model_dump(mode="json") for manifest in manifests],
        ensure_ascii=False,
        indent=2,
    )
    schema_json = json.dumps(SkillRouteMatch.model_json_schema(), ensure_ascii=False, indent=2)
    source_section = ""
    if request.source_code and request.source_code.strip():
        source_section = f"""
Source code language: {request.language or "unknown"}
Source code:
```{request.language or ""}
{request.source_code}
```
"""

    system = """You are MetaView's skill router.
You receive:
- user prompt
- available skill manifests
- source code/language if any
Return JSON only.

Your job:
- choose whether a registered skill can handle this prompt
- optionally return a problem_spec matching that skill's output schema
- never solve the final answer
- if no skill fits, return null

Rules:
- Do not assume the only skill is solid_geometry. The skill list is dynamic.
- Use only capabilities declared in the provided skill manifests.
- Prefer null over forcing a weak skill match.
- If a skill looks relevant but needs better structured input, set needs_refinement=true.
- Never include keys named answer, final_answer, answer_latex, answer_numeric, or solution.
- Return either null or one JSON object matching the SkillRouteMatch schema."""

    user = f"""Skill manifests:
{manifest_json}

SkillRouteMatch JSON schema:
{schema_json}

User prompt:
{request.prompt}
{source_section}
Return SkillRouteMatch JSON or null only."""
    return system, user
