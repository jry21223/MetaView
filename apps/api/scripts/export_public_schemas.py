from __future__ import annotations

import json
from pathlib import Path

from app.domain.models.coverage import CoverageDecision
from app.domain.models.lesson_plan import LessonPlan
from app.domain.models.skill_recipe import SkillRecipe

ROOT = Path(__file__).resolve().parents[3]
SCHEMA_ROOT = ROOT / "apps" / "web" / "public" / "schemas"
SCHEMAS = {
    "coverage-decision.schema.json": CoverageDecision,
    "lesson-plan.schema.json": LessonPlan,
    "skill-recipe.schema.json": SkillRecipe,
}


def main() -> None:
    for filename, model in SCHEMAS.items():
        path = SCHEMA_ROOT / filename
        payload = json.dumps(
            model.model_json_schema(),
            ensure_ascii=False,
            indent=2,
        )
        path.write_text(f"{payload}\n", encoding="utf-8")


if __name__ == "__main__":
    main()
