from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path

import pytest

SCRIPT_PATH = (
    Path(__file__).resolve().parents[3]
    / "skills"
    / "generate-subject-manim-prompts"
    / "scripts"
    / "generate_reference_with_llm.py"
)


def load_script_module():
    spec = spec_from_file_location("generate_reference_with_llm", SCRIPT_PATH)
    if spec is None or spec.loader is None:
        raise AssertionError("无法加载 generate_reference_with_llm.py")
    module = module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_validate_reference_markdown_accepts_valid_output() -> None:
    module = load_script_module()
    markdown = """
    # Algorithm Prompt Guidance

    ## Common
    - one
    - two
    - three
    - four

    ## Planner
    - one
    - two
    - three
    - four

    ## Coder
    - one
    - two
    - three
    - four

    ## Critic
    - one
    - two
    - three
    - four

    ## Repair
    - one
    - two
    - three
    - four
    """

    validated = module.validate_reference_markdown("algorithm", markdown)

    assert validated.startswith("# Algorithm Prompt Guidance")


def test_validate_reference_markdown_rejects_wrong_headings() -> None:
    module = load_script_module()
    markdown = """
    # Algorithm Prompt Guidance

    ## Common
    - one
    - two
    - three
    - four

    ## Planner
    - one
    - two
    - three
    - four

    ## Review
    - one
    - two
    - three
    - four
    """

    with pytest.raises(ValueError, match="二级标题"):
        module.validate_reference_markdown("algorithm", markdown)


def test_build_user_prompt_contains_runtime_context_and_seed() -> None:
    module = load_script_module()

    prompt = module.build_user_prompt("algorithm", "更强调循环不变量。")

    assert "router -> planner -> coder -> critic -> repair" in prompt
    assert "Non-negotiable domain truth" in prompt
    assert "exact control flow and update order" in prompt
    assert "更强调循环不变量" in prompt
