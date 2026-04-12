from __future__ import annotations

import ast
import json
import re
from dataclasses import dataclass, field

from app.schemas import CirDocument, VisualKind

_PYTHON_LANG_TAGS = frozenset({"python", "py", "python3", "py3", "manim"})
_REASONING_TAGS = ("think", "analysis", "reasoning", "reflection")
_SCENE_BASE_NAMES = {
    "Scene",
    "MovingCameraScene",
    "ThreeDScene",
    "ZoomedScene",
    "LinearTransformationScene",
}
_TEXT_MOBJECT_NAMES = {
    "Text": "_algo_vis_text",
    "MarkupText": "_algo_vis_markup_text",
    "Paragraph": "_algo_vis_paragraph",
}
_DANGEROUS_IMPORT_NAMES = {
    "os",
    "subprocess",
    "socket",
    "requests",
    "httpx",
    "urllib",
    "pathlib",
    "tempfile",
    "shutil",
    "importlib",
}
_DANGEROUS_CALL_NAMES = {
    "eval",
    "exec",
    "compile",
    "open",
    "__import__",
}
_DANGEROUS_ATTRIBUTE_CALLS = {
    ("os", "system"),
    ("os", "popen"),
    ("subprocess", "run"),
    ("subprocess", "Popen"),
    ("socket", "socket"),
    ("pathlib", "Path"),
}


_CJK_FONT_HELPER_SOURCE = """
import os
from functools import lru_cache
from pathlib import Path

def _algo_vis_is_cjk_font_family(family_name):
    normalized = family_name.casefold()
    return any(
        token in normalized
        for token in (
            "noto sans cjk",
            "noto serif cjk",
            "source han sans",
            "source han serif",
            "wenquanyi",
            "pingfang",
            "hiragino sans gb",
            "microsoft yahei",
            "simhei",
            "sarasa",
            "noto sans sc",
            "noto serif sc",
        )
    )

def _algo_vis_find_cjk_font_path():
    override = (
        os.getenv("ALGO_VIS_CJK_FONT_PATH", "").strip()
        or os.getenv("ALGO_VIS_PREVIEW_FONT_PATH", "").strip()
    )
    if override:
        candidate = Path(override).expanduser()
        if candidate.exists():
            return str(candidate)

    candidates = (
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansSC-Regular.otf",
        "/usr/share/fonts/opentype/noto/NotoSerifSC-Regular.otf",
        "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
        "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc",
        "/usr/share/fonts/truetype/sarasa-gothic/Sarasa-Regular.ttc",
        "/System/Library/Fonts/PingFang.ttc",
        "/System/Library/Fonts/Hiragino Sans GB.ttc",
    )
    for raw_path in candidates:
        candidate = Path(raw_path)
        if candidate.exists():
            return str(candidate)
    return None

def _algo_vis_resolve_font_family_from_path(font_path):
    try:
        import shutil
        import subprocess
    except Exception:
        shutil = None
        subprocess = None

    if shutil is not None and subprocess is not None:
        fc_scan = shutil.which("fc-scan")
        if fc_scan:
            result = subprocess.run(
                [fc_scan, "--format=%{family[0]}\\n", font_path],
                capture_output=True,
                text=True,
                check=False,
            )
            if result.returncode == 0:
                family = result.stdout.strip()
                if family:
                    return family

    stem = Path(font_path).stem.replace("_", " ").replace("-", " ")
    return stem if _algo_vis_is_cjk_font_family(stem) else None

@lru_cache(maxsize=1)
def _algo_vis_pick_cjk_font():
    explicit_family = os.getenv("ALGO_VIS_CJK_FONT_FAMILY", "").strip()
    explicit_path = _algo_vis_find_cjk_font_path()
    if explicit_family:
        return (explicit_family, explicit_path)

    if explicit_path:
        resolved_family = _algo_vis_resolve_font_family_from_path(explicit_path)
        if resolved_family:
            return (resolved_family, explicit_path)

    candidates = (
        "PingFang SC",
        "Hiragino Sans GB",
        "Noto Sans CJK SC",
        "Noto Serif CJK SC",
        "Noto Sans SC",
        "Noto Serif SC",
        "Source Han Sans SC",
        "Source Han Sans CN",
        "Source Han Serif SC",
        "Sarasa Gothic SC",
        "WenQuanYi Zen Hei",
        "Microsoft YaHei",
        "SimHei",
    )
    try:
        import shutil
        import subprocess
    except Exception:
        return None

    fc_match = shutil.which("fc-match")
    if not fc_match:
        return None

    for family in candidates:
        result = subprocess.run(
            [fc_match, family, "--format=%{family[0]}|%{file}\\n"],
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode != 0:
            continue
        resolved_family, _, resolved_path = result.stdout.strip().partition("|")
        if resolved_family and _algo_vis_is_cjk_font_family(resolved_family):
            return (resolved_family, resolved_path or explicit_path)
    return None

def _algo_vis_with_cjk_font(factory, *args, **kwargs):
    if not kwargs.get("font"):
        font_spec = _algo_vis_pick_cjk_font()
        if font_spec:
            font_name, font_path = font_spec
            register_font_fn = globals().get("register_font")
            if font_path and register_font_fn is not None:
                try:
                    with register_font_fn(font_path):
                        kwargs["font"] = font_name
                        return factory(*args, **kwargs)
                except Exception:
                    pass
            kwargs["font"] = font_name
    return factory(*args, **kwargs)

def _algo_vis_text(*args, **kwargs):
    return _algo_vis_with_cjk_font(Text, *args, **kwargs)

def _algo_vis_markup_text(*args, **kwargs):
    return _algo_vis_with_cjk_font(MarkupText, *args, **kwargs)

def _algo_vis_paragraph(*args, **kwargs):
    return _algo_vis_with_cjk_font(Paragraph, *args, **kwargs)
"""


