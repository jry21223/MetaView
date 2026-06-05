from types import SimpleNamespace

from app.domain.models.cir import CirDocument
from app.domain.models.review import CirReviewIssue, ReviewSeverity
from app.domain.services.skill_eval import metrics_from_cir, metrics_from_parse_result


def _physics_scene_formula_cir() -> CirDocument:
    return CirDocument.model_validate({
        "version": "0.1.0",
        "title": "斜面受力",
        "domain": "physics",
        "summary": "解释斜面上的力和加速度。",
        "steps": [
            {
                "id": "step_01",
                "title": "画出斜面",
                "narration": ["先把斜面画出来。", "这样你能看到物体在哪里。"],
                "visual_kind": "scene",
                "scene": {"segments": [{"x0": 0, "y0": 0, "x1": 4, "y1": 2}]},
            },
            {
                "id": "step_02",
                "title": "标出重力",
                "narration": "重力竖直向下，所以我们用箭头标出来。",
                "visual_kind": "scene",
                "scene": {
                    "segments": [
                        {"x0": 2, "y0": 1, "x1": 2, "y1": -1, "arrow": True}
                    ]
                },
            },
            {
                "id": "step_03",
                "title": "分解力",
                "narration": "沿斜面方向的分力决定加速度。",
                "visual_kind": "scene",
                "scene": {
                    "segments": [
                        {"x0": 2, "y0": 1, "x1": 3, "y1": 0.5, "arrow": True}
                    ]
                },
            },
            {
                "id": "step_04",
                "title": "列出公式",
                "narration": "最后用牛顿第二定律把分力和加速度连起来。",
                "visual_kind": "formula",
                "plot": {"formula_latex": "ma = mg\\sin\\theta - f"},
                "annotations": ["沿斜面方向列方程"],
            },
        ],
    })


def _array_heavy_cir() -> CirDocument:
    return CirDocument.model_validate({
        "version": "0.1.0",
        "title": "列表比较",
        "domain": "algorithm",
        "summary": "数组步骤。",
        "steps": [
            {
                "id": "step_01",
                "title": "看第一个元素",
                "narration": "先看第一个元素。",
                "visual_kind": "array",
                "tokens": [{"id": "t0", "label": "1"}],
            },
            {
                "id": "step_02",
                "title": "看第二个元素",
                "narration": "再看第二个元素。",
                "visual_kind": "array",
                "tokens": [{"id": "t0", "label": "1"}, {"id": "t1", "label": "2"}],
            },
        ],
    })


def test_metrics_describe_scene_formula_output_shape() -> None:
    cir = _physics_scene_formula_cir()

    metrics = metrics_from_cir(cir)

    assert metrics.domain == "physics"
    assert metrics.visual_kind_counts["scene"] == 3
    assert metrics.visual_kind_counts["formula"] == 1
    assert metrics.has_scene is True
    assert metrics.has_formula is True
    assert metrics.step_count == len(cir.steps)
    assert metrics.narration_total_chars > 0


def test_metrics_describe_array_heavy_output_shape() -> None:
    metrics = metrics_from_cir(_array_heavy_cir())

    assert metrics.visual_kind_counts["array"] == 2
    assert metrics.has_array is True
    assert metrics.has_scene is False
    assert metrics.has_formula is False


def test_metrics_count_validation_issues() -> None:
    issues = [
        CirReviewIssue(
            code="x",
            severity=ReviewSeverity.ERROR,
            path="cir",
            message="bad",
        ),
        CirReviewIssue(
            code="y",
            severity=ReviewSeverity.WARNING,
            path="cir",
            message="warn",
        ),
    ]

    metrics = metrics_from_cir(None, parse_ok=False, issues=issues)

    assert metrics.parse_ok is False
    assert metrics.validation_error_count == 1
    assert metrics.validation_warning_count == 1


def test_metrics_from_parse_result_uses_duck_typed_parse_result() -> None:
    cir = _array_heavy_cir()
    parsed = SimpleNamespace(ok=True, cir=cir, execution_map=None, issues=[])

    metrics = metrics_from_parse_result(parsed, "show a list")

    assert metrics.parse_ok is True
    assert metrics.step_count == len(cir.steps)
