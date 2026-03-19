from app.schemas import TopicDomain, VisualKind
from app.services.prompts.coder import build_coder_system_prompt
from app.services.prompts.critic import build_critic_system_prompt, build_critic_user_prompt
from app.services.prompts.planner import build_planner_system_prompt, build_planner_user_prompt
from app.services.prompts.repair import build_repair_system_prompt, build_repair_user_prompt
from app.services.source_code_module import inspect_source_code


def test_code_planner_prompt_selects_cpp_array_board() -> None:
    source_code = """
    int binary_search(vector<int>& nums, int target) {
        int left = 0;
        int right = (int)nums.size() - 1;
        while (left <= right) {
            int mid = left + (right - left) / 2;
            if (nums[mid] == target) return mid;
            if (nums[mid] < target) left = mid + 1;
            else right = mid - 1;
        }
        return -1;
    }
    """

    prompt = build_planner_system_prompt(
        TopicDomain.CODE,
        source_code=source_code,
        source_code_language="cpp",
    )

    assert "source=code.md" in prompt
    assert "Manim 代码转动画生成提示词" in prompt
    assert "Learning objective" in prompt
    assert "Support both Python and C++ inputs" in prompt
    assert "Array And Index Driven Processes" in prompt
    assert "language=cpp" in prompt
    assert "Linked List And Pointer Rewiring" not in prompt


def test_code_coder_prompt_uses_text_for_source_panel() -> None:
    prompt = build_coder_system_prompt(
        TopicDomain.CODE,
        title="Binary search source walkthrough",
        summary="Highlight left right mid updates and result convergence.",
        cir_json='{"steps":[{"title":"state","annotations":["left","right","mid"]}]}',
    )

    assert "source=code.md" in prompt
    assert "Implement the approved plan below as one Manim scene." in prompt
    assert "real Manim rendering, not a frontend py2ts flow" in prompt
    assert "Use `Text` for raw source code" in prompt
    assert "Array And Index Driven Processes" in prompt
    assert "Recursion, Divide And Conquer, And DP" not in prompt


def test_code_critic_prompt_covers_all_subboards_without_context() -> None:
    prompt = build_critic_system_prompt(TopicDomain.CODE)

    assert "source=code.md" in prompt
    assert "Do not return repaired code" in prompt
    assert "Fix the following Manim script." not in prompt
    assert "Array And Index Driven Processes" in prompt
    assert "Linked List And Pointer Rewiring" in prompt
    assert "Tree And Graph Traversals" in prompt
    assert "Recursion, Divide And Conquer, And DP" in prompt


def test_code_repair_prompt_uses_repair_template() -> None:
    prompt = build_repair_system_prompt(
        TopicDomain.CODE,
        title="Binary search source walkthrough",
        summary="Highlight left right mid updates.",
        cir_json='{"steps":[{"title":"state"}]}',
    )

    assert "source=code.md" in prompt
    assert "Fix the following Manim script." in prompt
    assert "Keep the current script using the observed failures" not in prompt
    assert "Array And Index Driven Processes" in prompt


def test_code_repair_user_prompt_includes_full_issues_and_script() -> None:
    prompt = build_repair_user_prompt(
        title="demo",
        domain=TopicDomain.CODE.value,
        summary="summary",
        cir_json='{"steps":[]}',
        issues=["self.play(move_pointer(...)) 会报错", "不要依赖 TexTemplateLibrary.ctex"],
        renderer_script="class Demo(Scene):\n    pass\n",
    )

    assert "self.play(move_pointer(...)) 会报错" in prompt
    assert "TexTemplateLibrary.ctex" in prompt
    assert "class Demo(Scene):" in prompt


def test_inspect_source_code_detects_linked_list_structure() -> None:
    source_code = """
    class ListNode:
        def __init__(self, val=0, next=None):
            self.val = val
            self.next = next

    def reverse_list(head):
        prev = None
        curr = head
        while curr:
            next_node = curr.next
            curr.next = prev
            prev = curr
            curr = next_node
        return prev
    """

    insights = inspect_source_code(source_code, "python")

    assert "linked-list" in insights.structures
    assert insights.primary_visual_kind == VisualKind.FLOW


def test_code_planner_user_prompt_keeps_full_source_code() -> None:
    long_source = "def solve():\n" + "    pass\n" * 900 + "    sentinel_marker = 42\n"

    prompt = build_planner_user_prompt(
        prompt="visualize source",
        domain=TopicDomain.CODE.value,
        skill_brief="skill=source-code-algorithm-viz",
        source_code=long_source,
        source_code_language="python",
    )

    assert "sentinel_marker = 42" in prompt


def test_code_critic_user_prompt_keeps_full_renderer_script() -> None:
    long_script = (
        "class Demo(Scene):\n"
        + "    def construct(self):\n"
        + "        self.wait(0.1)\n" * 900
    )

    prompt = build_critic_user_prompt(
        title="demo",
        renderer_script=long_script + "        final_marker = 'done'\n",
    )

    assert "final_marker = 'done'" in prompt
