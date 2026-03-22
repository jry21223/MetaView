from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path

SCRIPT_PATH = (
    Path(__file__).resolve().parents[3]
    / "skills"
    / "generate-subject-manim-prompts"
    / "scripts"
    / "generate_custom_subject_prompt_with_llm.py"
)


def load_script_module():
    spec = spec_from_file_location("generate_custom_subject_prompt_with_llm", SCRIPT_PATH)
    if spec is None or spec.loader is None:
        raise AssertionError("无法加载 generate_custom_subject_prompt_with_llm.py")
    module = module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_custom_subject_script_build_user_prompt_contains_runtime_context() -> None:
    module = load_script_module()

    prompt = module.build_user_prompt(
        "Transport Phenomena",
        summary="围绕传热、传质与动量传递的教学动画。",
        notes="强调守恒量、边界条件和通量方向。",
    )

    assert "router -> planner -> coder -> critic -> repair" in prompt
    assert "new subject tool" in prompt.lower()
    assert "Transport Phenomena" in prompt
    assert "守恒量" in prompt


def test_custom_subject_script_validation_accepts_valid_output() -> None:
    module = load_script_module()
    markdown = """
    # Transport Phenomena Prompt Guidance

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

    validated = module.validate_custom_subject_markdown("Transport Phenomena", markdown)

    assert validated.startswith("# Transport Phenomena Prompt Guidance")
