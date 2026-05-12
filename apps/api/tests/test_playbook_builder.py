"""Tests for the deterministic CIR → PlaybookScript mapping."""
from app.domain.models.cir import (
    CirDocument,
    CirStep,
    ExecutionArrayTrack,
    ExecutionCheckpoint,
    ExecutionMap,
    VisualToken,
)
from app.domain.models.playbook import (
    AlgorithmArraySnapshot,
    AlgorithmBarsSnapshot,
    AlgorithmTreeSnapshot,
)
from app.domain.models.topic import TopicDomain, VisualKind
from app.domain.services.playbook_builder import _parse_narration_template, build_playbook


def _make_array_cir() -> CirDocument:
    return CirDocument(
        title="冒泡排序",
        domain=TopicDomain.ALGORITHM,
        summary="演示冒泡排序的比较交换过程",
        steps=[
            CirStep(
                id="step-1",
                title="初始数组",
                narration="原始数组为 [5, 3, 1, 4, 2]",
                visual_kind=VisualKind.ARRAY,
                tokens=[
                    VisualToken(id="t0", label="5"),
                    VisualToken(id="t1", label="3"),
                    VisualToken(id="t2", label="1"),
                    VisualToken(id="t3", label="4"),
                    VisualToken(id="t4", label="2"),
                ],
            ),
            CirStep(
                id="step-2",
                title="第一次比较",
                narration="比较 5 和 3，5 > 3，发生交换",
                visual_kind=VisualKind.ARRAY,
                tokens=[
                    VisualToken(id="t0", label="3"),
                    VisualToken(id="t1", label="5"),
                    VisualToken(id="t2", label="1"),
                    VisualToken(id="t3", label="4"),
                    VisualToken(id="t4", label="2"),
                ],
            ),
            CirStep(
                id="step-3",
                title="排序完成",
                narration="数组已完全排序",
                visual_kind=VisualKind.ARRAY,
                tokens=[
                    VisualToken(id="t0", label="1", emphasis="accent"),
                    VisualToken(id="t1", label="2", emphasis="accent"),
                    VisualToken(id="t2", label="3", emphasis="accent"),
                    VisualToken(id="t3", label="4", emphasis="accent"),
                    VisualToken(id="t4", label="5", emphasis="accent"),
                ],
            ),
        ],
    )


def _make_tree_cir() -> CirDocument:
    return CirDocument(
        title="二叉树中序遍历",
        domain=TopicDomain.ALGORITHM,
        summary="演示中序遍历",
        steps=[
            CirStep(
                id="step-1",
                title="访问根节点",
                narration="从根节点开始",
                visual_kind=VisualKind.GRAPH,
                tokens=[
                    VisualToken(id="root", label="4"),
                    VisualToken(id="left", label="2", value="parent:root"),
                    VisualToken(id="right", label="6", value="parent:root"),
                ],
            ),
        ],
    )


def _make_execution_map(cir: CirDocument) -> ExecutionMap:
    checkpoints = []
    for i, step in enumerate(cir.steps):
        checkpoints.append(
            ExecutionCheckpoint(
                id=f"cp-{i}",
                step_index=i,
                step_id=step.id,
                visual_kind=step.visual_kind,
                title=step.title,
                summary=step.narration,
                start_s=float(i * 2),
                end_s=float((i + 1) * 2),
                array_focus_indices=[0, 1] if i == 1 else [],
            )
        )
    return ExecutionMap(
        duration_s=float(len(cir.steps) * 2),
        checkpoints=checkpoints,
        array_track=ExecutionArrayTrack(
            id="arr",
            label="array",
            values=["5", "3", "1", "4", "2"],
        ),
        step_to_checkpoint={cp.step_id: cp.id for cp in checkpoints},
        line_to_step_ids={},
    )


