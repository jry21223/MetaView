from __future__ import annotations

import ast
import json
import re
from dataclasses import dataclass, field

from app.schemas import CirDocument

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
                ").move_to(ORIGIN)",
                f"        step_body_{index}.scale_to_fit_width(10.2)",
                f"        step_tokens_{index} = Text("
                f"{json.dumps(tokens_text or 'No tokens')}, font_size=20, color=YELLOW_E"
                ").move_to(DOWN * 1.45)",
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

    module = _inject_cjk_font_fallback(module, diagnostics)
    module = ast.fix_missing_locations(module)
    code = ast.unparse(module).strip() + "\n"
    inspection = inspect_manim_script(code)
    if inspection.errors:
        raise ManimScriptError("；".join(inspection.errors))
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

    if "self.play(" not in script:
        warnings.append("脚本未检测到 self.play()，动画可能只有静态画面。")
    if "self.wait(" not in script:
        warnings.append("脚本未检测到 self.wait()，镜头停留时间可能不足。")

    return ManimScriptInspection(
        scene_class_names=scene_class_names,
        warnings=warnings,
        errors=errors,
    )


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
        raise ManimScriptError(
            f"Python 代码语法错误：{exc.msg} (line {exc.lineno})"
        ) from exc


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
