from __future__ import annotations

from app.application.use_cases.follow_up import _build_system_prompt


def test_followup_prompt_guides_students_without_direct_homework_answers() -> None:
    prompt = _build_system_prompt()

    assert "引导学生" in prompt
    assert "不要直接给出作业答案" in prompt
    assert "一次只问一个问题" in prompt
    assert "patch 必须是空数组 []" in prompt
