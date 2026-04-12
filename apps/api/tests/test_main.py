import json
import time

from fastapi.testclient import TestClient

from app.main import app, orchestrator
from app.schemas import (
    AgentTrace,
    CirDocument,
    CirStep,
    CustomProviderUpsertRequest,
    HtmlAnimationKind,
    PipelineRunStatus,
    ProviderDescriptor,
    ProviderKind,
    RuntimeSettingsRequest,
    TopicDomain,
    TTSSettingsRequest,
    VisualKind,
    VisualToken,
)
from app.services.preview_video_renderer import PreviewVideoArtifacts
from app.services.prompts.html_coder import (
    build_html_animation_payload_from_cir,
    build_html_coder_cir_context_json,
    build_html_coder_system_prompt,
    build_html_coder_user_prompt,
    build_html_fallback_document,
    build_html_scaffold_document,
)
from app.services.providers.base import CodingHints, CritiqueHints, PlanningHints
from app.services.providers.openai import ProviderInvocationError
from app.services.skill_catalog import SubjectSkillRegistry

client = TestClient(app)


def _stub_preview_renderer(monkeypatch, tmp_path) -> None:
    def fake_render(**kwargs):
        request_id = kwargs["request_id"]
        output = tmp_path / f"{request_id}.mp4"
        output.write_bytes(b"fake")
        return PreviewVideoArtifacts(
            file_path=output,
            url=f"/media/{output.name}",
            backend="storyboard-fallback",
        )

    monkeypatch.setattr(orchestrator.preview_video_renderer, "render", fake_render)
    monkeypatch.setattr(orchestrator.video_narration_service, "is_available", lambda: False)


def _stub_html_preview_dir(monkeypatch, tmp_path) -> None:
    monkeypatch.setattr(orchestrator.html_renderer, "_output_dir", tmp_path)
    monkeypatch.setattr(
        orchestrator.html_renderer,
        "_manifest_path",
        tmp_path / "manifest.json",
    )
    html_preview_route = next(
        route
        for route in app.routes
        if getattr(route, "name", None) == "html-preview"
    )
    monkeypatch.setattr(html_preview_route.app, "directory", str(tmp_path))
    monkeypatch.setattr(html_preview_route.app, "all_directories", [tmp_path])