class ManimScriptError(ValueError):
    pass


@dataclass(frozen=True)
class PreparedManimScript:
    code: str
    scene_class_name: str
    diagnostics: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class ManimScriptInspection:
    scene_class_names: list[str]
    warnings: list[str]
    errors: list[str]

    @property
    def is_runnable(self) -> bool:
        return not self.errors


def get_text_position(visual_kind: VisualKind) -> tuple[float, float]:
    """根据视觉类型返回文本位置偏移 (x_offset, y_offset)。

    位置说明：
    - x_offset: 水平偏移，正值向右，负值向左
    - y_offset: 垂直偏移，正值向上，负值向下

    布局策略：
    - 数组、文本、运动、地图：底部安全区（避免遮挡中心动画）
    - 流程图、分子、细胞：左侧面板（为右侧动画留空间）
    - 公式：顶部（公式通常在上方展示）
    - 图、电路：右侧面板（为左侧动画留空间）
    """
    positions = {
        VisualKind.ARRAY: (0, -2.8),  # 数组：底部
        VisualKind.FLOW: (-4.0, 0),  # 流程图：左侧
        VisualKind.FORMULA: (0, 2.8),  # 公式：顶部
        VisualKind.GRAPH: (4.0, 0),  # 图：右侧
        VisualKind.TEXT: (0, -2.8),  # 文本：底部
        VisualKind.MOTION: (0, -2.8),  # 运动：底部
        VisualKind.CIRCUIT: (4.0, 0),  # 电路：右侧
        VisualKind.MOLECULE: (-4.0, 0),  # 分子：左侧
        VisualKind.MAP: (0, -2.8),  # 地图：底部
        VisualKind.CELL: (-4.0, 0),  # 细胞：左侧
    }
    return positions.get(visual_kind, (0, -2.8))  # 默认底部