class TestBuildPlaybook:
    def test_basic_structure(self):
        cir = _make_array_cir()
        playbook = build_playbook(cir, execution_map=None)

        assert playbook.fps == 30
        assert playbook.total_frames > 0
        assert playbook.domain == TopicDomain.ALGORITHM
        assert playbook.title == "冒泡排序"
        assert len(playbook.steps) == 3

    def test_end_frame_is_cumulative(self):
        cir = _make_array_cir()
        playbook = build_playbook(cir, execution_map=None)

        # Each step's end_frame should be strictly increasing
        frames = [s.end_frame for s in playbook.steps]
        assert frames == sorted(frames)
        assert frames[0] > 0

    def test_total_frames_equals_last_end_frame(self):
        cir = _make_array_cir()
        playbook = build_playbook(cir, execution_map=None)

        assert playbook.total_frames == playbook.steps[-1].end_frame

    def test_numeric_array_renders_as_bars(self):
        cir = _make_array_cir()
        playbook = build_playbook(cir, execution_map=None)

        for step in playbook.steps:
            assert isinstance(step.snapshot, AlgorithmBarsSnapshot)
            assert step.snapshot.kind == "algorithm_bars"

        first = playbook.steps[0].snapshot
        assert isinstance(first, AlgorithmBarsSnapshot)
        assert first.numeric_values == [5.0, 3.0, 1.0, 4.0, 2.0]

    def test_non_numeric_array_stays_as_cells(self):
        cir = CirDocument(
            title="字符串数组",
            domain=TopicDomain.ALGORITHM,
            summary="非数值元素",
            steps=[
                CirStep(
                    id="s1",
                    title="初始",
                    narration="字符串数组",
                    visual_kind=VisualKind.ARRAY,
                    tokens=[
                        VisualToken(id="t0", label="apple"),
                        VisualToken(id="t1", label="banana"),
                    ],
                )
            ],
        )
        playbook = build_playbook(cir, execution_map=None)
        snap = playbook.steps[0].snapshot
        assert isinstance(snap, AlgorithmArraySnapshot)
        assert snap.kind == "algorithm_array"

    def test_array_values_from_tokens(self):
        cir = _make_array_cir()
        playbook = build_playbook(cir, execution_map=None)

        assert playbook.steps[0].snapshot.array_values == ["5", "3", "1", "4", "2"]

    def test_sorted_indices_from_accent_tokens(self):
        cir = _make_array_cir()
        playbook = build_playbook(cir, execution_map=None)

        final_snap = playbook.steps[2].snapshot
        assert isinstance(final_snap, AlgorithmBarsSnapshot)
        assert sorted(final_snap.sorted_indices) == [0, 1, 2, 3, 4]

    def test_execution_map_timing_used(self):
        cir = _make_array_cir()
        em = _make_execution_map(cir)
        playbook = build_playbook(cir, execution_map=em)

        # Each step is 2 seconds = 60 frames at 30fps
        assert playbook.steps[0].end_frame == 60
        assert playbook.steps[1].end_frame == 120
        assert playbook.steps[2].end_frame == 180

    def test_execution_map_active_indices(self):
        cir = _make_array_cir()
        em = _make_execution_map(cir)
        playbook = build_playbook(cir, execution_map=em)

        step2 = playbook.steps[1]
        assert isinstance(step2.snapshot, AlgorithmBarsSnapshot)
        assert step2.snapshot.active_indices == [0, 1]

    def test_execution_map_array_track_values(self):
        cir = _make_array_cir()
        em = _make_execution_map(cir)
        playbook = build_playbook(cir, execution_map=em)

        # array_track values should override token labels
        for step in playbook.steps:
            assert isinstance(step.snapshot, AlgorithmBarsSnapshot)
            assert step.snapshot.array_values == ["5", "3", "1", "4", "2"]

    def test_tree_snapshot_type(self):
        cir = _make_tree_cir()
        playbook = build_playbook(cir, execution_map=None)

        assert len(playbook.steps) == 1
        step = playbook.steps[0]
        assert isinstance(step.snapshot, AlgorithmTreeSnapshot)
        assert step.snapshot.kind == "algorithm_tree"

    def test_tree_nodes_and_edges(self):
        cir = _make_tree_cir()
        playbook = build_playbook(cir, execution_map=None)

        snap = playbook.steps[0].snapshot
        assert isinstance(snap, AlgorithmTreeSnapshot)
        node_ids = {n["id"] for n in snap.nodes}
        assert node_ids == {"root", "left", "right"}
        # parent:root edges should be inferred
        assert len(snap.edges) == 2

    def test_voiceover_text_preserved(self):
        cir = _make_array_cir()
        playbook = build_playbook(cir, execution_map=None)

        assert playbook.steps[0].voiceover_text == "原始数组为 [5, 3, 1, 4, 2]"
        assert playbook.steps[1].voiceover_text == "比较 5 和 3，5 > 3，发生交换"

    def test_parameter_controls_passed_through(self):
        from app.domain.models.cir import ExecutionParameterControl
        cir = _make_array_cir()
        em = _make_execution_map(cir)
        em.parameter_controls = [
            ExecutionParameterControl(id="n", label="数组长度", value="5")
        ]
        playbook = build_playbook(cir, execution_map=em)

        assert len(playbook.parameter_controls) == 1
        assert playbook.parameter_controls[0].id == "n"

    def test_animation_hints_assigned(self):
        cir = _make_array_cir()
        playbook = build_playbook(cir, execution_map=None)

        assert playbook.steps[0].animation_hint == "enter"
        assert playbook.steps[-1].animation_hint == "reveal"

    def test_tokens_passed_through(self):
        cir = _make_array_cir()
        playbook = build_playbook(cir, execution_map=None)
        step = playbook.steps[0]
        assert step.tokens[0]["id"] == "t0"
        assert step.tokens[0]["label"] == "5"


