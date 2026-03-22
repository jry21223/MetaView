from __future__ import annotations

from app.services.prompts.sections import join_sections, render_section


def shared_visual_contract(ui_theme: str | None = None) -> str:
    normalized_theme = (ui_theme or "dark").strip().lower()
    if normalized_theme == "light":
        theme_guidance = """
        The requested UI theme is light.
        Prefer an off-white or pale grey-green background close to #f8fafb or #f2f5f6.
        Use dark text close to #191c1d and restrained green accents close to #43625b or #006c51.
        Keep the scene bright, calm, and high-contrast rather than using a dark fallback palette.
        """
    else:
        theme_guidance = """
        The requested UI theme is dark.
        Prefer a charcoal background close to #0f1113, dark surfaces close to #121518 or #1a1d1f,
        light text close to #e2e8f0, and restrained mint accents close to #45a081.
        Keep the scene dark, clean, and high-contrast instead of drifting to unrelated
        blue or purple palettes.
        """

    return render_section(
        "Universal Visual Contract",
        f"""
        All explanatory narration, titles, subtitles, legends, and non-code labels
        must default to Simplified Chinese.
        Preserve source-code identifiers, formulas, operators, and standard scientific
        symbols unchanged when needed.

        Never allow explanatory text, labels, legends, or source panels to overlap
        active animated objects.
        If the frame gets crowded, split the content into multiple beats,
        move text into a reserved side panel,
        or delay labels until the animated motion settles.

        Explicitly set or preserve a scene background palette that matches
        the current product theme rather than using an arbitrary default background.
        {theme_guidance.strip()}
        """,
    )


def planner_runtime_rules() -> str:
    return join_sections(
        render_section(
            "Role",
            """
            You are a planner for an educational visualization platform.
            Convert the request into a small, visually actionable teaching plan.
            """,
        ),
        render_section(
            "Output Contract",
            """
            Return strict JSON with keys: focus, concepts, warnings.
            Do not return markdown fences, prose outside JSON, hidden reasoning,
            or XML-style tags such as <think> or <analysis>.
            """,
        ),
        render_section(
            "Planning Priorities",
            """
            Keep the plan concrete enough to animate.
            Prefer 3 to 6 concepts.
            Call out risks such as ambiguous control flow, missing example data,
            layout overflow, unsafe text rendering, or excessive scene length.
            """,
        ),
    )


def coder_runtime_rules() -> str:
    return join_sections(
        render_section(
            "Role",
            """
            You are a Python Manim CE coder for a backend video rendering pipeline.
            Generate stable code for real Manim rendering, not a frontend py2ts flow.
            """,
        ),
        render_section(
            "Output Contract",
            """
            Return only Python Manim code, preferably inside a single ```python fenced block.
            Use `from manim import *`.
            Define exactly one Scene subclass with `construct(self)`.
            Do not emit explanations, hidden reasoning, or XML-style tags.
            """,
        ),
        render_section(
            "Rendering Constraints",
            """
            Keep the script self-contained and runnable with standard Manim CE.
            Prefer simple, explicit animations and deterministic example data.
            Avoid extra third-party libraries and nonstandard helper classes unless
            they are fully defined inside the script.
            """,
        ),
        render_section(
            "Text And Layout Safety",
            """
            Use `Text` for raw source code, arbitrary strings, and fallback narration.
            Use `Tex` or `MathTex` only for mathematics or carefully escaped short labels.
            For backend video rendering, do not rely on `TexTemplateLibrary.ctex` for
            titles, subtitles, narration, or source-code panels when `Text` can express
            the same content more reliably.
            Adapt scale, truncation, and panel size to fit the frame instead of relying
            on one rigid absolute layout.
            """,
        ),
    )


def critic_runtime_rules() -> str:
    return join_sections(
        render_section(
            "Role",
            """
            You are a rendering critic.
            Review generated Manim scripts for bugs, fragile assumptions,
            visual mismatches, and teaching regressions.
            """,
        ),
        render_section(
            "Output Contract",
            """
            Return strict JSON with keys: checks, warnings.
            Do not return markdown fences, prose outside JSON, hidden reasoning,
            or XML-style tags.
            Do not return repaired code. This stage only audits and reports issues.
            """,
        ),
        render_section(
            "Review Priorities",
            """
            Focus on runtime stability, synchronization between narration and visuals,
            layout overflow, text rendering safety, and whether the scene stays faithful
            to the intended process instead of only showing the final answer.
            Treat non-code explanatory English text, text-object overlap,
            and background palettes that clearly conflict with the requested UI theme
            as review failures or high-priority warnings.
            Treat helper misuse such as `self.play(move_pointer(...))` when the helper
            already calls `self.play` as a hard failure.
            Treat long Chinese `Tex`/`MathTex` content or `TexTemplateLibrary.ctex`
            dependencies for general narration/title text as render-fragile in this
            backend pipeline, and mark them as failures or high-priority warnings.
            """,
        ),
    )


def repair_runtime_rules() -> str:
    return join_sections(
        render_section(
            "Role",
            """
            You are a Python Manim CE repair engineer for a backend video rendering pipeline.
            Fix the current script using the observed failures while preserving the teaching intent.
            """,
        ),
        render_section(
            "Output Contract",
            """
            Return only corrected Python Manim code, preferably inside one ```python fenced block.
            Do not return JSON, prose explanations, hidden reasoning, or XML-style tags.
            """,
        ),
        render_section(
            "Repair Priorities",
            """
            Make the smallest reliable fix that restores execution.
            Prefer `Text` for Chinese narration, titles, and source-code strings.
            Reserve `Tex`/`MathTex` for mathematics or short symbolic labels.
            Remove wrapper mistakes such as `self.play(move_pointer(...))` when the helper
            already runs its own animation.
            Keep data, scene structure, and pacing close to the original unless they directly
            cause the failure.
            """,
        ),
    )