def _extract_source_code_line_ranges(source_code: str, cir: CirDocument) -> list[dict]:
    """从用户源码中提取每个 CIR 步骤对应的代码行范围。

    使用语义关键词匹配，将 CIR 步骤映射到源码中的相关行。
    返回格式：[{"step_id": str, "start_line": int, "end_line": int}, ...]
    行号为 1-indexed（与 execution_map 保持一致）。
    """
    if not source_code.strip() or not cir.steps:
        return []

    lines = source_code.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    total_lines = len(lines)

    # 收集代码锚点：函数、循环、分支、返回等关键行
    anchors: list[tuple[int, str, list[str]]] = []  # (line_no, text, kinds)
    for index, raw_line in enumerate(lines, start=1):
        stripped = raw_line.strip()
        if not stripped or stripped.startswith(("#", "//")):
            continue

        kinds: list[str] = []
        lower = stripped.lower()

        # 函数/类定义
        if re.match(r"^\s*(def |class |void |int |bool |float |auto |template\s*<)", stripped):
            kinds.append("function")
        # 循环
        if re.match(r"^\s*(for |while )", stripped):
            kinds.append("loop")
        # 分支
        if re.match(r"^\s*(if |elif |else|switch |case )", stripped):
            kinds.append("branch")
        # 返回
        if stripped.startswith("return ") or stripped == "return" or " return " in lower:
            kinds.append("return")
        # 指针/索引
        if any(
            token in lower for token in ("left", "right", "mid", "pivot", "lo", "hi", "l ", "r ")
        ):
            kinds.append("pointer")
        # 交换
        if "swap" in lower or "exchange" in lower:
            kinds.append("swap")
        # 赋值/状态变更
        if "=" in stripped and "==" not in stripped:
            kinds.append("state")
        # 比较
        if any(token in lower for token in ("<", ">", "==", "!=", "<=", ">=")):
            kinds.append("compare")
        # 函数调用
        if re.search(r"\b[a-zA-Z_][a-zA-Z0-9_]*\s*\(", stripped):
            kinds.append("call")

        if kinds:
            anchors.append((index, stripped, kinds))

    if not anchors:
        # 回退：均分
        chunk = max(1, total_lines // max(len(cir.steps), 1))
        return [
            {
                "step_id": step.id,
                "start_line": i * chunk + 1,
                "end_line": min((i + 1) * chunk, total_lines),
            }
            for i, step in enumerate(cir.steps)
        ]

    result: list[dict] = []
    cursor_line = 1
    used_lines: set[int] = set()

    for step_index, step in enumerate(cir.steps):
        step_blob = " ".join(
            [
                step.title,
                step.narration,
                *step.annotations,
                *[token.label for token in step.tokens],
                *[token.value or "" for token in step.tokens],
            ]
        ).lower()

        preferred_kinds = _preferred_anchor_kinds_for_step(step_blob, step_index, len(cir.steps))
        best_anchor_line = _select_best_anchor_line(
            anchors, preferred_kinds, cursor_line, step_blob, used_lines
        )

        # 扩展到相邻行（形成代码块）
        active_lines = [best_anchor_line]
        for offset in (1, 2):
            candidate = best_anchor_line + offset
            if candidate <= total_lines and candidate not in used_lines:
                active_lines.append(candidate)
            candidate = best_anchor_line - offset
            if candidate >= 1 and candidate not in used_lines:
                active_lines.insert(0, candidate)

        active_lines = sorted(set(active_lines))
        used_lines.update(active_lines)
        cursor_line = best_anchor_line

        result.append(
            {
                "step_id": step.id,
                "start_line": active_lines[0],
                "end_line": active_lines[-1],
            }
        )

    return result


def _preferred_anchor_kinds_for_step(step_blob: str, index: int, total: int) -> list[str]:
    """根据步骤内容推断应匹配的代码锚点类型。"""
    preferred: list[str] = []
    if index == 0:
        preferred.extend(["function", "state"])
    if any(
        token in step_blob for token in ("初始化", "准备", "输入", "起点", "start", "setup", "load")
    ):
        preferred.extend(["state", "function"])
    if any(
        token in step_blob for token in ("循环", "遍历", "扫描", "迭代", "枚举", "search", "walk")
    ):
        preferred.extend(["loop", "compare"])
    if any(
        token in step_blob
        for token in ("判断", "条件", "比较", "分支", "命中", "检查", "if", "else")
    ):
        preferred.extend(["branch", "compare"])
    if any(
        token in step_blob
        for token in ("left", "right", "mid", "pivot", "指针", "移动", "更新", "缩小", "扩大")
    ):
        preferred.extend(["pointer", "state"])
    if any(token in step_blob for token in ("swap", "交换")):
        preferred.extend(["swap", "state"])
    if any(token in step_blob for token in ("返回", "结束", "终止", "答案", "result", "return")):
        preferred.extend(["return", "branch"])
    if any(token in step_blob for token in ("递归", "回溯", "展开")):
        preferred.extend(["call", "function"])
    if index == total - 1:
        preferred.extend(["return", "state"])
    preferred.extend(["loop", "branch", "state", "call"])
    return list(dict.fromkeys(preferred))


def _select_best_anchor_line(
    anchors: list[tuple[int, str, list[str]]],
    preferred_kinds: list[str],
    cursor_line: int,
    step_blob: str,
    used_lines: set[int],
) -> int:
    """选择最佳匹配的锚点行号。"""
    best_line = anchors[0][0]
    best_score = float("-inf")

    for line_no, text, kinds in anchors:
        score = 0.0
        # 类型匹配
        for rank, kind in enumerate(preferred_kinds):
            if kind in kinds:
                score += 28 - rank * 2
        # 位置偏好
        distance = abs(line_no - cursor_line)
        if line_no >= cursor_line:
            score += max(0, 12 - distance * 0.7)
        else:
            score += max(0, 8 - distance * 0.9)
        # 未使用加分
        if line_no not in used_lines:
            score += 4
        # 语义匹配加分
        lower_text = text.lower()
        if any(token in step_blob for token in ("left", "right", "mid")) and any(
            token in lower_text for token in ("left", "right", "mid")
        ):
            score += 6
        if "return" in step_blob and "return" in lower_text:
            score += 8
        if "if" in step_blob and text.strip().startswith(("if", "elif")):
            score += 5

        if score > best_score:
            best_line = line_no
            best_score = score

    return best_line


def extract_step_line_ranges(renderer_script: str, cir: CirDocument) -> list[dict]:
    """从渲染脚本中提取每个 CIR 步骤对应的代码行范围。

    返回格式：[{"step_id": str, "start_line": int, "end_line": int}, ...]
    行号为 0-indexed。
    """
    if not renderer_script or not cir.steps:
        return []

    lines = renderer_script.splitlines()
    total_lines = len(lines)
    step_count = len(cir.steps)
    step_starts: list[tuple[str, int]] = []

    for index, step in enumerate(cir.steps, start=1):
        found_line = None
        # 尝试匹配 step_card_{index} 或 step_group_{index}（来自 build_manim_script_from_cir）
        pattern = re.compile(rf"\bstep_(?:card|group|title)_{index}\b")
        for line_no, line in enumerate(lines):
            if pattern.search(line):
                found_line = line_no
                break

        # 尝试匹配步骤标题字符串
        if found_line is None and step.title:
            escaped_title = re.escape(step.title[:30])
            for line_no, line in enumerate(lines):
                if re.search(escaped_title, line):
                    found_line = line_no
                    break

        if found_line is not None:
            step_starts.append((step.id, found_line))

    # 如果找到了匹配，用相邻步骤的起始行计算范围
    if step_starts:
        result = []
        for i, (step_id, start_line) in enumerate(step_starts):
            if i + 1 < len(step_starts):
                end_line = step_starts[i + 1][1] - 1
            else:
                end_line = total_lines - 1
            result.append(
                {
                    "step_id": step_id,
                    "start_line": start_line,
                    "end_line": end_line,
                }
            )
        return result

    # 回退：按步骤数均分代码行
    chunk = max(1, total_lines // step_count)
    return [
        {
            "step_id": step.id,
            "start_line": i * chunk,
            "end_line": min((i + 1) * chunk - 1, total_lines - 1),
        }
        for i, step in enumerate(cir.steps)
    ]


def calculate_step_timing(
    cir: CirDocument, *, renderer_script: str = "", source_code: str = ""
) -> list[dict]:
    """计算每个 CIR 步骤的时间范围和代码行范围。

    返回格式：[{"step_id": str, "start_time": float, "end_time": float,
                "start_line": int, "end_line": int}, ...]

    时间估算规则：
    - 标题动画：FadeIn(0.3s) + wait(0.2s) = 0.5s
    - 每个 step：FadeIn(0.3s) + wait(0.6s) + FadeOut(0.3s) = 1.2s
    - 总结：Write(1.0s) + wait(1.0s) = 2.0s

    行号映射优先级：
    1. 如果提供了 source_code，使用语义匹配映射到用户源码
    2. 否则使用 renderer_script 的代码行范围
    """
    timing = []
    current_time = 0.0

    # 标题动画
    current_time += 0.5  # FadeIn + wait

    # 提取代码行范围：优先使用用户源码，否则使用生成脚本
    if source_code.strip():
        line_ranges = _extract_source_code_line_ranges(source_code, cir)
    else:
        line_ranges = extract_step_line_ranges(renderer_script, cir)
    line_map = {lr["step_id"]: lr for lr in line_ranges}

    # 每个 step 的动画
    for step in cir.steps:
        start_time = current_time
        # FadeIn(0.3s) + wait(0.6s) + FadeOut(0.3s) = 1.2s
        duration = 1.2
        end_time = start_time + duration
        entry: dict = {
            "step_id": step.id,
            "start_time": round(start_time, 2),
            "end_time": round(end_time, 2),
        }
        if step.id in line_map:
            entry["start_line"] = line_map[step.id]["start_line"]
            entry["end_line"] = line_map[step.id]["end_line"]
        timing.append(entry)
        current_time = end_time

    return timing


def build_manim_script_from_cir(
    cir: CirDocument,
    scene_class_name: str = "GeneratedPreviewScene",
) -> str:
    lines = [
        "from manim import *",
        "",
        "",
        f"class {scene_class_name}(Scene):",
        "    def construct(self):",
        f"        title = Text({json.dumps(cir.title)}, font_size=38, color=WHITE)",
        "        title.to_edge(UP)",
        "        self.play(FadeIn(title))",
        "        self.wait(0.2)",
        "",
    ]

    for index, step in enumerate(cir.steps, start=1):
        tokens_text = " | ".join(
            f"{token.label}: {token.value or token.label}" for token in step.tokens
        )
        # 动态获取文本位置，避免与动画元素重叠
        x_offset, y_offset = get_text_position(step.visual_kind)
        # 构建 move_to 表达式
        if x_offset == 0:
            body_move = f"DOWN * {abs(y_offset)}"
        elif y_offset == 0:
            body_move = f"RIGHT * {x_offset}" if x_offset > 0 else f"LEFT * {abs(x_offset)}"
        else:
            direction = "DOWN" if y_offset < 0 else "UP"
            body_move = f"RIGHT * {x_offset} + {direction} * {abs(y_offset)}"
        # tokens 位置在 body 下方 0.7 单位
        if y_offset < 0:
            tokens_y = abs(y_offset) + 0.7
            tokens_move = f"DOWN * {tokens_y}"
        else:
            tokens_move = "DOWN * 0.7"
        lines.extend(
            [
                f"        step_card_{index} = RoundedRectangle("
                "corner_radius=0.25, width=11.2, height=4.6, color=BLUE_E"
                ")",
                f"        step_title_{index} = Text("
                f"{json.dumps(f'{index}. {step.title}')}, font_size=28, color=WHITE"
                ").move_to(UP * 1.45)",
                f"        step_kind_{index} = Text("
                f"{json.dumps(step.visual_kind.value)}, font_size=18, color=BLUE_B"
                ").move_to(UP * 0.85)",
                f"        step_body_{index} = Text("
                f"{json.dumps(step.narration)}, font_size=24, color=GRAY_A, line_spacing=1.1"
                f").move_to({body_move})",
                f"        step_body_{index}.scale_to_fit_width(10.2)",
                f"        step_tokens_{index} = Text("
                f"{json.dumps(tokens_text or 'No tokens')}, font_size=20, color=YELLOW_E"
                f").move_to({tokens_move})",
                f"        step_tokens_{index}.scale_to_fit_width(10.1)",
                f"        step_group_{index} = VGroup("
                f"step_card_{index}, step_title_{index}, step_kind_{index}, "
                f"step_body_{index}, step_tokens_{index})",
                f"        self.play(FadeIn(step_group_{index}, shift=UP * 0.15))",
                "        self.wait(0.6)",
                f"        self.play(FadeOut(step_group_{index}, shift=DOWN * 0.1))",
                "",
            ]
        )

    lines.extend(
        [
            f"        summary_text = Text({json.dumps(cir.summary)}, font_size=26, color=WHITE)",
            "        summary_text.scale_to_fit_width(10.6)",
            "        summary_text.move_to(ORIGIN)",
            "        self.play(Write(summary_text))",
            "        self.wait(1.0)",
        ]
    )
    return "\n".join(lines).rstrip() + "\n"


def prepare_manim_script(
    raw_text: str,
    *,
    scene_class_name: str = "GeneratedScene",
) -> PreparedManimScript:
    if not raw_text.strip():
        raise ManimScriptError("输入为空，无法转换成 Manim 脚本。")

    diagnostics: list[str] = []
    cleaned = strip_reasoning_artifacts(raw_text)
    if cleaned != raw_text.strip():
        diagnostics.append("已移除推理标签或外围说明。")

    source = extract_python_source(cleaned)
    if source != cleaned.strip():
        diagnostics.append("已从文本中提取 Python 代码块。")

    module = _parse_module(source)
    module = _remove_main_guard(module, diagnostics)

    existing_scene = _find_scene_class_name(module)
    if existing_scene is None:
        module = _wrap_as_scene_module(module, scene_class_name)
        existing_scene = scene_class_name
        diagnostics.append("已自动补齐 Scene 类与 construct() 入口。")

    if not _has_manim_import(module):
        module.body.insert(0, _manim_import_node())
        diagnostics.append("已自动补充 from manim import *。")

    security_checked_module = ast.fix_missing_locations(module)
    inspection = inspect_manim_script(ast.unparse(security_checked_module).strip() + "\n")
    if inspection.errors:
        raise ManimScriptError("；".join(inspection.errors))

    module = _inject_cjk_font_fallback(module, diagnostics)
    module = ast.fix_missing_locations(module)
    code = ast.unparse(module).strip() + "\n"
    diagnostics.extend(inspection.warnings)
    return PreparedManimScript(
        code=code,
        scene_class_name=existing_scene,
        diagnostics=diagnostics,
    )


def inspect_manim_script(script: str) -> ManimScriptInspection:
    try:
        module = ast.parse(script)
    except SyntaxError as exc:
        error = f"Python 语法错误：{exc.msg} (line {exc.lineno})"
        return ManimScriptInspection(scene_class_names=[], warnings=[], errors=[error])

    errors: list[str] = []
    warnings: list[str] = []

    if not _has_manim_import(module):
        errors.append("脚本缺少 manim 导入。")

    scene_class_names = _find_scene_class_names(module)
    if not scene_class_names:
        errors.append("脚本缺少 Scene 子类。")

    errors.extend(_collect_dangerous_usage_errors(module))

    if "self.play(" not in script:
        warnings.append("脚本未检测到 self.play()，动画可能只有静态画面。")
    if "self.wait(" not in script:
        warnings.append("脚本未检测到 self.wait()，镜头停留时间可能不足。")

    return ManimScriptInspection(
        scene_class_names=scene_class_names,
        warnings=warnings,
        errors=errors,
    )


def _collect_dangerous_usage_errors(module: ast.Module) -> list[str]:
    errors: list[str] = []
    helper_line_range = _internal_helper_line_range(module)
    for node in ast.walk(module):
        if helper_line_range is not None and _node_within_line_range(node, helper_line_range):
            continue
        if isinstance(node, ast.Import):
            for alias in node.names:
                root_name = alias.name.split(".", 1)[0]
                if root_name in _DANGEROUS_IMPORT_NAMES:
                    errors.append(f"脚本包含危险导入：{root_name}。")
        elif isinstance(node, ast.ImportFrom):
            module_name = (node.module or "").split(".", 1)[0]
            if module_name in _DANGEROUS_IMPORT_NAMES:
                errors.append(f"脚本包含危险导入：{module_name}。")
        elif isinstance(node, ast.Call):
            if isinstance(node.func, ast.Name) and node.func.id in _DANGEROUS_CALL_NAMES:
                errors.append(f"脚本包含危险调用：{node.func.id}。")
            elif isinstance(node.func, ast.Attribute) and isinstance(node.func.value, ast.Name):
                pair = (node.func.value.id, node.func.attr)
                if pair in _DANGEROUS_ATTRIBUTE_CALLS:
                    errors.append(f"脚本包含危险调用：{pair[0]}.{pair[1]}。")
    return errors


def _internal_helper_line_range(module: ast.Module) -> tuple[int, int] | None:
    helper_module = ast.parse(_CJK_FONT_HELPER_SOURCE)
    helper_body = helper_module.body
    if len(module.body) < len(helper_body):
        return None

    actual_prefix = module.body[: len(helper_body)]
    for expected, actual in zip(helper_body, actual_prefix, strict=True):
        expected_dump = ast.dump(expected, include_attributes=False)
        actual_dump = ast.dump(actual, include_attributes=False)
        if expected_dump != actual_dump:
            return None

    start_line = getattr(actual_prefix[0], "lineno", None)
    end_line = getattr(actual_prefix[-1], "end_lineno", None)
    if start_line is None or end_line is None:
        return None
    return (start_line, end_line)


def _node_within_line_range(node: ast.AST, line_range: tuple[int, int]) -> bool:
    lineno = getattr(node, "lineno", None)
    end_lineno = getattr(node, "end_lineno", lineno)
    if lineno is None or end_lineno is None:
        return False
    start_line, end_line_limit = line_range
    return start_line <= lineno and end_lineno <= end_line_limit


def strip_reasoning_artifacts(text: str) -> str:
    cleaned = text.strip()
    for tag in _REASONING_TAGS:
        cleaned = re.sub(
            rf"<{tag}>\s*.*?\s*</{tag}>",
            "",
            cleaned,
            flags=re.IGNORECASE | re.DOTALL,
        )

    lines = cleaned.splitlines()
    fence_index = next(
        (index for index, line in enumerate(lines) if line.strip().startswith("```")),
        None,
    )
    if fence_index is not None:
        prefix = [line for line in lines[:fence_index] if not line.lstrip().startswith(">")]
        cleaned = "\n".join(prefix + lines[fence_index:])

    return cleaned.strip()


def extract_python_source(text: str) -> str:
    fence_pattern = re.compile(
        r"```(?P<lang>[A-Za-z0-9_-]*)[ \t]*\n(?P<body>.*?)```",
        flags=re.DOTALL,
    )
    candidates: list[tuple[str, str]] = []
    for match in fence_pattern.finditer(text):
        language = match.group("lang").strip().lower()
        body = match.group("body").strip()
        candidates.append((language, body))

    for language, body in candidates:
        if language in _PYTHON_LANG_TAGS:
            return body

    for _language, body in candidates:
        if _looks_like_python_code(body):
            return body

    normalized = text.strip()
    if _looks_like_python_code(normalized):
        return normalized

    raise ManimScriptError("未在输入中找到可识别的 Python Manim 代码。")


def _parse_module(source: str) -> ast.Module:
    try:
        return ast.parse(source)
    except SyntaxError as exc:
        raise ManimScriptError(f"Python 代码语法错误：{exc.msg} (line {exc.lineno})") from exc


def _remove_main_guard(module: ast.Module, diagnostics: list[str]) -> ast.Module:
    new_body: list[ast.stmt] = []
    removed = False
    for statement in module.body:
        if _is_main_guard(statement):
            removed = True
            continue
        new_body.append(statement)

    if removed:
        diagnostics.append("已移除 __main__ 入口代码。")
    return ast.Module(body=new_body, type_ignores=module.type_ignores)


def _is_main_guard(statement: ast.stmt) -> bool:
    if not isinstance(statement, ast.If):
        return False

    test = statement.test
    if not isinstance(test, ast.Compare) or len(test.ops) != 1 or len(test.comparators) != 1:
        return False

    left = test.left
    right = test.comparators[0]
    comparator = right.value if isinstance(right, ast.Constant) else None
    return (
        isinstance(left, ast.Name)
        and left.id == "__name__"
        and isinstance(test.ops[0], ast.Eq)
        and comparator == "__main__"
    )


def _wrap_as_scene_module(module: ast.Module, scene_class_name: str) -> ast.Module:
    support_body: list[ast.stmt] = []
    construct_body: list[ast.stmt] = []

    for statement in module.body:
        if isinstance(statement, ast.FunctionDef) and statement.name == "construct":
            construct_body.extend(statement.body)
            continue

        if isinstance(statement, (ast.Import, ast.ImportFrom, ast.FunctionDef, ast.ClassDef)):
            support_body.append(statement)
            continue

        construct_body.append(statement)

    if not construct_body:
        construct_body = [_build_wait_statement()]

    construct_function = ast.FunctionDef(
        name="construct",
        args=ast.arguments(
            posonlyargs=[],
            args=[ast.arg(arg="self")],
            kwonlyargs=[],
            kw_defaults=[],
            defaults=[],
        ),
        body=construct_body,
        decorator_list=[],
    )
    scene_class = ast.ClassDef(
        name=scene_class_name,
        bases=[ast.Name(id="Scene", ctx=ast.Load())],
        keywords=[],
        body=[construct_function],
        decorator_list=[],
    )
    return ast.Module(body=[*support_body, scene_class], type_ignores=module.type_ignores)


def _build_wait_statement() -> ast.Expr:
    return ast.Expr(
        value=ast.Call(
            func=ast.Attribute(
                value=ast.Name(id="self", ctx=ast.Load()),
                attr="wait",
                ctx=ast.Load(),
            ),
            args=[ast.Constant(value=0.5)],
            keywords=[],
        )
    )


def _has_manim_import(module: ast.Module) -> bool:
    for statement in module.body:
        if isinstance(statement, ast.ImportFrom) and statement.module == "manim":
            return True
        if isinstance(statement, ast.Import):
            for alias in statement.names:
                if alias.name == "manim":
                    return True
    return False


def _manim_import_node() -> ast.ImportFrom:
    return ast.ImportFrom(module="manim", names=[ast.alias(name="*", asname=None)], level=0)


class _TextCallFontFallbackTransformer(ast.NodeTransformer):
    def __init__(self) -> None:
        self.rewritten = False

    def visit_Call(self, node: ast.Call) -> ast.AST:
        self.generic_visit(node)
        if not isinstance(node.func, ast.Name):
            return node
        replacement = _TEXT_MOBJECT_NAMES.get(node.func.id)
        if replacement is None:
            return node
        if any(keyword.arg == "font" for keyword in node.keywords if keyword.arg is not None):
            return node
        node.func = ast.Name(id=replacement, ctx=ast.Load())
        self.rewritten = True
        return node


def _inject_cjk_font_fallback(module: ast.Module, diagnostics: list[str]) -> ast.Module:
    transformer = _TextCallFontFallbackTransformer()
    rewritten = transformer.visit(module)
    if not isinstance(rewritten, ast.Module) or not transformer.rewritten:
        return module

    helper_module = ast.parse(_CJK_FONT_HELPER_SOURCE)
    diagnostics.append("已为 Text/MarkupText/Paragraph 注入 CJK 字体回退。")
    return ast.Module(
        body=[*helper_module.body, *rewritten.body],
        type_ignores=rewritten.type_ignores,
    )


def _find_scene_class_name(module: ast.Module) -> str | None:
    names = _find_scene_class_names(module)
    return names[0] if names else None


def _find_scene_class_names(module: ast.Module) -> list[str]:
    scene_names: list[str] = []
    for statement in module.body:
        if not isinstance(statement, ast.ClassDef):
            continue
        if not _class_has_construct(statement):
            continue
        if any(_base_looks_like_scene(base) for base in statement.bases) or not statement.bases:
            scene_names.append(statement.name)
    return scene_names


def _class_has_construct(statement: ast.ClassDef) -> bool:
    return any(
        isinstance(item, ast.FunctionDef) and item.name == "construct" for item in statement.body
    )


def _base_looks_like_scene(base: ast.expr) -> bool:
    if isinstance(base, ast.Name):
        return base.id in _SCENE_BASE_NAMES or base.id.endswith("Scene")
    if isinstance(base, ast.Attribute):
        return base.attr in _SCENE_BASE_NAMES or base.attr.endswith("Scene")
    return False


def _looks_like_python_code(text: str) -> bool:
    signal_patterns = (
        r"from\s+manim\s+import",
        r"import\s+manim",
        r"class\s+\w+\s*\(",
        r"def\s+construct\s*\(",
        r"self\.play\s*\(",
        r"self\.wait\s*\(",
    )
    normalized = text.strip()
    if not normalized:
        return False
    return any(re.search(pattern, normalized) for pattern in signal_patterns)
