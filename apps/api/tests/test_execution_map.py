from app.schemas import CirDocument, CirStep, PipelineRequest, TopicDomain, VisualKind
from app.services.execution_map import build_execution_map


def test_build_execution_map_from_source_code() -> None:
    request = PipelineRequest(
        prompt="请讲解二分查找。",
        domain=TopicDomain.CODE,
        provider="mock",
        source_code=(
            "nums = [1, 3, 5, 7, 9]\n"
            "target = 7\n"
            "\n"
            "def binary_search(nums, target):\n"
            "    left = 0\n"
            "    right = len(nums) - 1\n"
            "    while left <= right:\n"
            "        mid = (left + right) // 2\n"
            "        if nums[mid] == target:\n"
            "            return mid\n"
            "        if nums[mid] < target:\n"
            "            left = mid + 1\n"
            "        else:\n"
            "            right = mid - 1\n"
            "    return -1\n"
        ),
        source_code_language="python",
    )
    cir = CirDocument(
        title="二分查找",
        domain=TopicDomain.CODE,
        summary="用窗口收缩快速定位目标。",
        steps=[
            CirStep(
                id="step-1",
                title="初始化搜索窗口",
                narration="先把左右边界放到数组两端。",
                visual_kind=VisualKind.ARRAY,
            ),
            CirStep(
                id="step-2",
                title="比较中点并决定分支",
                narration="查看中点元素，并判断目标在左侧还是右侧。",
                visual_kind=VisualKind.ARRAY,
            ),
            CirStep(
                id="step-3",
                title="满足条件后返回答案",
                narration="命中后返回下标，没有命中则返回 -1。",
                visual_kind=VisualKind.TEXT,
            ),
        ],
    )

    execution_map = build_execution_map(
        request=request,
        cir=cir,
        render_backend="storyboard-fallback",
    )

    assert execution_map is not None
    assert execution_map.duration_s == 9.667
    assert len(execution_map.checkpoints) == 3
    assert execution_map.checkpoints[0].code_lines
    assert execution_map.array_track is not None
    assert execution_map.array_track.values == ["1", "3", "5", "7", "9"]
    assert execution_map.checkpoints[0].array_focus_indices
    assert execution_map.checkpoints[1].array_reference_indices
    assert execution_map.checkpoints[1].breakpoint is True
    assert any(control.id == "nums" for control in execution_map.parameter_controls)
    assert any(control.id.lower() == "target" for control in execution_map.parameter_controls)


def test_build_execution_map_skips_non_code_domains() -> None:
    request = PipelineRequest(
        prompt="讲解抛物线。",
        domain=TopicDomain.MATH,
        provider="mock",
        source_code="x = 1",
        source_code_language="python",
    )
    cir = CirDocument(
        title="抛物线",
        domain=TopicDomain.MATH,
        summary="摘要",
        steps=[
            CirStep(
                id="step-1",
                title="引入",
                narration="说明抛物线。",
                visual_kind=VisualKind.FORMULA,
            )
        ],
    )

    assert build_execution_map(request=request, cir=cir, render_backend=None) is None