class TestCodeHighlightOverlay:
    def _make_cir_with_source(self) -> CirDocument:
        cir = _make_array_cir()
        cir.steps[1].annotations = ["source:python\nfor i in range(n):\n    pass"]
        return cir

    def test_operation_label_equals_checkpoint_title(self):
        cir = _make_array_cir()
        execution_map = _make_execution_map(cir)
        # Inject code_lines so _build_code_highlight activates
        execution_map.checkpoints[0].code_lines = [0]
        playbook = build_playbook(
            cir,
            execution_map=execution_map,
            source_code="for i in range(n):\n    pass",
            source_language="python",
        )
        step = playbook.steps[0]
        assert step.code_highlight is not None
        assert step.code_highlight.operation_label == cir.steps[0].title

    def test_operation_label_none_when_no_checkpoint(self):
        cir = _make_array_cir()
        playbook = build_playbook(cir, execution_map=None)
        for step in playbook.steps:
            assert step.code_highlight is None


class TestEdgeCases:
    """Edge cases for build_playbook (issue #36).

    Covers branches that the happy-path tests above don't exercise.
    """

    def test_empty_cir_produces_empty_playbook(self):
        cir = CirDocument(
            title="空教学",
            domain=TopicDomain.ALGORITHM,
            summary="",
            steps=[],
        )
        playbook = build_playbook(cir, execution_map=None)

        assert playbook.steps == []
        # Avoid div-by-zero / negative durations downstream
        assert playbook.total_frames >= 1
        assert playbook.fps == 30

    def test_missing_execution_map_uses_default_duration(self):
        cir = _make_array_cir()
        playbook = build_playbook(cir, execution_map=None)

        # Default _DEFAULT_STEP_FRAMES = 60 (2 s @ 30 fps)
        assert playbook.steps[0].end_frame == 60
        assert playbook.steps[1].end_frame == 120
        assert playbook.steps[2].end_frame == 180
        assert playbook.parameter_controls == []
        assert playbook.initial_data == {}

    def test_zero_duration_checkpoint_falls_back_to_default(self):
        cir = _make_array_cir()
        em = _make_execution_map(cir)
        # Collapse the first checkpoint to zero duration
        em.checkpoints[0].start_s = 0.0
        em.checkpoints[0].end_s = 0.0
        playbook = build_playbook(cir, execution_map=em)

        # Zero-duration falls back to _DEFAULT_STEP_FRAMES (60), not 0
        assert playbook.steps[0].end_frame == 60

    def test_negative_duration_checkpoint_falls_back(self):
        cir = _make_array_cir()
        em = _make_execution_map(cir)
        em.checkpoints[0].start_s = 5.0
        em.checkpoints[0].end_s = 1.0  # negative span
        playbook = build_playbook(cir, execution_map=em)

        # Should not produce 0 or negative frame count
        assert playbook.steps[0].end_frame >= 1

    def test_user_source_overrides_library(self):
        cir = _make_array_cir()  # title triggers bubble_sort library
        em = _make_execution_map(cir)
        em.checkpoints[0].code_lines = [0]
        playbook = build_playbook(
            cir,
            execution_map=em,
            source_code="custom_line_one\ncustom_line_two",
            source_language="rust",
        )
        overlay = playbook.steps[0].code_highlight
        assert overlay is not None
        assert overlay.language == "rust"
        assert overlay.lines == ["custom_line_one", "custom_line_two"]

    def test_library_source_used_when_no_user_source(self):
        cir = _make_array_cir()
        em = _make_execution_map(cir)
        em.checkpoints[0].code_lines = [0]
        playbook = build_playbook(cir, execution_map=em)

        overlay = playbook.steps[0].code_highlight
        assert overlay is not None
        # Library should win since title matches bubble_sort and no user source supplied
        assert len(overlay.lines) > 0
        # algorithm_id propagates back to script
        assert playbook.algorithm_id == "bubble_sort"

    def test_execution_map_algorithm_code_used_when_no_library_match(self):
        cir = _make_array_cir()
        cir.title = "未知教学题目-不匹配任何关键字"  # avoid library match
        em = _make_execution_map(cir)
        em.checkpoints[0].code_lines = [0]
        em.algorithm_code = ["llm_generated_line_1", "llm_generated_line_2"]
        playbook = build_playbook(cir, execution_map=em)

        overlay = playbook.steps[0].code_highlight
        assert overlay is not None
        assert overlay.lines == ["llm_generated_line_1", "llm_generated_line_2"]
        # Falls back to "pseudocode" because algorithm_language is opportunistic
        assert overlay.language == "pseudocode"

    def test_out_of_range_code_lines_filtered(self):
        cir = _make_array_cir()
        em = _make_execution_map(cir)
        # source has 2 lines; checkpoint claims line 99 (LLM hallucination)
        em.checkpoints[0].code_lines = [99, 100]
        playbook = build_playbook(
            cir,
            execution_map=em,
            source_code="line0\nline1",
            source_language="python",
        )
        # All hallucinated lines filtered out → no overlay
        assert playbook.steps[0].code_highlight is None

    def test_out_of_range_mixed_with_valid_keeps_valid(self):
        cir = _make_array_cir()
        em = _make_execution_map(cir)
        em.checkpoints[0].code_lines = [0, 99, 1]  # 99 out of range
        playbook = build_playbook(
            cir,
            execution_map=em,
            source_code="line0\nline1",
            source_language="python",
        )
        overlay = playbook.steps[0].code_highlight
        assert overlay is not None
        assert overlay.active_lines == [0, 1]
        assert overlay.active_line == 0

    def test_negative_code_lines_filtered(self):
        cir = _make_array_cir()
        em = _make_execution_map(cir)
        em.checkpoints[0].code_lines = [-1, -5]
        playbook = build_playbook(
            cir,
            execution_map=em,
            source_code="line0\nline1",
            source_language="python",
        )
        assert playbook.steps[0].code_highlight is None

    def test_algorithm_id_inference_fallback_unmatched(self):
        cir = CirDocument(
            title="某种无人知道的算法 zzzzz",
            domain=TopicDomain.ALGORITHM,
            summary="",
            steps=[
                CirStep(
                    id="s1",
                    title="t",
                    narration="n",
                    visual_kind=VisualKind.ARRAY,
                    tokens=[VisualToken(id="t0", label="1")],
                )
            ],
        )
        playbook = build_playbook(cir, execution_map=None)
        assert playbook.algorithm_id is None

    def test_explicit_execution_map_algorithm_id_wins(self):
        cir = _make_array_cir()  # title would otherwise match bubble_sort
        em = _make_execution_map(cir)
        em.algorithm_id = "quick_sort"
        playbook = build_playbook(cir, execution_map=em)
        assert playbook.algorithm_id == "quick_sort"

    def test_edgeless_tree_produces_no_edges(self):
        cir = CirDocument(
            title="孤立节点",
            domain=TopicDomain.ALGORITHM,
            summary="",
            steps=[
                CirStep(
                    id="s1",
                    title="t",
                    narration="n",
                    visual_kind=VisualKind.GRAPH,
                    tokens=[
                        VisualToken(id="a", label="A"),
                        VisualToken(id="b", label="B"),
                        VisualToken(id="c", label="C"),
                    ],
                )
            ],
        )
        playbook = build_playbook(cir, execution_map=None)
        snap = playbook.steps[0].snapshot
        assert isinstance(snap, AlgorithmTreeSnapshot)
        assert len(snap.nodes) == 3
        assert snap.edges == []

    def test_explicit_edges_override_heuristic(self):
        from app.domain.models.cir import EdgeRef as CirEdge
        cir = CirDocument(
            title="explicit-edge",
            domain=TopicDomain.ALGORITHM,
            summary="",
            steps=[
                CirStep(
                    id="s1",
                    title="t",
                    narration="n",
                    visual_kind=VisualKind.GRAPH,
                    tokens=[
                        VisualToken(id="a", label="A"),
                        VisualToken(id="b", label="B", value="parent:a"),
                    ],
                    edges=[CirEdge(from_id="a", to_id="b")],
                )
            ],
        )
        playbook = build_playbook(cir, execution_map=None)
        snap = playbook.steps[0].snapshot
        assert isinstance(snap, AlgorithmTreeSnapshot)
        # Even though token has parent: hint, explicit edge list is preferred & deduplicated
        assert len(snap.edges) == 1
        assert snap.edges[0]["from_id"] == "a"

    def test_swap_inference_only_when_title_signals_swap(self):
        cir = _make_array_cir()
        em = _make_execution_map(cir)
        # Step 1 has 2 active indices but title is "第一次比较" → no swap
        em.checkpoints[1].title = "第一次比较"
        playbook = build_playbook(cir, execution_map=em)
        snap = playbook.steps[1].snapshot
        assert isinstance(snap, AlgorithmBarsSnapshot)
        assert snap.swap_indices == []

        # Same setup but title contains "swap" → swap_indices populated
        em.checkpoints[1].title = "swap A[0] and A[1]"
        playbook2 = build_playbook(cir, execution_map=em)
        snap2 = playbook2.steps[1].snapshot
        assert isinstance(snap2, AlgorithmBarsSnapshot)
        assert snap2.swap_indices == [0, 1]

    def test_explicit_swap_indices_used_directly(self):
        cir = _make_array_cir()
        em = _make_execution_map(cir)
        em.checkpoints[1].swap_indices = [2, 3]
        em.checkpoints[1].title = "neutral title"  # no swap keyword
        playbook = build_playbook(cir, execution_map=em)
        snap = playbook.steps[1].snapshot
        assert isinstance(snap, AlgorithmBarsSnapshot)
        assert snap.swap_indices == [2, 3]

    def test_single_step_animation_hint_is_reveal_not_enter(self):
        # When total == 1, the loop hits both `index == 0` and `index == total - 1`.
        # The first branch returns "enter" — verify the documented contract.
        cir = CirDocument(
            title="单步",
            domain=TopicDomain.ALGORITHM,
            summary="",
            steps=[
                CirStep(
                    id="only",
                    title="x",
                    narration="y",
                    visual_kind=VisualKind.ARRAY,
                    tokens=[VisualToken(id="t0", label="1")],
                )
            ],
        )
        playbook = build_playbook(cir, execution_map=None)
        assert playbook.steps[0].animation_hint == "enter"


class TestParseNarrationTemplate:
    def test_json_array_parsed(self):
        raw = '["Compare ", {"t": "t0"}, " and ", {"t": "t1"}]'
        result = _parse_narration_template(raw)
        assert result == ["Compare ", {"t": "t0"}, " and ", {"t": "t1"}]

    def test_plain_string_with_placeholders_converted(self):
        raw = "将 {{t0}} 和 {{t1}} 比较"
        result = _parse_narration_template(raw)
        assert result == ["将 ", {"t": "t0"}, " 和 ", {"t": "t1"}, " 比较"]

    def test_plain_string_without_placeholders_returns_none(self):
        raw = "普通旁白，没有占位符"
        assert _parse_narration_template(raw) is None

    def test_invalid_json_returns_none(self):
        raw = "[broken json"
        assert _parse_narration_template(raw) is None

    def test_conditional_branch_preserved(self):
        raw = '[{"t":"t0"}," and ",[[ {"a":"t0","op":"lt","b":"t1"}, ["less"]],[{},[" same"]]]]'
        result = _parse_narration_template(raw)
        assert isinstance(result, list)
        assert result[0] == {"t": "t0"}
        assert isinstance(result[2], list)