def _run_pipeline(payload: dict, monkeypatch, tmp_path) -> dict:
    _stub_preview_renderer(monkeypatch, tmp_path)
    response = client.post("/api/v1/pipeline", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["preview_video_url"]
    return data


def _make_unsafe_math_cir() -> CirDocument:
    return CirDocument(
        title='<img src=x onerror=alert("prompt")>',
        domain=TopicDomain.MATH,
        summary='</script><script>alert(1)</script>',
        steps=[
            CirStep(
                id="step-1",
                title='<svg onload=alert(2)>',
                narration='line <b>narration</b>',
                visual_kind=VisualKind.FORMULA,
                tokens=[
                    VisualToken(
                        id="token-1",
                        label="<b>token</b>",
                        value='<img src=x onerror=alert(3)>',
                        emphasis="primary",
                    )
                ],
                annotations=[],
            )
        ],
    )




def test_build_html_scaffold_document_marks_non_fallback_runtime() -> None:
    payload = {
        "title": "导数变化率",
        "summary": "展示割线如何逼近切线。",
        "steps": [
            {
                "id": "step-1",
                "title": "观察斜率",
                "narration": "先展示平均变化率。",
                "visual_kind": "formula",
                "tokens": [
                    {
                        "id": "token-1",
                        "label": "斜率",
                        "value": "Δy/Δx",
                        "emphasis": "primary",
                    }
                ],
            }
        ],
        "params": [{"key": "window", "label": "窗口", "value": "h"}],
    }

    html = build_html_scaffold_document(payload, "light", is_fallback=False)

    assert 'data-metaview-runtime="scaffold"' in html
    assert 'data-metaview-fallback="true"' not in html
    assert 'window.addEventListener("message"' in html
    assert 'document.addEventListener("DOMContentLoaded"' in html
    assert 'window.parent.postMessage({ type, ...payload }, parentTargetOrigin)' in html
    assert 'window.parent.postMessage({ type, ...payload }, "*")' not in html



def test_build_html_coder_prompts_use_structured_json_context() -> None:
    cir = CirDocument(
        title="快速排序流程",
        domain=TopicDomain.ALGORITHM,
        summary="展示分区、递归与收敛。",
        steps=[
            CirStep(
                id="step-1",
                title="选择基准",
                narration="先选取 pivot。",
                visual_kind=VisualKind.FLOW,
                layout={"x": 60, "y": 90, "width": 180, "height": 80},
                tokens=[VisualToken(id="pivot", label="基准", value="8")],
            )
        ],
    )

    cir_context_json = build_html_coder_cir_context_json(cir)
    system_prompt = build_html_coder_system_prompt(
        domain=cir.domain.value,
        title=cir.title,
        summary=cir.summary,
        cir_context_json=cir_context_json,
        ui_theme="dark",
        original_prompt="请生成一个动态快速排序流程动画",
        skill_id="algorithm",
        skill_label="算法",
        skill_notes=["强调分区过程"],
    )
    user_prompt = build_html_coder_user_prompt(
        title=cir.title,
        domain=cir.domain.value,
        summary=cir.summary,
        cir_context_json=cir_context_json,
        ui_theme="dark",
        original_prompt="请生成一个动态快速排序流程动画",
        skill_id="algorithm",
        skill_label="算法",
        skill_notes=["强调分区过程"],
    )

    prompt_json = json.loads(user_prompt)

    assert prompt_json["request"] == {
        "title": "快速排序流程",
        "domain": "algorithm",
        "summary": "展示分区、递归与收敛。",
        "ui_theme": "dark",
        "original_prompt": "请生成一个动态快速排序流程动画",
    }
    assert prompt_json["skill_context"] == {
        "id": "algorithm",
        "label": "算法",
        "notes": ["强调分区过程"],
    }
    assert prompt_json["cir"]["title"] == "快速排序流程"
    assert prompt_json["cir"]["steps"][0]["layout"] == {"x": 60, "y": 90, "width": 180, "height": 80}
    assert prompt_json["design_goal"]["avoid_static_vertical_stack"] is True
    assert 'title=' not in user_prompt
    assert 'domain=' not in user_prompt
    assert 'cir_steps=' not in user_prompt
    assert '"prompt_version": "5.0.0"' in system_prompt


def test_build_html_animation_payload_from_cir_builds_ordered_logic_flow() -> None:
    cir = CirDocument(
        title="冒泡排序流程",
        domain=TopicDomain.ALGORITHM,
        summary="展示初始化、比较交换与结束。",
        steps=[
            CirStep(
                id="step-1",
                title="初始化数组",
                narration="先确认待排序区间。",
                visual_kind=VisualKind.FLOW,
                layout={"x": 40, "y": 60, "width": 180, "height": 80},
                tokens=[VisualToken(id="arr", label="数组", value="[5,3,2]")],
            ),
            CirStep(
                id="step-2",
                title="是否需要交换？",
                narration="比较相邻元素大小。",
                visual_kind=VisualKind.FLOW,
                layout={"x": 280, "y": 150, "width": 200, "height": 92},
                tokens=[VisualToken(id="cmp", label="比较", value="5 > 3")],
            ),
            CirStep(
                id="step-3",
                title="继续下一轮",
                narration="若仍有逆序对则继续循环。",
                visual_kind=VisualKind.FLOW,
                layout={"x": 560, "y": 248, "width": 180, "height": 80},
                tokens=[VisualToken(id="loop", label="状态", value="继续")],
            ),
            CirStep(
                id="step-4",
                title="完成排序",
                narration="当没有逆序对时结束。",
                visual_kind=VisualKind.FLOW,
                layout={"x": 580, "y": 68, "width": 160, "height": 76},
                tokens=[VisualToken(id="done", label="状态", value="有序")],
            ),
        ],
    )

    payload = build_html_animation_payload_from_cir(cir)

    assert payload.kind == HtmlAnimationKind.LOGIC_FLOW
    assert [node.kind for node in payload.flow_nodes] == ["start", "decision", "process", "end"]
    # 4 steps → 4-column single-row grid: x = 115, 305, 495, 685
    xs = [node.x for node in payload.flow_nodes]
    assert xs == sorted(xs), "nodes should be ordered left to right"
    assert xs[0] < xs[1] < xs[2] < xs[3]
    assert all(node.y == 60 for node in payload.flow_nodes), "single row: all nodes at y=60"
    assert payload.flow_links[0].label == "进入判断"
    assert payload.flow_links[1].label == "继续循环"
    assert payload.flow_links[-1].label in {"输出结果", "是", "否"}
    assert [step.highlight_node for step in payload.flow_steps] == ["node-1", "node-2", "node-3", "node-4"]
    assert payload.flow_steps[0].activate_node_ids == ["node-1"]
    assert payload.flow_steps[1].pulse_link_ids == ["link-1"]
    assert payload.flow_steps[2].pulse_link_ids
    assert all(step.duration_ms >= 760 for step in payload.flow_steps)



def test_build_html_scaffold_document_renders_logic_flow_runtime_markers() -> None:
    payload = {
        "kind": "logic_flow",
        "title": "二分查找流程",
        "summary": "展示初始化、判断与收敛。",
        "steps": [
            {
                "id": "step-1",
                "title": "初始化边界",
                "narration": "先设置 left 和 right。",
                "visual_kind": "flow",
                "tokens": [
                    {
                        "id": "token-left",
                        "label": "left",
                        "value": "0",
                        "emphasis": "primary",
                    }
                ],
            }
        ],
        "params": [{"key": "target", "label": "目标", "value": "42"}],
        "flow_nodes": [
            {"id": "n1", "x": 400, "y": 80, "label": "开始", "kind": "start"},
            {"id": "n2", "x": 400, "y": 220, "label": "判断", "kind": "decision"},
        ],
        "flow_links": [
            {"id": "l1", "from": "n1", "to": "n2", "label": "进入判断"}
        ],
        "flow_steps": [
            {
                "id": "fs1",
                "message": "初始化节点",
                "highlight_node": "n1",
                "pulse_link_ids": [],
                "activate_node_ids": ["n1"],
                "duration_ms": 700,
            },
            {
                "id": "fs2",
                "message": "进入判断",
                "highlight_node": "n2",
                "pulse_link_ids": ["l1"],
                "activate_node_ids": ["n1", "n2"],
                "duration_ms": 760,
            },
        ],
    }

    html = build_html_scaffold_document(payload, "dark", is_fallback=False)

    assert 'data-metaview-runtime="scaffold"' in html
    assert 'const isLogicFlow = animationPayload.kind === "logic_flow"' in html
    assert 'function derivePalette(theme)' in html
    assert 'function renderLogicFlow(step)' in html
    assert 'function animateLogicFlowStep(step, baseDuration)' in html
    assert 'node.classList.toggle("is-highlighted"' in html
    assert 'node.classList.toggle("is-active"' in html
    assert 'node.classList.toggle("is-visited"' in html
    assert 'gsap.fromTo(' in html
    assert 'flow-link-pulse' in html
    assert 'flow-progress-bar' in html
    assert 'flow-message-card' in html
    assert '流程提示' in html
    assert 'prefersReducedMotion.matches' in html
    assert 'id="canvas-flow"' in html
    assert 'flow_nodes' in html
    assert 'flow_steps' in html
    assert 'window.parent.postMessage({ type, ...payload }, parentTargetOrigin)' in html

def test_build_html_scaffold_document_escapes_selector_helper_for_runtime() -> None:
    html = build_html_scaffold_document(
        {
            "title": "选择器转义",
            "summary": "检查运行时 selector helper。",
            "steps": [
                {
                    "id": 'step-"1',
                    "title": "检查高亮",
                    "narration": "避免引号破坏运行时脚本。",
                    "visual_kind": "text",
                    "tokens": [],
                }
            ],
            "params": [],
        },
        "dark",
        is_fallback=False,
    )

    assert 'function escapeSelectorValue(value)' in html
    assert 'stageSurface.querySelector(`[data-node-id="${escapeSelectorValue(step.highlight_node)}"]`)' in html



def test_build_html_scaffold_document_keeps_theme_palette_contract() -> None:
    html = build_html_scaffold_document(
        {
            "title": "主题同步",
            "summary": "校验 light / dark 配色契约。",
            "steps": [
                {
                    "id": "step-1",
                    "title": "切换主题",
                    "narration": "保持舞台颜色协调。",
                    "visual_kind": "text",
                    "tokens": [],
                }
            ],
            "params": [],
        },
        "light",
        is_fallback=False,
    )

    assert 'function derivePalette(theme)' in html
    assert 'bg: "#f5f7fa"' in html
    assert 'primary: "#00896e"' in html
    assert 'accent: "#96463c"' in html
    assert 'bg: "#0a0c10"' in html
    assert 'primary: "#4de8b0"' in html
    assert 'if (message.type === "theme") {' in html
    assert 'runtime.applyTheme(message.theme);' in html



def test_build_html_scaffold_document_clamps_logic_flow_metadata_to_last_available_step() -> None:
    html = build_html_scaffold_document(
        {
            "kind": "logic_flow",
            "title": "流程元数据兜底",
            "summary": "flow_steps 多于 steps 时仍应保留侧栏内容。",
            "steps": [
                {
                    "id": "step-1",
                    "title": "初始化边界",
                    "narration": "先设置 left 和 right。",
                    "visual_kind": "flow",
                    "tokens": [
                        {
                            "id": "token-left",
                            "label": "left",
                            "value": "0",
                            "emphasis": "primary",
                        }
                    ],
                }
            ],
            "params": [],
            "flow_nodes": [
                {"id": "n1", "x": 400, "y": 80, "label": "开始", "kind": "start"},
                {"id": "n2", "x": 400, "y": 220, "label": "判断", "kind": "decision"},
            ],
            "flow_links": [{"id": "l1", "from": "n1", "to": "n2", "label": "进入判断"}],
            "flow_steps": [
                {
                    "id": "fs1",
                    "message": "初始化边界",
                    "highlight_node": "n1",
                    "pulse_link_ids": [],
                    "activate_node_ids": ["n1"],
                    "duration_ms": 700,
                },
                {
                    "id": "fs2",
                    "message": "进入判断",
                    "highlight_node": "n2",
                    "pulse_link_ids": ["l1"],
                    "activate_node_ids": ["n1", "n2"],
                    "duration_ms": 760,
                },
            ],
        },
        "dark",
        is_fallback=False,
    )

    assert 'const safeIndex = Math.max(0, Math.min(runtime.state.currentStep, steps.length - 1));' in html
    assert 'const genericStep = currentGenericStep();' in html
    assert 'const genericStep = steps[api.state.currentStep] || null;' not in html
    assert 'document.getElementById("step-title").textContent = genericStep?.title || step.message || "";' in html
    assert 'document.getElementById("narration").textContent = genericStep?.narration || step.message || "";' in html
    assert 'document.getElementById("tokens").innerHTML = renderTokens(genericStep?.tokens || []);' in html



def test_build_html_scaffold_document_validates_message_source_and_origin() -> None:
    html = build_html_scaffold_document(
        {
            "title": "消息通道校验",
            "summary": "仅接收来自父窗口的合法消息。",
            "steps": [
                {
                    "id": "step-1",
                    "title": "准备完成",
                    "narration": "检查来源与 origin。",
                    "visual_kind": "text",
                    "tokens": [],
                }
            ],
            "params": [],
        },
        "dark",
        is_fallback=False,
    )

    assert "const parentTargetOrigin = (() => {" in html
    assert "if (window.parent !== window && event.source !== window.parent) {" in html
    assert "if (parentTargetOrigin && event.origin && event.origin !== parentTargetOrigin) {" in html
    assert 'window.parent.postMessage({ type, ...payload }, parentTargetOrigin)' in html
    assert 'window.parent.postMessage({ type, ...payload }, "*")' not in html


def test_build_html_scaffold_document_renders_hanoi_motion_board() -> None:
    html = build_html_scaffold_document(
        {
            "kind": "generic",
            "title": "汉诺塔",
            "summary": "展示圆盘移动。",
            "steps": [
                {
                    "id": "step-1",
                    "title": "第 1 步：A→C",
                    "narration": "将 1 号盘从 A 柱移动到 C 柱。",
                    "visual_kind": "motion",
                    "tokens": [
                        {"id": "disk-1", "label": "移动盘", "value": "1", "emphasis": "primary"},
                        {"id": "from-1", "label": "起点", "value": "A 柱", "emphasis": "secondary"},
                        {"id": "to-1", "label": "终点", "value": "C 柱", "emphasis": "accent"},
                    ],
                    "duration_ms": 900,
                    "emphasis_token_ids": ["disk-1"],
                }
            ],
            "params": [],
        },
        "dark",
    )

    assert 'class="hanoi-board"' in html
    assert 'class="hanoi-disk"' in html
    assert 'A 柱' in html and 'B 柱' in html and 'C 柱' in html


def test_build_html_scaffold_document_escapes_logic_flow_labels_and_messages() -> None:
    html = build_html_scaffold_document(
        {
            "kind": "logic_flow",
            "title": "转义检查",
            "summary": "避免标签和消息破坏运行时。",
            "steps": [
                {
                    "id": "step-1",
                    "title": "节点说明",
                    "narration": "保护节点标签。",
                    "visual_kind": "flow",
                    "tokens": [],
                }
            ],
            "params": [],
            "flow_nodes": [
                {
                    "id": 'node-"1',
                    "x": 400,
                    "y": 80,
                    "label": '<script>alert("node")</script>',
                    "kind": "start",
                }
            ],
            "flow_links": [],
            "flow_steps": [
                {
                    "id": "fs1",
                    "message": '<img src=x onerror=alert("step")>',
                    "highlight_node": 'node-"1',
                    "pulse_link_ids": [],
                    "activate_node_ids": ['node-"1'],
                    "duration_ms": 700,
                }
            ],
        },
        "dark",
        is_fallback=False,
    )

    assert '\\u003cscript\\u003ealert(\\"node\\")\\u003c/script\\u003e' in html
    assert '\\u003cimg src=x onerror=alert(\\"step\\")\\u003e' in html
    assert '<script>alert("node")</script>' not in html
    assert '<img src=x onerror=alert("step")>' not in html
    assert 'const raw = String(node.label || "步骤")' in html
    assert 'escapeHtml(raw.slice(0, 7))' in html
    assert 'escapeHtml(step?.message || "流程演示准备完成")' in html


def _wait_for_run_status(
    request_id: str,
    *,
    timeout_s: float = 5.0,
    poll_interval_s: float = 0.05,
) -> dict:
    deadline = time.time() + timeout_s
    last_payload: dict | None = None
    while time.time() < deadline:
        response = client.get(f"/api/v1/runs/{request_id}")
        assert response.status_code == 200
        last_payload = response.json()
        if last_payload["status"] in {
            PipelineRunStatus.SUCCEEDED.value,
            PipelineRunStatus.FAILED.value,
        }:
            return last_payload
        time.sleep(poll_interval_s)
    raise AssertionError(f"Timed out waiting for run {request_id}: {last_payload}")


def test_healthcheck() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_pipeline_returns_cir() -> None:
    response = client.post(
        "/api/v1/pipeline",
        json={
            "prompt": "请可视化讲解二分查找为什么能在有序数组中快速定位答案。",
            "provider": "mock",
            "sandbox_mode": "dry_run",
        },
    )
    assert response.status_code == 200

    payload = response.json()
    assert payload["cir"]["domain"] == "algorithm"
    assert len(payload["cir"]["steps"]) == 3
    assert "from manim import *" in payload["renderer_script"]
    assert "class GeneratedPreviewScene(Scene):" in payload["renderer_script"]
    assert "_algo_vis_pick_cjk_font" in payload["renderer_script"]
    assert payload["preview_video_url"]
    assert payload["runtime"]["skill"]["id"] == "algorithm-process-viz"
    assert payload["runtime"]["router_provider"]["name"] == "mock"
    assert payload["runtime"]["generation_provider"]["name"] == "mock"
    assert payload["runtime"]["provider"]["name"] == "mock"
    assert payload["runtime"]["sandbox"]["status"] == "passed"
    assert payload["runtime"]["validation"]["status"] == "valid"
    assert payload["runtime"]["repair_count"] == 0
    assert payload["runtime"]["agent_traces"][0]["agent"] == "router"
    video_response = client.get(payload["preview_video_url"])
    assert video_response.status_code == 200
    assert "video/mp4" in video_response.headers["content-type"]


def test_pipeline_html_mode_saves_request_specific_preview(monkeypatch, tmp_path) -> None:
    _stub_html_preview_dir(monkeypatch, tmp_path)

    response_one = client.post(
        "/api/v1/pipeline",
        json={
            "prompt": "请生成一个可交互的二分查找 HTML 动画。",
            "provider": "mock",
            "sandbox_mode": "dry_run",
            "output_mode": "html",
        },
    )
    assert response_one.status_code == 200
    payload_one = response_one.json()
    request_id_one = payload_one["request_id"]
    html_url_one = payload_one["preview_html_url"]
    assert html_url_one == f"/api/v1/html_preview/{request_id_one}.html"
    assert payload_one["preview_video_url"] is None

    response_two = client.post(
        "/api/v1/pipeline",
        json={
            "prompt": "请生成一个可交互的二分查找 HTML 动画。",
            "provider": "mock",
            "sandbox_mode": "dry_run",
            "output_mode": "html",
        },
    )
    assert response_two.status_code == 200
    payload_two = response_two.json()
    request_id_two = payload_two["request_id"]
    html_url_two = payload_two["preview_html_url"]
    assert html_url_two == f"/api/v1/html_preview/{request_id_two}.html"
    assert html_url_one != html_url_two

    html_response_one = client.get(html_url_one)
    assert html_response_one.status_code == 200
    assert "text/html" in html_response_one.headers["content-type"]

    html_response_two = client.get(html_url_two)
    assert html_response_two.status_code == 200
    assert "text/html" in html_response_two.headers["content-type"]

    saved_file_one = tmp_path / f"{request_id_one}.html"
    saved_file_two = tmp_path / f"{request_id_two}.html"
    assert saved_file_one.exists()
    assert saved_file_two.exists()
    assert html_response_one.text == saved_file_one.read_text(encoding="utf-8")
    assert html_response_two.text == saved_file_two.read_text(encoding="utf-8")
    assert 'data-metaview-fallback="true"' in html_response_one.text
    assert "gsap@3.13/dist/gsap.min.js" in html_response_one.text
    assert "p5@1.11.8/lib/p5.min.js" in html_response_one.text
    assert 'window.addEventListener("message"' in html_response_one.text
    assert 'document.addEventListener("DOMContentLoaded"' in html_response_one.text
    assert 'data-metaview-fallback="true"' in html_response_two.text
    assert "gsap@3.13/dist/gsap.min.js" in html_response_two.text
    assert "p5@1.11.8/lib/p5.min.js" in html_response_two.text
    assert 'window.addEventListener("message"' in html_response_two.text
    assert 'document.addEventListener("DOMContentLoaded"' in html_response_two.text


def test_build_html_fallback_document_escapes_unsafe_cir_content() -> None:
    cir = _make_unsafe_math_cir()

    html = build_html_fallback_document(cir, "dark")

    assert 'data-metaview-fallback="true"' in html
    assert 'const animationPayload = ' in html
    assert '</script><script>alert(1)</script>' not in html
    assert '<img src=x onerror=alert("prompt")>' not in html
    assert '\\u003c/script\\u003e\\u003cscript\\u003ealert(1)\\u003c/script\\u003e' in html
    assert '\\u003cimg src=x onerror=alert(\\"prompt\\")\\u003e' in html


    cir = CirDocument(
        title="二分查找流程",
        domain=TopicDomain.ALGORITHM,
        summary="展示初始化与循环判断。",
        steps=[
            CirStep(
                id="step-1",
                title="初始化边界",
                narration="先设置 left 和 right。",
                visual_kind=VisualKind.FLOW,
                tokens=[VisualToken(id="left", label="left", value="0")],
            ),
            CirStep(
                id="step-2",
                title="判断 mid 是否命中",
                narration="比较 nums[mid] 与 target。",
                visual_kind=VisualKind.FLOW,
                tokens=[VisualToken(id="mid", label="mid", value="4")],
            ),
        ],
    )

    html = build_html_fallback_document(cir, "dark")

    assert 'data-metaview-fallback="true"' in html
    assert 'const isLogicFlow = animationPayload.kind === "logic_flow"' in html
    assert 'function renderLogicFlow(step)' in html
    assert 'function animateLogicFlowStep(step, baseDuration)' in html
    assert 'flow_nodes' in html
    assert 'flow_steps' in html


_VALID_FREE_FORM_HTML = """\
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>自由生成动画</title>
</head>
<body>
<div id="app"><h2>二分查找流程</h2></div>
<script>
window.addEventListener("message", function(e) {
  var d = e.data;
  if (!d || !d.type) return;
  if (d.type === "goToStep") {}
  if (d.type === "theme") { document.body.setAttribute("data-theme", d.theme); }
  if (d.type === "playback") {}
});
document.addEventListener("DOMContentLoaded", function() {
  window.parent.postMessage({ type: "ready", totalSteps: 3 }, "*");
});
</script>
</body>
</html>"""


def test_pipeline_html_mode_saves_free_form_html_preview_from_provider(monkeypatch, tmp_path) -> None:
    _stub_html_preview_dir(monkeypatch, tmp_path)
    captured_prompts: dict[str, str] = {}

    class FreeFormHtmlProvider:
        descriptor = ProviderDescriptor(
            name="free-form-html",
            label="Free Form HTML Provider",
            kind=ProviderKind.OPENAI_COMPATIBLE,
            model="free-form-model",
            description="free form html provider",
            configured=True,
        )

        def _chat_text(self, **kwargs):
            captured_prompts["system_prompt"] = kwargs["system_prompt"]
            captured_prompts["user_prompt"] = kwargs["user_prompt"]
            return (_VALID_FREE_FORM_HTML, {})

        def model_for_stage(self, stage: str) -> str:
            return "free-form-model"

        def route(self, *args, **kwargs):
            raise AssertionError("generation provider should not handle routing")

        def plan(self, *args, **kwargs):
            raise AssertionError("HTML mode should skip provider planning")

        def code(self, *args, **kwargs):
            raise AssertionError("HTML mode should skip Manim coding")

        def critique(self, *args, **kwargs):
            raise AssertionError("HTML mode should skip Manim critique")

    original_get = orchestrator.provider_registry.get

    def fake_get(name: str):
        if name == "free-form-html":
            return FreeFormHtmlProvider()
        return original_get(name)

    monkeypatch.setattr(orchestrator.provider_registry, "get", fake_get)

    response = client.post(
        "/api/v1/pipeline",
        json={
            "prompt": "请生成一个可交互的二分查找流程 HTML 动画。",
            "domain": "algorithm",
            "generation_provider": "free-form-html",
            "sandbox_mode": "dry_run",
            "output_mode": "html",
            "persist_run": False,
        },
    )
    assert response.status_code == 200

    payload = response.json()
    traces = {trace["agent"]: trace for trace in payload["runtime"]["agent_traces"]}

    assert payload["preview_html_url"] == f"/api/v1/html_preview/{payload['request_id']}.html"
    assert traces["html_coder"]["provider"] == "Free Form HTML Provider"
    assert payload["runtime"]["sandbox"]["status"] == "passed"
    assert "data-metaview-fallback" not in payload["renderer_script"]
    # New minimal prompt: contains title and color palette, not a JSON blob
    assert "题目：" in captured_prompts["user_prompt"]
    assert "配色" in captured_prompts["user_prompt"]
    assert "window.parent.postMessage" in captured_prompts["system_prompt"]
    # LLM-generated HTML used directly
    assert "二分查找流程" in payload["renderer_script"]
    assert "totalSteps: 3" in payload["renderer_script"]


def test_pipeline_html_mode_uses_free_form_html_directly_from_provider(monkeypatch, tmp_path) -> None:
    """Provider returns valid complete HTML → used as-is, no scaffold wrapping."""
    _stub_html_preview_dir(monkeypatch, tmp_path)

    class ValidHtmlProvider:
        descriptor = ProviderDescriptor(
            name="valid-html",
            label="Valid HTML Provider",
            kind=ProviderKind.OPENAI_COMPATIBLE,
            model="valid-html-model",
            description="provider that returns valid free-form HTML",
            configured=True,
        )

        def _chat_text(self, **kwargs):
            return (_VALID_FREE_FORM_HTML, {})

        def model_for_stage(self, stage: str) -> str:
            return "valid-html-model"

        def route(self, *args, **kwargs):
            raise AssertionError("generation provider should not handle routing")

        def plan(self, *args, **kwargs):
            raise AssertionError("HTML mode should skip provider planning")

        def code(self, *args, **kwargs):
            raise AssertionError("HTML mode should skip Manim coding")

        def critique(self, *args, **kwargs):
            raise AssertionError("HTML mode should skip Manim critique")

    original_get = orchestrator.provider_registry.get

    def fake_get(name: str):
        if name == "valid-html":
            return ValidHtmlProvider()
        return original_get(name)

    monkeypatch.setattr(orchestrator.provider_registry, "get", fake_get)

    response = client.post(
        "/api/v1/pipeline",
        json={
            "prompt": "请生成一个可交互的二分查找流程 HTML 动画。",
            "domain": "algorithm",
            "generation_provider": "valid-html",
            "sandbox_mode": "dry_run",
            "output_mode": "html",
            "persist_run": False,
        },
    )
    assert response.status_code == 200

    payload = response.json()
    traces = {trace["agent"]: trace for trace in payload["runtime"]["agent_traces"]}
    assert payload["runtime"]["sandbox"]["status"] == "passed"
    assert traces["html_coder"]["provider"] == "Valid HTML Provider"
    assert payload["runtime"]["repair_count"] == 0
    assert not any("fallback" in diagnostic["message"] for diagnostic in payload["diagnostics"])
    assert 'data-metaview-fallback="true"' not in payload["renderer_script"]
    # LLM-generated HTML used directly (no scaffold injection)
    assert 'data-metaview-runtime="scaffold"' not in payload["renderer_script"]
    assert "二分查找流程" in payload["renderer_script"]

    # Second sub-test: provider returns JSON (non-HTML) → scaffold fallback used
    _stub_html_preview_dir(monkeypatch, tmp_path)
    captured_prompts: dict[str, str] = {}

    class HtmlGenerationStubProvider:
        descriptor = ProviderDescriptor(
            name="html-generation-stub",
            label="HTML Generation Stub",
            kind=ProviderKind.OPENAI_COMPATIBLE,
            model="html-generation-model",
            description="stub html generation provider",
            configured=True,
        )

        def _chat_text(self, **kwargs):
            captured_prompts["system_prompt"] = kwargs["system_prompt"]
            captured_prompts["user_prompt"] = kwargs["user_prompt"]
            return (
                """
```json
{
  "title": "HTML Stub",
  "summary": "stub summary"
}
```
                """.strip(),
                {},
            )

        def model_for_stage(self, stage: str) -> str:
            return "html-generation-model"

        def route(self, *args, **kwargs):
            raise AssertionError("generation provider should not handle routing")

        def plan(self, *args, **kwargs):
            raise AssertionError("HTML mode should skip provider planning")

        def code(self, *args, **kwargs):
            raise AssertionError("HTML mode should skip Manim coding")

        def critique(self, *args, **kwargs):
            raise AssertionError("HTML mode should skip Manim critique")

    original_get2 = orchestrator.provider_registry.get

    def fake_get2(name: str):
        if name == "html-generation-stub":
            return HtmlGenerationStubProvider()
        return original_get2(name)

    monkeypatch.setattr(orchestrator.provider_registry, "get", fake_get2)

    response = client.post(
        "/api/v1/pipeline",
        json={
            "prompt": "请生成一个可交互的导数变化率 HTML 动画。",
            "domain": "math",
            "generation_provider": "html-generation-stub",
            "sandbox_mode": "dry_run",
            "output_mode": "html",
            "persist_run": False,
        },
    )
    assert response.status_code == 200

    payload = response.json()
    traces = {trace["agent"]: trace for trace in payload["runtime"]["agent_traces"]}

    assert payload["preview_html_url"] == f"/api/v1/html_preview/{payload['request_id']}.html"
    assert "planner" not in traces
    assert "html_coder" in traces
    # Provider returned JSON → falls back to scaffold
    assert "使用本地模板" in traces["html_coder"]["summary"]
    assert "parse:not-html" in traces["html_coder"]["summary"]
    assert "data-metaview-runtime=\"scaffold\"" in payload["renderer_script"]
    assert "data-metaview-fallback=\"true\"" in payload["renderer_script"]
    assert "window.parent.postMessage" in payload["renderer_script"]
    # New minimal prompt: contains title and color palette
    assert "window.parent.postMessage" in captured_prompts["system_prompt"]
    assert "题目：" in captured_prompts["user_prompt"]
    assert "配色" in captured_prompts["user_prompt"]



def test_pipeline_html_mode_uses_minimal_prompt_format(monkeypatch, tmp_path) -> None:
    """HTML coder prompt is now minimal: title + domain + color palette only."""
    _stub_html_preview_dir(monkeypatch, tmp_path)
    captured_prompts: dict[str, str] = {}

    class HtmlGenerationStubProvider:
        descriptor = ProviderDescriptor(
            name="html-generation-stub-source",
            label="HTML Generation Stub Source",
            kind=ProviderKind.OPENAI_COMPATIBLE,
            model="html-generation-model",
            description="stub html generation provider",
            configured=True,
        )

        def _chat_text(self, **kwargs):
            captured_prompts["system_prompt"] = kwargs["system_prompt"]
            captured_prompts["user_prompt"] = kwargs["user_prompt"]
            return (_VALID_FREE_FORM_HTML, {})

        def model_for_stage(self, stage: str) -> str:
            return "html-generation-model"

        def route(self, *args, **kwargs):
            raise AssertionError("generation provider should not handle routing")

        def plan(self, *args, **kwargs):
            raise AssertionError("HTML mode should skip provider planning")

        def code(self, *args, **kwargs):
            raise AssertionError("HTML mode should skip Manim coding")

        def critique(self, *args, **kwargs):
            raise AssertionError("HTML mode should skip Manim critique")

    original_get = orchestrator.provider_registry.get

    def fake_get(name: str):
        if name == "html-generation-stub-source":
            return HtmlGenerationStubProvider()
        return original_get(name)

    monkeypatch.setattr(orchestrator.provider_registry, "get", fake_get)

    response = client.post(
        "/api/v1/pipeline",
        json={
            "prompt": "请把这段二分查找源码生成 HTML 动画。",
            "domain": "code",
            "generation_provider": "html-generation-stub-source",
            "sandbox_mode": "dry_run",
            "output_mode": "html",
            "persist_run": False,
            "source_code": "def binary_search(nums, target):\n    left, right = 0, len(nums) - 1\n    return -1",
            "source_code_language": "python",
            "source_image": "data:image/png;base64,ZmFrZQ==",
            "source_image_name": "binary-search.png",
        },
    )
    assert response.status_code == 200
    # Prompt is now plain text, not a JSON blob
    assert "题目：" in captured_prompts["user_prompt"]
    assert "配色" in captured_prompts["user_prompt"]
    # Source code body and image data are no longer forwarded to the HTML prompt
    assert "def binary_search" not in captured_prompts["user_prompt"]
    assert "ZmFrZQ==" not in captured_prompts["user_prompt"]
    # System prompt instructs postMessage bridge
    assert "window.parent.postMessage" in captured_prompts["system_prompt"]
    payload = response.json()
    # LLM returned valid HTML → used directly
    assert "data-metaview-fallback" not in payload["renderer_script"]
    assert "window.addEventListener(\"message\"" in payload["renderer_script"]


def test_pipeline_html_mode_falls_back_when_provider_returns_incomplete_html(
    monkeypatch, tmp_path
) -> None:
    _stub_html_preview_dir(monkeypatch, tmp_path)

    original_get = orchestrator.provider_registry.get
    mock_provider = original_get("mock")

    class BrokenHtmlProvider:
        descriptor = ProviderDescriptor(
            name="broken-html",
            label="Broken HTML Provider",
            kind=ProviderKind.OPENAI_COMPATIBLE,
            model="broken-html-model",
            description="broken html provider",
            configured=True,
        )

        def _chat_text(self, **kwargs):
            return (
                """
```json
{
  "title": "Broken JSON",
  "steps": [
    {"id": "step-1", "title": "坏数据", "narration": "缺少收尾"
```
                """.strip(),
                {},
            )

        def model_for_stage(self, stage: str) -> str:
            return "broken-html-model"

        def route(self, *args, **kwargs):
            raise AssertionError("route should not be called")

        def plan(self, *args, **kwargs):
            return mock_provider.plan(*args, **kwargs)

        def code(self, *args, **kwargs):
            return mock_provider.code(*args, **kwargs)

        def critique(self, *args, **kwargs):
            return mock_provider.critique(*args, **kwargs)


    monkeypatch.setattr(
        orchestrator.provider_registry,
        "get",
        lambda name=None: BrokenHtmlProvider() if name == "broken-html" else original_get(name),
    )

    response = client.post(
        "/api/v1/pipeline",
        json={
            "prompt": "请生成一个可交互的汉诺塔 HTML 动画。",
            "provider": "broken-html",
            "generation_provider": "broken-html",
            "router_provider": "mock",
            "sandbox_mode": "dry_run",
            "output_mode": "html",
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["preview_html_url"]
    traces = {trace["agent"]: trace for trace in payload["runtime"]["agent_traces"]}
    assert traces["html_coder"]["provider"] == "Broken HTML Provider"
    assert "使用本地模板" in traces["html_coder"]["summary"]
    assert "parse:not-html" in traces["html_coder"]["summary"]
    assert payload["runtime"]["agent_traces"][-1]["raw_output"]
    assert any(
        diagnostic["agent"] == "html_coder"
        and "parse:not-html" in diagnostic["message"]
        for diagnostic in payload["diagnostics"]
    )

    html_response = client.get(payload["preview_html_url"])
    assert html_response.status_code == 200
    assert 'data-metaview-runtime="scaffold"' in html_response.text
    assert 'data-metaview-fallback="true"' in html_response.text
    assert "window.parent.postMessage" in html_response.text


def test_pipeline_html_mode_falls_back_when_provider_returns_full_html_shell(
    monkeypatch, tmp_path
) -> None:
    _stub_html_preview_dir(monkeypatch, tmp_path)

    original_get = orchestrator.provider_registry.get

    class ReadyOnlyHtmlProvider:
        descriptor = ProviderDescriptor(
            name="ready-only-html",
            label="Ready Only HTML Provider",
            kind=ProviderKind.OPENAI_COMPATIBLE,
            model="ready-only-html-model",
            description="html provider that still returns a full html shell",
            configured=True,
        )

        def _chat_text(self, **kwargs):
            return (
                """
<!DOCTYPE html>
<html lang="zh-CN">
  <body>
    <script>
      document.addEventListener("DOMContentLoaded", () => {
        window.parent.postMessage({ type: "ready", totalSteps: 1 }, "*");
      });
    </script>
  </body>
</html>
                """.strip(),
                {},
            )

        def model_for_stage(self, stage: str) -> str:
            return "ready-only-html-model"

        def route(self, *args, **kwargs):
            raise AssertionError("route should not be called")

        def plan(self, *args, **kwargs):
            raise AssertionError("HTML mode should skip provider planning")

        def code(self, *args, **kwargs):
            raise AssertionError("HTML mode should skip Manim coding")

        def critique(self, *args, **kwargs):
            raise AssertionError("HTML mode should skip Manim critique")

    monkeypatch.setattr(
        orchestrator.provider_registry,
        "get",
        lambda name=None: ReadyOnlyHtmlProvider()
        if name == "ready-only-html"
        else original_get(name),
    )

    response = client.post(
        "/api/v1/pipeline",
        json={
            "prompt": "请生成一个可交互的函数图像 HTML 动画。",
            "provider": "ready-only-html",
            "generation_provider": "ready-only-html",
            "router_provider": "mock",
            "sandbox_mode": "dry_run",
            "output_mode": "html",
        },
    )
    assert response.status_code == 200
    payload = response.json()

    traces = {trace["agent"]: trace for trace in payload["runtime"]["agent_traces"]}
    assert traces["html_coder"]["provider"] == "Ready Only HTML Provider"
    assert "bootstrap:missing-message-listener" in traces["html_coder"]["summary"]
    assert any(
        diagnostic["agent"] == "html_coder"
        and "bootstrap:missing-message-listener" in diagnostic["message"]
        for diagnostic in payload["diagnostics"]
    )

    html_response = client.get(payload["preview_html_url"])
    assert html_response.status_code == 200
    assert 'data-metaview-fallback="true"' in html_response.text



def test_pipeline_html_mode_falls_back_when_provider_payload_is_invalid(
    monkeypatch, tmp_path
) -> None:
    _stub_html_preview_dir(monkeypatch, tmp_path)

    original_get = orchestrator.provider_registry.get

    class InvalidPayloadProvider:
        descriptor = ProviderDescriptor(
            name="invalid-payload-html",
            label="Invalid Payload HTML Provider",
            kind=ProviderKind.OPENAI_COMPATIBLE,
            model="invalid-payload-model",
            description="html provider with invalid payload shape",
            configured=True,
        )

        def _chat_text(self, **kwargs):
            return (
                """
```json
{
  "title": "Invalid Payload",
  "summary": "missing steps",
  "params": []
}
```
                """.strip(),
                {},
            )

        def model_for_stage(self, stage: str) -> str:
            return "invalid-payload-model"

        def route(self, *args, **kwargs):
            raise AssertionError("route should not be called")

        def plan(self, *args, **kwargs):
            raise AssertionError("HTML mode should skip provider planning")

        def code(self, *args, **kwargs):
            raise AssertionError("HTML mode should skip Manim coding")

        def critique(self, *args, **kwargs):
            raise AssertionError("HTML mode should skip Manim critique")

    monkeypatch.setattr(
        orchestrator.provider_registry,
        "get",
        lambda name=None: InvalidPayloadProvider()
        if name == "invalid-payload-html"
        else original_get(name),
    )

    response = client.post(
        "/api/v1/pipeline",
        json={
            "prompt": "请生成一个可交互的函数图像 HTML 动画。",
            "provider": "invalid-payload-html",
            "generation_provider": "invalid-payload-html",
            "router_provider": "mock",
            "sandbox_mode": "dry_run",
            "output_mode": "html",
        },
    )
    assert response.status_code == 200
    payload = response.json()

    traces = {trace["agent"]: trace for trace in payload["runtime"]["agent_traces"]}
    assert traces["html_coder"]["provider"] == "Invalid Payload HTML Provider"
    assert "parse:not-html" in traces["html_coder"]["summary"]
    assert any(
        diagnostic["agent"] == "html_coder"
        and "parse:not-html" in diagnostic["message"]
        for diagnostic in payload["diagnostics"]
    )

    html_response = client.get(payload["preview_html_url"])
    assert html_response.status_code == 200
    assert 'data-metaview-runtime="scaffold"' in html_response.text
    assert 'data-metaview-fallback="true"' in html_response.text


def test_pipeline_html_mode_rejects_unsafe_provider_runtime_html(monkeypatch, tmp_path) -> None:
    _stub_html_preview_dir(monkeypatch, tmp_path)

    original_get = orchestrator.provider_registry.get

    class UnsafeHtmlProvider:
        descriptor = ProviderDescriptor(
            name="unsafe-html",
            label="Unsafe HTML Provider",
            kind=ProviderKind.OPENAI_COMPATIBLE,
            model="unsafe-html-model",
            description="unsafe html provider",
            configured=True,
        )

        def _chat_text(self, **kwargs):
            return (
                """
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <title>Unsafe HTML</title>
  </head>
  <body>
    <div id="app">unsafe html</div>
    <script>
      const runtime = {
        state: { currentStep: 0, totalSteps: 1, autoplay: false, speed: 1, paused: true, params: {} },
      };
      window.addEventListener("message", () => {});
      document.addEventListener("DOMContentLoaded", () => {
        document.body.setAttribute("onclick", "alert('xss')");
        window.parent.postMessage({ type: "ready", totalSteps: 1, supportedParams: [], capabilities: {} }, "*");
      });
    </script>
  </body>
</html>
                """.strip(),
                {},
            )

        def model_for_stage(self, stage: str) -> str:
            return "unsafe-html-model"

        def route(self, *args, **kwargs):
            raise AssertionError("route should not be called")

        def plan(self, *args, **kwargs):
            raise AssertionError("HTML mode should skip provider planning")

        def code(self, *args, **kwargs):
            raise AssertionError("HTML mode should skip Manim coding")

        def critique(self, *args, **kwargs):
            raise AssertionError("HTML mode should skip Manim critique")

    def fake_get(name: str):
        if name == "unsafe-html":
            return UnsafeHtmlProvider()
        return original_get(name)

    monkeypatch.setattr(orchestrator.provider_registry, "get", fake_get)

    response = client.post(
        "/api/v1/pipeline",
        json={
            "prompt": "请生成一个可交互的导数变化率 HTML 动画。",
            "domain": "math",
            "generation_provider": "unsafe-html",
            "sandbox_mode": "dry_run",
            "output_mode": "html",
            "persist_run": False,
        },
    )
    assert response.status_code == 200

    payload = response.json()
    traces = {trace["agent"]: trace for trace in payload["runtime"]["agent_traces"]}
    assert traces["html_coder"]["provider"] == "Unsafe HTML Provider"
    assert "使用本地模板" in traces["html_coder"]["summary"]
    assert "safety:dynamic-event-handler" in traces["html_coder"]["summary"]
    assert payload["runtime"]["agent_traces"][-1]["raw_output"]
    assert any(
        diagnostic["agent"] == "html_coder"
        and "safety:dynamic-event-handler" in diagnostic["message"]
        for diagnostic in payload["diagnostics"]
    )

    html_response = client.get(payload["preview_html_url"])
    assert html_response.status_code == 200
    html = html_response.text

    assert 'data-metaview-fallback="true"' in html
    assert 'onclick="alert(\'xss\')"' not in html
    assert "unsafe html" not in html


def test_runtime_catalog() -> None:
    response = client.get("/api/v1/runtime")
    assert response.status_code == 200

    payload = response.json()
    assert payload["default_provider"] == "mock"
    assert payload["default_router_provider"] == "mock"
    assert payload["default_generation_provider"] == "mock"
    assert payload["sandbox_engine"] == "hybrid-runtime-dry-run"
    assert payload["providers"][0]["name"] == "mock"
    assert payload["providers"][0]["label"] == "Mock Provider"
    assert payload["providers"][1]["name"] == "openai"
    assert payload["providers"][1]["configured"] is False
    assert [skill["domain"] for skill in payload["skills"]] == [
        domain.value for domain in TopicDomain
    ]


def test_render_manim_endpoint_rejects_unsafe_script(monkeypatch) -> None:
    called: list[str] = []

    def fake_render(**kwargs):
        called.append("rendered")
        raise AssertionError("render should not be called")

    monkeypatch.setattr(orchestrator.preview_video_renderer, "render", fake_render)

    response = client.post(
        "/api/v1/manim/render",
        json={
            "source": "from manim import *\nimport os\n\nclass Demo(Scene):\n    def construct(self):\n        self.play(Write(Text('unsafe')))\n        self.wait(0.5)\n",
            "scene_class_name": "Demo",
            "require_real": True,
        },
    )

    assert response.status_code == 400
    assert "os" in response.json()["detail"].lower()
    assert called == []


def test_runtime_catalog_allows_local_dev_cors_origin() -> None:
    response = client.get(
        "/api/v1/runtime",
        headers={"Origin": "http://127.0.0.1:4174"},
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://127.0.0.1:4174"


def test_runtime_settings_endpoint_updates_tts_configuration() -> None:
    previous_settings = orchestrator.runtime_settings
    restore_payload = RuntimeSettingsRequest(
        mock_provider_enabled=previous_settings.mock_provider_enabled,
        tts=TTSSettingsRequest(
            enabled=previous_settings.tts.enabled,
            backend=previous_settings.tts.backend,
            model=previous_settings.tts.model,
            base_url=previous_settings.tts.base_url,
            api_key=previous_settings.tts.api_key,
            voice=previous_settings.tts.voice,
            rate_wpm=previous_settings.tts.rate_wpm,
            speed=previous_settings.tts.speed,
            max_chars=previous_settings.tts.max_chars,
            timeout_s=previous_settings.tts.timeout_s,
        ),
    )

    try:
        response = client.put(
            "/api/v1/runtime/settings",
            json={
                "mock_provider_enabled": False,
                "tts": {
                    "enabled": True,
                    "backend": "openai_compatible",
                    "model": "mimotts-v2",
                    "base_url": "https://tts.example.com/v1",
                    "api_key": "secret-tts-key",
                    "voice": "calm_female",
                    "rate_wpm": 136,
                    "speed": 0.82,
                    "max_chars": 1800,
                    "timeout_s": 90,
                },
            },
        )
        assert response.status_code == 200
        payload = response.json()
        assert payload["mock_provider_enabled"] is False
        assert payload["tts"]["backend"] == "openai_compatible"
        assert payload["tts"]["model"] == "mimotts-v2"
        assert payload["tts"]["base_url"] == "https://tts.example.com/v1"
        assert payload["tts"]["api_key_configured"] is True
        assert payload["tts"]["voice"] == "calm_female"

        runtime_response = client.get("/api/v1/runtime")
        assert runtime_response.status_code == 200
        runtime_payload = runtime_response.json()
        assert runtime_payload["settings"]["mock_provider_enabled"] is False
        assert runtime_payload["settings"]["tts"]["api_key_configured"] is True
        assert all(provider["name"] != "mock" for provider in runtime_payload["providers"])
        assert runtime_payload["default_generation_provider"] == "openai"
    finally:
        orchestrator.update_runtime_settings(restore_payload)


def test_upsert_custom_provider_refreshes_runtime_dependencies(monkeypatch) -> None:
    payload = CustomProviderUpsertRequest(
        name="refresh-stub",
        label="Refresh Stub",
        base_url="https://example.com/v1",
        model="refresh-model",
        api_key="secret",
    )
    descriptor = ProviderDescriptor(
        name="refresh-stub",
        label="Refresh Stub",
        kind=ProviderKind.OPENAI_COMPATIBLE,
        model="refresh-model",
        description="refresh test",
        configured=True,
        is_custom=True,
    )
    calls: list[str] = []

    monkeypatch.setattr(
        orchestrator.provider_registry,
        "upsert_custom_provider",
        lambda value: descriptor,
    )
    monkeypatch.setattr(
        orchestrator,
        "_refresh_runtime_dependencies",
        lambda: calls.append("refreshed"),
    )

    returned = orchestrator.upsert_custom_provider(payload)

    assert returned == descriptor
    assert calls == ["refreshed"]


def test_delete_custom_provider_refreshes_runtime_dependencies_when_deleted(
    monkeypatch,
) -> None:
    calls: list[str] = []

    monkeypatch.setattr(
        orchestrator.provider_registry,
        "delete_custom_provider",
        lambda name: True,
    )
    monkeypatch.setattr(
        orchestrator,
        "_refresh_runtime_dependencies",
        lambda: calls.append("refreshed"),
    )

    deleted = orchestrator.delete_custom_provider("refresh-stub")

    assert deleted is True
    assert calls == ["refreshed"]


def test_generate_prompt_reference_endpoint(monkeypatch) -> None:
    class PromptStubProvider:
        descriptor = ProviderDescriptor(
            name="prompt-stub",
            label="Prompt Stub",
            kind=ProviderKind.OPENAI_COMPATIBLE,
            model="prompt-model-v1",
            description="stub prompt authoring provider",
            configured=True,
        )

        def model_for_stage(self, stage: str) -> str:
            assert stage == "planning"
            return "prompt-model-v1"

        def complete_text(
            self,
            *,
            stage: str,
            system_prompt: str,
            user_prompt: str,
            source_image: str | None = None,
        ) -> tuple[str, str]:
            assert stage == "planning"
            assert "router -> planner -> coder -> critic -> repair" in user_prompt
            return (
                """
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
                """.strip(),
                "raw markdown output",
            )

    original_get = orchestrator.provider_registry.get

    def fake_get(name: str):
        if name == "prompt-stub":
            return PromptStubProvider()
        return original_get(name)

    monkeypatch.setattr(orchestrator.provider_registry, "get", fake_get)

    response = client.post(
        "/api/v1/prompts/reference",
        json={
            "subject": "algorithm",
            "provider": "prompt-stub",
            "notes": "强调循环不变量和边界同步。",
            "write": False,
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["subject"] == "algorithm"
    assert payload["provider"] == "prompt-stub"
    assert payload["model"] == "prompt-model-v1"
    assert payload["wrote_file"] is False
    assert payload["output_path"].endswith(
        "skills/generate-subject-manim-prompts/references/algorithm.md"
    )
    assert payload["markdown"].startswith("# Algorithm Prompt Guidance")


def test_generate_custom_subject_prompt_endpoint(monkeypatch) -> None:
    class PromptStubProvider:
        descriptor = ProviderDescriptor(
            name="prompt-stub",
            label="Prompt Stub",
            kind=ProviderKind.OPENAI_COMPATIBLE,
            model="prompt-model-v1",
            description="stub prompt authoring provider",
            configured=True,
        )

        def model_for_stage(self, stage: str) -> str:
            assert stage == "planning"
            return "prompt-model-v1"

        def complete_text(
            self,
            *,
            stage: str,
            system_prompt: str,
            user_prompt: str,
            source_image: str | None = None,
        ) -> tuple[str, str]:
            assert stage == "planning"
            assert "new subject tool" in user_prompt.lower()
            assert "transport phenomena" in user_prompt.lower()
            return (
                """
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
                """.strip(),
                "raw markdown output",
            )

    original_get = orchestrator.provider_registry.get

    def fake_get(name: str):
        if name == "prompt-stub":
            return PromptStubProvider()
        return original_get(name)

    monkeypatch.setattr(orchestrator.provider_registry, "get", fake_get)

    response = client.post(
        "/api/v1/prompts/custom-subject",
        json={
            "subject_name": "Transport Phenomena",
            "provider": "prompt-stub",
            "summary": "面向传热、传质、动量传递的教学动画提示词。",
            "notes": "强调守恒量、通量方向与边界条件。",
            "write": False,
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["subject_name"] == "Transport Phenomena"
    assert payload["provider"] == "prompt-stub"
    assert payload["model"] == "prompt-model-v1"
    assert payload["slug"].startswith("transport-phenomena-")
    assert payload["wrote_file"] is False
    assert payload["output_path"].endswith(
        f"skills/generated-subject-prompts/{payload['slug']}.md"
    )
    assert payload["markdown"].startswith("# Transport Phenomena Prompt Guidance")


def test_prepare_manim_endpoint_extracts_and_wraps_code() -> None:
    response = client.post(
        "/api/v1/manim/prepare",
        json={
            "source": """
<think>
internal reasoning
</think>

```python3
def construct(self):
    text = Text("hello")
    self.play(Write(text))
```
            """.strip()
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["is_runnable"] is True
    assert payload["scene_class_name"] == "GeneratedScene"
    assert "from manim import *" in payload["code"]
    assert "class GeneratedScene(Scene):" in payload["code"]
    assert "def construct(self):" in payload["code"]
    assert payload["diagnostics"]


def test_render_manim_endpoint_supports_fallback_backend() -> None:
    response = client.post(
        "/api/v1/manim/render",
        json={
            "source": """
```python
from manim import *

class Demo(Scene):
    def construct(self):
        title = Text("hello render")
        self.play(Write(title))
        self.wait(0.5)
```
            """.strip(),
            "require_real": False,
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["preview_video_url"]
    assert payload["render_backend"] in {"manim-cli", "storyboard-fallback"}


def test_render_manim_endpoint_uses_embedded_fallback_without_ffmpeg(monkeypatch) -> None:
    fallback_backend = orchestrator.preview_video_renderer.backends["fallback"]
    monkeypatch.setattr(fallback_backend, "ffmpeg_binary", None)

    response = client.post(
        "/api/v1/manim/render",
        json={
            "source": """
```python
from manim import *

class Demo(Scene):
    def construct(self):
        title = Text("hello render")
        self.play(Write(title))
        self.wait(0.5)
```
            """.strip(),
            "require_real": False,
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["render_backend"] == "storyboard-fallback"

    video_response = client.get(payload["preview_video_url"])
    assert video_response.status_code == 200
    assert video_response.content


def test_render_manim_endpoint_can_embed_narration(monkeypatch, tmp_path) -> None:
    def fake_render(
        *,
        script: str,
        request_id: str,
        scene_class_name: str,
        require_real: bool,
        ui_theme: str | None = None,
    ):
        output = tmp_path / f"{request_id}.mp4"
        output.write_bytes(b"fake")
        return PreviewVideoArtifacts(
            file_path=output,
            url="/media/fake-render.mp4",
            backend="storyboard-fallback",
        )

    recorded: dict[str, str] = {}

    def fake_embed(*, request_id: str, video_path, narration_text: str):
        recorded["request_id"] = request_id
        recorded["text"] = narration_text
        return type(
            "NarrationArtifacts",
            (),
            {
                "tts_backend": "say",
                "audio_path": tmp_path / f"{request_id}.m4a",
            },
        )()

    monkeypatch.setattr(orchestrator.preview_video_renderer, "render", fake_render)
    monkeypatch.setattr(orchestrator.video_narration_service, "is_available", lambda: True)
    monkeypatch.setattr(orchestrator.video_narration_service, "embed_narration", fake_embed)

    response = client.post(
        "/api/v1/manim/render",
        json={
            "source": """
```python
from manim import *

class Demo(Scene):
    def construct(self):
        title = Text("hello render")
        self.play(Write(title))
        self.wait(0.5)
```
            """.strip(),
            "require_real": False,
            "narration_text": "这是一个测试旁白。",
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["preview_video_url"] == "/media/fake-render.mp4"
    assert any("嵌入旁白" in diagnostic for diagnostic in payload["diagnostics"])
    assert recorded["text"] == "这是一个测试旁白。"


def test_pipeline_runs_history_endpoints() -> None:
    pipeline_response = client.post(
        "/api/v1/pipeline",
        json={
            "prompt": "请讲解动态规划中的状态定义与转移。",
            "domain": "algorithm",
            "provider": "mock",
            "sandbox_mode": "dry_run",
            "persist_run": True,
            "source_image": "data:image/png;base64,ZmFrZS1pbWFnZS1ieXRlcw==",
            "source_image_name": "dp.png",
        },
    )
    assert pipeline_response.status_code == 200
    request_id = pipeline_response.json()["request_id"]

    list_response = client.get("/api/v1/runs")
    assert list_response.status_code == 200
    runs = list_response.json()
    run_summary = next(item for item in runs if item["request_id"] == request_id)
    assert run_summary["status"] == "succeeded"
    assert run_summary["output_mode"] == "video"

    detail_response = client.get(f"/api/v1/runs/{request_id}")
    assert detail_response.status_code == 200
    detail = detail_response.json()
    assert detail["status"] == "succeeded"
    assert detail["request"]["prompt"] == "请讲解动态规划中的状态定义与转移。"
    assert detail["request"]["domain"] == "algorithm"
    assert detail["request"]["source_image"] is None
    assert detail["request"]["source_image_name"] == "dp.png"
    assert detail["request"]["router_provider"] == "mock"
    assert detail["request"]["generation_provider"] == "mock"
    assert detail["response"]["request_id"] == request_id

    hydrated_detail_response = client.get(
        f"/api/v1/runs/{request_id}?include_source_image=true"
    )
    assert hydrated_detail_response.status_code == 200
    hydrated_detail = hydrated_detail_response.json()
    assert (
        hydrated_detail["request"]["source_image"]
        == "data:image/png;base64,ZmFrZS1pbWFnZS1ieXRlcw=="
    )


def test_pipeline_submit_runs_in_background(monkeypatch, tmp_path) -> None:
    _stub_preview_renderer(monkeypatch, tmp_path)
    _stub_html_preview_dir(monkeypatch, tmp_path)

    submit_response = client.post(
        "/api/v1/pipeline/submit",
        json={
            "prompt": "请讲解快速排序的分区过程。",
            "provider": "mock",
            "sandbox_mode": "dry_run",
            "output_mode": "html",
        },
    )
    assert submit_response.status_code == 200
    payload = submit_response.json()
    assert payload["status"] == "queued"

    request_id = payload["request_id"]
    detail = _wait_for_run_status(request_id)
    assert detail["status"] == "succeeded"
    assert detail["request"]["prompt"] == "请讲解快速排序的分区过程。"
    assert detail["request"]["output_mode"] == "html"
    assert detail["response"]["request_id"] == request_id
    assert detail["response"]["preview_html_url"] == f"/api/v1/html_preview/{request_id}.html"
    assert detail["response"]["preview_video_url"] is None

    html_response = client.get(detail["response"]["preview_html_url"])
    assert html_response.status_code == 200
    assert "text/html" in html_response.headers["content-type"]
    saved_file = tmp_path / f"{request_id}.html"
    assert saved_file.exists()
    assert html_response.text == saved_file.read_text(encoding="utf-8")
    assert detail["response"]["renderer_script"] == html_response.text

    list_response = client.get("/api/v1/runs")
    assert list_response.status_code == 200
    runs = list_response.json()
    run_summary = next(item for item in runs if item["request_id"] == request_id)
    assert run_summary["status"] == "succeeded"
    assert run_summary["output_mode"] == "html"


def test_pipeline_submit_persists_html_fallback_reason_without_raw_output(
    monkeypatch, tmp_path
) -> None:
    _stub_html_preview_dir(monkeypatch, tmp_path)

    original_get = orchestrator.provider_registry.get
    mock_provider = original_get("mock")

    class BrokenHtmlProvider:
        descriptor = ProviderDescriptor(
            name="broken-html-persisted",
            label="Broken HTML Persisted Provider",
            kind=ProviderKind.OPENAI_COMPATIBLE,
            model="broken-html-model",
            description="broken html provider",
            configured=True,
        )

        def _chat_text(self, **kwargs):
            return (
                """
```json
{
  "title": "Broken JSON",
  "steps": [
    {"id": "step-1", "title": "坏数据", "narration": "缺少收尾"
```
                """.strip(),
                {},
            )

        def model_for_stage(self, stage: str) -> str:
            return "broken-html-model"

        def route(self, *args, **kwargs):
            raise AssertionError("route should not be called")

        def plan(self, *args, **kwargs):
            return mock_provider.plan(*args, **kwargs)

        def code(self, *args, **kwargs):
            return mock_provider.code(*args, **kwargs)

        def critique(self, *args, **kwargs):
            return mock_provider.critique(*args, **kwargs)

    monkeypatch.setattr(
        orchestrator.provider_registry,
        "get",
        lambda name=None: BrokenHtmlProvider()
        if name == "broken-html-persisted"
        else original_get(name),
    )

    submit_response = client.post(
        "/api/v1/pipeline/submit",
        json={
            "prompt": "请生成一个可交互的汉诺塔 HTML 动画。",
            "provider": "broken-html-persisted",
            "generation_provider": "broken-html-persisted",
            "router_provider": "mock",
            "sandbox_mode": "dry_run",
            "output_mode": "html",
        },
    )
    assert submit_response.status_code == 200

    request_id = submit_response.json()["request_id"]
    detail = _wait_for_run_status(request_id)
    assert detail["status"] == "succeeded"

    traces = {
        trace["agent"]: trace for trace in detail["response"]["runtime"]["agent_traces"]
    }
    assert "parse:not-html" in traces["html_coder"]["summary"]
    assert traces["html_coder"]["raw_output"] is None
    assert any(
        diagnostic["agent"] == "html_coder"
        and "parse:not-html" in diagnostic["message"]
        for diagnostic in detail["response"]["diagnostics"]
    )

    raw_detail_response = client.get(f"/api/v1/runs/{request_id}?include_raw_output=true")
    assert raw_detail_response.status_code == 200
    raw_detail = raw_detail_response.json()
    raw_traces = {
        trace["agent"]: trace
        for trace in raw_detail["response"]["runtime"]["agent_traces"]
    }
    assert raw_traces["html_coder"]["raw_output"]


def test_pipeline_submit_persists_failure(monkeypatch) -> None:
    def raise_invoke_error(*args, **kwargs):
        raise RuntimeError("provider exploded")

    monkeypatch.setattr(orchestrator.coder, "run", raise_invoke_error)

    submit_response = client.post(
        "/api/v1/pipeline/submit",
        json={
            "prompt": "请讲解哈希表的冲突处理。",
            "provider": "mock",
            "sandbox_mode": "dry_run",
        },
    )
    assert submit_response.status_code == 200
    request_id = submit_response.json()["request_id"]

    detail = _wait_for_run_status(request_id)
    assert detail["status"] == "failed"
    assert "RuntimeError: provider exploded" in detail["error_message"]
    assert "error_id=" in detail["error_message"]
    assert detail["response"] is None


def test_pipeline_unhandled_error_returns_detail_and_error_id(
    monkeypatch,
) -> None:
    def raise_unhandled(*args, **kwargs):
        raise RuntimeError("unexpected renderer failure")

    error_client = TestClient(app, raise_server_exceptions=False)
    monkeypatch.setattr(orchestrator, "run", raise_unhandled)

    response = error_client.post(
        "/api/v1/pipeline",
        json={
            "prompt": "请讲解最短路算法。",
            "provider": "mock",
            "sandbox_mode": "dry_run",
        },
    )

    assert response.status_code == 500
    payload = response.json()
    assert payload["detail"] == "RuntimeError: unexpected renderer failure"
    assert payload["error_type"] == "RuntimeError"
    assert len(payload["error_id"]) >= 8
    assert "journalctl -u metaview-api" in payload["log_hint"]


def test_pipeline_run_not_found_returns_error_metadata() -> None:
    response = client.get("/api/v1/runs/not-a-real-run")

    assert response.status_code == 404
    payload = response.json()
    assert payload["detail"] == "Pipeline run not found"
    assert payload["status_code"] == 404
    assert len(payload["error_id"]) >= 8


def test_pipeline_routes_source_code_to_code_domain() -> None:
    response = client.post(
        "/api/v1/pipeline",
        json={
            "prompt": "请根据源码讲解这个算法的状态变化。",
            "provider": "mock",
            "source_code_language": "cpp",
            "source_code": """
#include <vector>
using namespace std;

int binarySearch(vector<int>& nums, int target) {
    int left = 0, right = nums.size() - 1;
    while (left <= right) {
        int mid = left + (right - left) / 2;
        if (nums[mid] == target) return mid;
        if (nums[mid] < target) left = mid + 1;
        else right = mid - 1;
    }
    return -1;
}
            """.strip(),
            "sandbox_mode": "dry_run",
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["cir"]["domain"] == "code"
    assert payload["runtime"]["skill"]["id"] == "source-code-algorithm-viz"
    assert "binary search" in payload["cir"]["summary"].lower()


def test_pipeline_routes_physics_prompt_to_physics_domain(monkeypatch, tmp_path) -> None:
    payload = _run_pipeline(
        {
            "prompt": "请根据题图讲解斜面上小球的受力、加速度与运动轨迹。",
            "provider": "mock",
            "source_image": "data:image/png;base64,ZmFrZS1pbWFnZS1ieXRlcw==",
            "source_image_name": "inclined-plane.png",
            "sandbox_mode": "dry_run",
            "persist_run": False,
        },
        monkeypatch,
        tmp_path,
    )
    assert payload["cir"]["domain"] == "physics"
    assert payload["runtime"]["skill"]["id"] == "physics-simulation-viz"
    assert payload["runtime"]["skill"]["supports_image_input"] is True
    assert payload["cir"]["steps"][0]["title"] == "题图解析"
    assert payload["cir"]["steps"][1]["title"] == "受力建模"
    assert "静态题图" in payload["cir"]["summary"]


def test_pipeline_routes_chemistry_prompt_to_chemistry_domain(monkeypatch, tmp_path) -> None:
    payload = _run_pipeline(
        {
            "prompt": "请可视化讲解分子结构中化学键的变化以及反应过程。",
            "provider": "mock",
            "sandbox_mode": "dry_run",
            "persist_run": False,
        },
        monkeypatch,
        tmp_path,
    )
    assert payload["cir"]["domain"] == "chemistry"
    assert payload["runtime"]["skill"]["id"] == "molecular-structure-viz"
    assert [step["title"] for step in payload["cir"]["steps"]] == [
        "结构识别",
        "反应推进",
        "结果解释",
    ]
    assert "化学题" in payload["cir"]["summary"]


def test_pipeline_routes_biology_prompt_to_biology_domain(monkeypatch, tmp_path) -> None:
    payload = _run_pipeline(
        {
            "prompt": "请可视化讲解细胞有丝分裂各阶段的结构变化和调控过程。",
            "provider": "mock",
            "sandbox_mode": "dry_run",
            "persist_run": False,
        },
        monkeypatch,
        tmp_path,
    )
    assert payload["cir"]["domain"] == "biology"
    assert payload["runtime"]["skill"]["id"] == "biology-process-viz"
    assert [step["title"] for step in payload["cir"]["steps"]] == [
        "结构定位",
        "过程流转",
        "功能结论",
    ]
    assert "生物题" in payload["cir"]["summary"]


def test_pipeline_routes_geography_prompt_to_geography_domain(monkeypatch, tmp_path) -> None:
    payload = _run_pipeline(
        {
            "prompt": "请可视化讲解水循环中的蒸发、降水与径流如何在区域内演化。",
            "provider": "mock",
            "sandbox_mode": "dry_run",
            "persist_run": False,
        },
        monkeypatch,
        tmp_path,
    )
    assert payload["cir"]["domain"] == "geography"
    assert payload["runtime"]["skill"]["id"] == "geospatial-process-viz"
    assert [step["title"] for step in payload["cir"]["steps"]] == [
        "空间底图",
        "时空演化",
        "区域解释",
    ]
    assert "地理题" in payload["cir"]["summary"]


def test_pipeline_rejects_disabled_domain(monkeypatch) -> None:
    monkeypatch.setattr(
        orchestrator,
        "skill_registry",
        SubjectSkillRegistry(
            enabled_domains=(
                TopicDomain.ALGORITHM,
                TopicDomain.MATH,
                TopicDomain.CODE,
            )
        ),
    )
    response = client.post(
        "/api/v1/pipeline",
        json={
            "prompt": "请根据题图讲解斜面上小球的受力、加速度与运动轨迹。",
            "provider": "mock",
            "source_image": "data:image/png;base64,ZmFrZS1pbWFnZS1ieXRlcw==",
            "source_image_name": "inclined-plane.png",
            "sandbox_mode": "dry_run",
        },
    )
    assert response.status_code == 400
    assert "未启用" in response.json()["detail"]


def test_custom_provider_crud() -> None:
    create_response = client.post(
        "/api/v1/providers/custom",
        json={
            "name": "local-ollama",
            "label": "Local Ollama",
            "base_url": "http://127.0.0.1:11434/v1",
            "model": "qwen2.5-coder",
            "router_model": "qwen2.5-coder:3b",
            "coding_model": "qwen2.5-coder:32b",
            "api_key": "",
            "description": "本地自定义 provider",
            "temperature": 0.1,
            "supports_vision": True,
            "enabled": True,
        },
    )
    assert create_response.status_code == 200
    payload = create_response.json()
    assert payload["name"] == "local-ollama"
    assert payload["is_custom"] is True
    assert payload["supports_vision"] is True
    assert payload["stage_models"] == {
        "router": "qwen2.5-coder:3b",
        "coding": "qwen2.5-coder:32b",
    }

    runtime_response = client.get("/api/v1/runtime")
    providers = runtime_response.json()["providers"]
    local_provider = next(provider for provider in providers if provider["name"] == "local-ollama")
    assert local_provider["stage_models"] == {
        "router": "qwen2.5-coder:3b",
        "coding": "qwen2.5-coder:32b",
    }

    delete_response = client.delete("/api/v1/providers/custom/local-ollama")
    assert delete_response.status_code == 200


def test_runtime_catalog_prefers_configured_provider_when_mock_disabled() -> None:
    previous_settings = orchestrator.runtime_settings
    restore_payload = RuntimeSettingsRequest(
        mock_provider_enabled=previous_settings.mock_provider_enabled,
        tts=TTSSettingsRequest(
            enabled=previous_settings.tts.enabled,
            backend=previous_settings.tts.backend,
            model=previous_settings.tts.model,
            base_url=previous_settings.tts.base_url,
            api_key=previous_settings.tts.api_key,
            voice=previous_settings.tts.voice,
            rate_wpm=previous_settings.tts.rate_wpm,
            speed=previous_settings.tts.speed,
            max_chars=previous_settings.tts.max_chars,
            timeout_s=previous_settings.tts.timeout_s,
        ),
    )

    create_response = client.post(
        "/api/v1/providers/custom",
        json={
            "name": "primary-ollama",
            "label": "Primary Ollama",
            "base_url": "http://127.0.0.1:11434/v1",
            "model": "qwen2.5-coder:14b",
            "router_model": "qwen2.5-coder:3b",
            "description": "默认主 provider",
            "api_key": "",
            "temperature": 0.2,
            "supports_vision": False,
            "enabled": True,
        },
    )
    assert create_response.status_code == 200

    try:
        update_response = client.put(
            "/api/v1/runtime/settings",
            json={
                "mock_provider_enabled": False,
                "tts": restore_payload.tts.model_dump(mode="json"),
            },
        )
        assert update_response.status_code == 200

        runtime_response = client.get("/api/v1/runtime")
        assert runtime_response.status_code == 200
        payload = runtime_response.json()
        assert payload["default_provider"] == "primary-ollama"
        assert payload["default_router_provider"] == "primary-ollama"
        assert payload["default_generation_provider"] == "primary-ollama"
        assert all(provider["name"] != "mock" for provider in payload["providers"])
    finally:
        orchestrator.update_runtime_settings(restore_payload)
        delete_response = client.delete("/api/v1/providers/custom/primary-ollama")
        assert delete_response.status_code == 200
    assert delete_response.json()["deleted"] is True


def test_custom_provider_test_endpoint(monkeypatch) -> None:
    from app.services.providers.openai import OpenAICompatibleProvider

    def fake_test_connection(self):
        return "pong", ("pong raw output " * 80).strip()

    monkeypatch.setattr(OpenAICompatibleProvider, "test_connection", fake_test_connection)

    response = client.post(
        "/api/v1/providers/custom/test",
        json={
            "name": "test-ollama",
            "label": "Test Ollama",
            "base_url": "http://127.0.0.1:11434/v1",
            "model": "qwen2.5-coder",
            "test_model": "qwen2.5-coder:1.5b",
            "api_key": "",
            "description": "测试 provider",
            "temperature": 0.1,
            "supports_vision": False,
            "enabled": True,
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["message"] == "pong"
    assert payload["model"] == "qwen2.5-coder:1.5b"
    assert "pong raw output" in payload["raw_excerpt"]
    assert payload["raw_excerpt"].endswith("pong raw output")


def test_custom_provider_addition_preserves_disabled_state() -> None:
    create_response = client.post(
        "/api/v1/providers/custom",
        json={
            "name": "disabled-ollama",
            "label": "Disabled Ollama",
            "base_url": "http://127.0.0.1:11434/v1/",
            "model": "qwen2.5-coder",
            "api_key": "",
            "description": "默认禁用的 provider",
            "temperature": 0.3,
            "supports_vision": False,
            "enabled": False,
        },
    )
    assert create_response.status_code == 200

    payload = create_response.json()
    assert payload["name"] == "disabled-ollama"
    assert payload["configured"] is False
    assert payload["is_custom"] is True
    assert payload["base_url"] == "http://127.0.0.1:11434/v1"

    runtime_response = client.get("/api/v1/runtime")
    assert runtime_response.status_code == 200
    providers = runtime_response.json()["providers"]
    disabled_provider = next(
        provider for provider in providers if provider["name"] == "disabled-ollama"
    )
    assert disabled_provider["configured"] is False
    assert disabled_provider["base_url"] == "http://127.0.0.1:11434/v1"

    pipeline_response = client.post(
        "/api/v1/pipeline",
        json={
            "prompt": "请讲解二分查找。",
            "router_provider": "mock",
            "generation_provider": "disabled-ollama",
            "sandbox_mode": "dry_run",
            "persist_run": False,
        },
    )
    assert pipeline_response.status_code == 400
    assert "Provider disabled-ollama 未配置" in pipeline_response.json()["detail"]

    delete_response = client.delete("/api/v1/providers/custom/disabled-ollama")
    assert delete_response.status_code == 200
    assert delete_response.json()["deleted"] is True


def test_custom_provider_edit_preserves_existing_api_key() -> None:
    first_response = client.post(
        "/api/v1/providers/custom",
        json={
            "name": "editable-ollama",
            "label": "Editable Ollama",
            "base_url": "http://127.0.0.1:11434/v1",
            "model": "qwen2.5-coder",
            "router_model": "qwen2.5-coder:3b",
            "api_key": "secret-key",
            "description": "原始 provider",
            "temperature": 0.4,
            "supports_vision": False,
            "enabled": True,
        },
    )
    assert first_response.status_code == 200

    second_response = client.post(
        "/api/v1/providers/custom",
        json={
            "name": "editable-ollama",
            "label": "Editable Ollama Updated",
            "base_url": "http://127.0.0.1:11434/v1/",
            "model": "qwen3-coder",
            "api_key": "",
            "router_model": "",
            "planning_model": "qwen3-thinking",
            "description": "更新后的 provider",
            "temperature": 0.6,
            "supports_vision": True,
            "enabled": True,
        },
    )
    assert second_response.status_code == 200

    stored = orchestrator.custom_provider_repository.get("editable-ollama")
    assert stored is not None
    assert stored.api_key == "secret-key"
    assert stored.label == "Editable Ollama Updated"
    assert stored.model == "qwen3-coder"
    assert stored.router_model is None
    assert stored.planning_model == "qwen3-thinking"
    assert stored.supports_vision is True

    delete_response = client.delete("/api/v1/providers/custom/editable-ollama")
    assert delete_response.status_code == 200


def test_pipeline_supports_dual_provider_orchestration(monkeypatch) -> None:
    class RouterStubProvider:
        descriptor = ProviderDescriptor(
            name="router-stub",
            label="Router Stub",
            kind=ProviderKind.MOCK,
            model="router-model-v1",
            description="stub router",
            configured=True,
        )

        def route(
            self,
            prompt: str,
            source_image: str | None = None,
            source_code: str | None = None,
        ) -> tuple[TopicDomain, AgentTrace]:
            return (
                TopicDomain.MATH,
                AgentTrace(
                    agent="router",
                    provider=self.descriptor.name,
                    model=self.descriptor.model,
                    summary="router stub picked math",
                    raw_output='{"domain":"math","reason":"router stub picked math"}',
                ),
            )

        def plan(self, *args, **kwargs):
            raise AssertionError("router provider should not handle planning")

        def code(self, *args, **kwargs):
            raise AssertionError("router provider should not handle coding")

        def critique(self, *args, **kwargs):
            raise AssertionError("router provider should not handle critique")

    class GenerationStubProvider:
        descriptor = ProviderDescriptor(
            name="generation-stub",
            label="Generation Stub",
            kind=ProviderKind.OPENAI_COMPATIBLE,
            model="generation-model-v2",
            description="stub generation",
            configured=True,
        )

        def route(self, *args, **kwargs):
            raise AssertionError("generation provider should not handle routing")

        def plan(
            self,
            prompt: str,
            domain: str,
            skill_brief: str,
            source_image: str | None = None,
            source_code: str | None = None,
            source_code_language: str | None = None,
        ) -> tuple[PlanningHints, AgentTrace]:
            return (
                PlanningHints(
                    focus="突出函数和切线",
                    concepts=["函数", "切线", "变化率"],
                    warnings=[],
                ),
                AgentTrace(
                    agent="planner",
                    provider=self.descriptor.name,
                    model=self.descriptor.model,
                    summary="generation stub planned math flow",
                    raw_output='{"focus":"突出函数和切线","concepts":["函数","切线","变化率"]}',
                ),
            )

        def code(self, cir: CirDocument) -> tuple[CodingHints, AgentTrace]:
            return (
                CodingHints(
                    target="python-manim",
                    style_notes=["keep animation deterministic"],
                    renderer_script="""
<analysis>
hidden
</analysis>

```python
from manim import *

class ProviderRenderer(Scene):
    def construct(self):
        title = Text("provider renderer")
        self.play(Write(title))
        self.wait(0.5)
```
                    """.strip(),
                ),
                AgentTrace(
                    agent="coder",
                    provider=self.descriptor.name,
                    model=self.descriptor.model,
                    summary=f"generation stub coded {len(cir.steps)} steps",
                    raw_output="```ts\nprovider renderer raw output\n```",
                ),
            )

        def critique(
            self,
            title: str,
            renderer_script: str,
            domain: TopicDomain,
        ) -> tuple[CritiqueHints, AgentTrace]:
            return (
                CritiqueHints(
                    checks=["check overlap", "check narration density"],
                    warnings=[],
                    blocking_issues=[],
                ),
                AgentTrace(
                    agent="critic",
                    provider=self.descriptor.name,
                    model=self.descriptor.model,
                    summary="generation stub reviewed renderer",
                    raw_output='{"checks":["check overlap"],"warnings":[]}',
                ),
            )

        def repair_code(self, cir: CirDocument, renderer_script: str, issues: list[str]):
            raise AssertionError("generation stub should not need repair for this test")

    original_get = orchestrator.provider_registry.get

    def fake_get(name: str):
        if name == "router-stub":
            return RouterStubProvider()
        if name == "generation-stub":
            return GenerationStubProvider()
        return original_get(name)

    monkeypatch.setattr(orchestrator.provider_registry, "get", fake_get)

    response = client.post(
        "/api/v1/pipeline",
        json={
            "prompt": "请讲解导数如何表示函数在一点附近的变化率。",
            "router_provider": "router-stub",
            "generation_provider": "generation-stub",
            "sandbox_mode": "dry_run",
            "persist_run": False,
        },
    )
    assert response.status_code == 200

    payload = response.json()
    traces = {trace["agent"]: trace for trace in payload["runtime"]["agent_traces"]}
    assert payload["cir"]["domain"] == "math"
    assert payload["runtime"]["router_provider"]["name"] == "router-stub"
    assert payload["runtime"]["generation_provider"]["name"] == "generation-stub"
    assert "class ProviderRenderer(Scene):" in payload["renderer_script"]
    assert "provider renderer" in payload["renderer_script"]
    assert traces["router"]["provider"] == "router-stub"
    assert traces["planner"]["provider"] == "generation-stub"
    assert traces["coder"]["provider"] == "generation-stub"
    assert traces["critic"]["provider"] == "generation-stub"
    assert traces["planner"]["raw_output"] is not None
    assert "突出函数和切线" in traces["planner"]["raw_output"]
    assert traces["coder"]["raw_output"] is not None
    assert "provider renderer raw output" in traces["coder"]["raw_output"]


def test_pipeline_returns_502_when_generation_provider_times_out(monkeypatch) -> None:
    class TimeoutGenerationProvider:
        descriptor = ProviderDescriptor(
            name="timeout-stub",
            label="Timeout Stub",
            kind=ProviderKind.OPENAI_COMPATIBLE,
            model="timeout-model-v1",
            description="stub timeout",
            configured=True,
        )

        def route(self, *args, **kwargs):
            raise AssertionError("generation provider should not handle routing")

        def plan(self, *args, **kwargs):
            raise ProviderInvocationError(
                "Provider 请求超时（3s），请检查模型服务是否可达。"
            )

        def code(self, *args, **kwargs):
            raise AssertionError("timeout provider should fail during planning")

        def critique(self, *args, **kwargs):
            raise AssertionError("timeout provider should fail during planning")

    original_get = orchestrator.provider_registry.get

    def fake_get(name: str):
        if name == "timeout-stub":
            return TimeoutGenerationProvider()
        return original_get(name)

    monkeypatch.setattr(orchestrator.provider_registry, "get", fake_get)

    response = client.post(
        "/api/v1/pipeline",
        json={
            "prompt": "请讲解二分查找边界收缩。",
            "router_provider": "mock",
            "generation_provider": "timeout-stub",
            "sandbox_mode": "dry_run",
            "persist_run": False,
        },
    )
    assert response.status_code == 502
    assert "Provider 请求超时" in response.json()["detail"]


def test_pipeline_repairs_critic_blocking_issues_before_render(monkeypatch, tmp_path) -> None:
    class RepairingProvider:
        descriptor = ProviderDescriptor(
            name="repairing-stub",
            label="Repairing Stub",
            kind=ProviderKind.OPENAI_COMPATIBLE,
            model="repair-model-v1",
            description="stub repair flow",
            configured=True,
        )

        def route(self, *args, **kwargs):
            raise AssertionError("generation provider should not handle routing")

        def plan(self, *args, **kwargs):
            return (
                PlanningHints(
                    focus="突出二分查找边界收缩",
                    concepts=["left", "mid", "right"],
                    warnings=[],
                ),
                AgentTrace(
                    agent="planner",
                    provider=self.descriptor.name,
                    model=self.descriptor.model,
                    summary="planned binary search",
                ),
            )

        def code(self, cir: CirDocument):
            return (
                CodingHints(
                    target="python-manim",
                    style_notes=[],
                    renderer_script="""
```python
from manim import *

class BrokenScene(Scene):
    def construct(self):
        title = Text("broken")
        def move_pointer():
            self.play(title.animate.shift(RIGHT * 0.5), run_time=0.1)
        self.play(move_pointer())
        self.wait(0.1)
```
                    """.strip(),
                ),
                AgentTrace(
                    agent="coder",
                    provider=self.descriptor.name,
                    model=self.descriptor.model,
                    summary="generated broken script",
                ),
            )

        def critique(self, title: str, renderer_script: str, domain: TopicDomain):
            if "self.play(move_pointer())" in renderer_script:
                return (
                    CritiqueHints(
                        checks=[
                            (
                                '{"name":"runtime","status":"fail",'
                                '"details":"self.play(move_pointer()) 会报错"}'
                            )
                        ],
                        warnings=[],
                        blocking_issues=["self.play(move_pointer()) 会报错"],
                    ),
                    AgentTrace(
                        agent="critic",
                        provider=self.descriptor.name,
                        model=self.descriptor.model,
                        summary="found blocking runtime issue",
                    ),
                )
            return (
                CritiqueHints(checks=["final script ok"], warnings=[], blocking_issues=[]),
                AgentTrace(
                    agent="critic",
                    provider=self.descriptor.name,
                    model=self.descriptor.model,
                    summary="final script ok",
                ),
            )

        def repair_code(self, cir: CirDocument, renderer_script: str, issues: list[str]):
            assert any("move_pointer" in issue for issue in issues)
            return (
                CodingHints(
                    target="python-manim",
                    style_notes=[],
                    renderer_script="""
```python
from manim import *

class FixedScene(Scene):
    def construct(self):
        title = Text("fixed")
        def move_pointer():
            self.play(title.animate.shift(RIGHT * 0.5), run_time=0.1)
        move_pointer()
        self.wait(0.1)
```
                    """.strip(),
                ),
                AgentTrace(
                    agent="repair",
                    provider=self.descriptor.name,
                    model=self.descriptor.model,
                    summary="repaired script",
                ),
            )

    original_get = orchestrator.provider_registry.get

    def fake_get(name: str):
        if name == "repairing-stub":
            return RepairingProvider()
        return original_get(name)

    def fake_render(
        *,
        script: str,
        request_id: str,
        cir: CirDocument,
        ui_theme: str | None = None,
    ):
        assert "self.play(move_pointer())" not in script
        assert "move_pointer()" in script
        output = tmp_path / f"{request_id}.mp4"
        output.write_bytes(b"fake")
        return PreviewVideoArtifacts(
            file_path=output,
            url="/media/fake.mp4",
            backend="manim-cli",
        )

    monkeypatch.setattr(orchestrator.provider_registry, "get", fake_get)
    monkeypatch.setattr(orchestrator.preview_video_renderer, "render", fake_render)

    response = client.post(
        "/api/v1/pipeline",
        json={
            "prompt": "请讲解二分查找边界收缩。",
            "router_provider": "mock",
            "generation_provider": "repairing-stub",
            "sandbox_mode": "dry_run",
            "persist_run": False,
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert "class FixedScene(Scene):" in payload["renderer_script"]
    assert payload["preview_video_url"] == "/media/fake.mp4"
    assert any(trace["agent"] == "repair" for trace in payload["runtime"]["agent_traces"])
    assert any("critic-review" in action for action in payload["runtime"]["repair_actions"])


def test_pipeline_embeds_preview_narration_when_available(monkeypatch, tmp_path) -> None:
    def fake_render(
        *,
        script: str,
        request_id: str,
        cir: CirDocument,
        ui_theme: str | None = None,
    ):
        captured["ui_theme"] = ui_theme or ""
        output = tmp_path / f"{request_id}.mp4"
        output.write_bytes(b"fake")
        return PreviewVideoArtifacts(
            file_path=output,
            url="/media/fake-narrated.mp4",
            backend="storyboard-fallback",
        )

    captured: dict[str, str] = {}

    def fake_build_pipeline_narration(cir: CirDocument) -> str:
        return f"{cir.title} 的自动旁白"

    def fake_embed(*, request_id: str, video_path, narration_text: str):
        captured["request_id"] = request_id
        captured["text"] = narration_text
        return type(
            "NarrationArtifacts",
            (),
            {
                "tts_backend": "say",
                "audio_path": tmp_path / f"{request_id}.m4a",
            },
        )()

    monkeypatch.setattr(orchestrator.preview_video_renderer, "render", fake_render)
    monkeypatch.setattr(
        orchestrator.video_narration_service,
        "build_pipeline_narration",
        fake_build_pipeline_narration,
    )
    monkeypatch.setattr(orchestrator.video_narration_service, "is_available", lambda: True)
    monkeypatch.setattr(orchestrator.video_narration_service, "embed_narration", fake_embed)

    response = client.post(
        "/api/v1/pipeline",
        json={
            "prompt": "请可视化讲解二分查找为什么能在有序数组中快速定位答案。",
            "provider": "mock",
            "ui_theme": "light",
            "sandbox_mode": "dry_run",
            "persist_run": False,
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["preview_video_url"] == "/media/fake-narrated.mp4"
    assert any(
        diagnostic["agent"] == "audio" and "嵌入旁白" in diagnostic["message"]
        for diagnostic in payload["diagnostics"]
    )
    assert captured["text"].endswith("自动旁白")
    assert captured["ui_theme"] == "light"


def test_pipeline_skips_preview_narration_when_disabled(monkeypatch, tmp_path) -> None:
    def fake_render(
        *,
        script: str,
        request_id: str,
        cir: CirDocument,
        ui_theme: str | None = None,
    ):
        output = tmp_path / f"{request_id}.mp4"
        output.write_bytes(b"fake")
        return PreviewVideoArtifacts(
            file_path=output,
            url="/media/fake-muted.mp4",
            backend="storyboard-fallback",
        )

    monkeypatch.setattr(orchestrator.preview_video_renderer, "render", fake_render)
    monkeypatch.setattr(
        orchestrator.video_narration_service,
        "build_pipeline_narration",
        lambda cir: (_ for _ in ()).throw(AssertionError("should not build narration")),
    )
    monkeypatch.setattr(
        orchestrator.video_narration_service,
        "embed_narration",
        lambda **kwargs: (_ for _ in ()).throw(AssertionError("should not embed narration")),
    )

    response = client.post(
        "/api/v1/pipeline",
        json={
            "prompt": "请讲解二分查找边界收缩。",
            "provider": "mock",
            "enable_narration": False,
            "sandbox_mode": "dry_run",
            "persist_run": False,
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["preview_video_url"] == "/media/fake-muted.mp4"
    assert not any(diagnostic["agent"] == "audio" for diagnostic in payload["diagnostics"])


def test_maybe_embed_preview_narration_mentions_mimotts_when_unavailable(
    monkeypatch, tmp_path
) -> None:
    preview_video = tmp_path / "preview.mp4"
    preview_video.write_bytes(b"fake")

    monkeypatch.setattr(orchestrator.video_narration_service, "is_available", lambda: False)

    messages = orchestrator.maybe_embed_preview_narration(
        request_id="demo-request",
        preview_video_path=preview_video,
        narration_text="这是测试旁白。",
    )

    assert len(messages) == 1
    assert "mimotts-v2" in messages[0]
    assert "跳过旁白嵌入" in messages[0]
