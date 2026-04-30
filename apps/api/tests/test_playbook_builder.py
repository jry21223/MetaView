"""Tests for the deterministic CIR → PlaybookScript mapping."""
from app.domain.models.cir import (
    CirDocument,
    CirStep,
    ExecutionArrayTrack,
    ExecutionCheckpoint,
    ExecutionMap,
    VisualToken,
)
from app.domain.models.playbook import AlgorithmArraySnapshot, AlgorithmTreeSnapshot
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

    def test_array_snapshot_type(self):
        cir = _make_array_cir()
        playbook = build_playbook(cir, execution_map=None)

        for step in playbook.steps:
            assert isinstance(step.snapshot, AlgorithmArraySnapshot)
            assert step.snapshot.kind == "algorithm_array"

    def test_array_values_from_tokens(self):
        cir = _make_array_cir()
        playbook = build_playbook(cir, execution_map=None)

        assert playbook.steps[0].snapshot.array_values == ["5", "3", "1", "4", "2"]

    def test_sorted_indices_from_accent_tokens(self):
        cir = _make_array_cir()
        playbook = build_playbook(cir, execution_map=None)

        final_snap = playbook.steps[2].snapshot
        assert isinstance(final_snap, AlgorithmArraySnapshot)
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
        assert isinstance(step2.snapshot, AlgorithmArraySnapshot)
        assert step2.snapshot.active_indices == [0, 1]

    def test_execution_map_array_track_values(self):
        cir = _make_array_cir()
        em = _make_execution_map(cir)
        playbook = build_playbook(cir, execution_map=em)

        # array_track values should override token labels
        for step in playbook.steps:
            assert isinstance(step.snapshot, AlgorithmArraySnapshot)
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
