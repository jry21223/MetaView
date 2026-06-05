"""Generate baseline eval fixtures for all starter prompts.

Two modes:
  --single  (default) — Build PlaybookScript directly (no API key, reproducible)
  --live    — POST to running API to capture real agent output

Usage:
  cd apps/api
  uv run python -m eval.generate_fixtures --single
  uv run python -m eval.generate_fixtures --live --api http://localhost:8000
"""

from __future__ import annotations

import argparse
import json
import pathlib
import sys
import time

import yaml  # type: ignore[import]

REPO_ROOT = pathlib.Path(__file__).parents[3]
PROMPTS_DEFAULT = REPO_ROOT / "eval" / "prompts" / "starter.yaml"
FIXTURES_DIR = REPO_ROOT / "eval" / "fixtures"


# ---------------------------------------------------------------------------
# Synthetic PlaybookScript builders per domain
# ---------------------------------------------------------------------------


def _make_green_theorem_playbook(prompt: str) -> str:
    from app.domain.models.playbook import (
        Layer,
        LayerTiming,
        MathFormulaSnapshot,
        MathSceneAnnotation,
        MathScenePoint,
        MathSceneRegion,
        MathSceneSegment,
        MathSceneSnapshot,
        MathSceneVectorField,
        MetaStep,
        NarrationCardSnapshot,
        PlaybookScript,
    )

    fps = 30
    step_frames = 150

    def layer(body, z_order: int = 0, appear_anim: str = "fade") -> Layer:
        layer_anim = "fade" if appear_anim == "enter" else appear_anim
        return Layer(
            timing=LayerTiming(appear_anim=layer_anim, z_order=z_order),
            body=body,
        )

    def step(
        idx: int,
        title: str,
        voiceover_text: str,
        snapshot,
        animation_hint: str = "enter",
        extra_layers: list[Layer] | None = None,
    ) -> MetaStep:
        layers = [layer(snapshot, appear_anim=animation_hint)]
        if extra_layers:
            layers.extend(extra_layers)
        return MetaStep(
            step_id=f"step_{idx:02d}",
            end_frame=step_frames * idx,
            title=title,
            voiceover_text=voiceover_text,
            animation_hint=animation_hint,
            snapshot=snapshot,
            layers=layers,
        )

    square_region = MathSceneRegion(
        vertices=[(0, 0), (1, 0), (1, 1), (0, 1)],
        label="D",
        emphasis="secondary",
    )
    boundary_segments = [
        MathSceneSegment(x0=0, y0=0, x1=1, y1=0, arrow=True, emphasis="primary"),
        MathSceneSegment(x0=1, y0=0, x1=1, y1=1, arrow=True, emphasis="primary"),
        MathSceneSegment(x0=1, y0=1, x1=0, y1=1, arrow=True, emphasis="primary"),
        MathSceneSegment(x0=0, y0=1, x1=0, y1=0, arrow=True, emphasis="primary"),
    ]
    square_points = [
        MathScenePoint(x=0, y=0, label="A", emphasis="primary"),
        MathScenePoint(x=1, y=0, label="B", emphasis="primary"),
        MathScenePoint(x=1, y=1, label="C", emphasis="primary"),
        MathScenePoint(x=0, y=1, label="D", emphasis="primary"),
    ]
    field = MathSceneVectorField(
        expression_px="-0.5*y",
        expression_py="0.5*x",
        step=0.25,
        label="F",
    )

    intro = MathFormulaSnapshot(
        formula_latex=(
            r"\oint_{\partial D} P\,dx+Q\,dy="
            r"\iint_D\left(\frac{\partial Q}{\partial x}-"
            r"\frac{\partial P}{\partial y}\right)\,dA"
        ),
        caption="格林公式把边界上的环流转化为区域内部的旋度总和。",
        highlights=[
            r"\oint_{\partial D}",
            r"\iint_D",
            r"\frac{\partial Q}{\partial x}-\frac{\partial P}{\partial y}",
        ],
        annotations=["C=∂D 为正向闭曲线", "D 为平面区域"],
    )

    region_scene = MathSceneSnapshot(
        x_min=-0.35,
        x_max=1.35,
        y_min=-0.35,
        y_max=1.35,
        points=square_points,
        regions=[square_region],
        segments=boundary_segments,
        annotations=[
            MathSceneAnnotation(x=0.48, y=0.48, text="$D$", align="center"),
            MathSceneAnnotation(x=0.68, y=1.18, text="$\\partial D$", align="ne"),
            MathSceneAnnotation(x=0.12, y=1.18, text="正向边界", align="nw"),
        ],
        formula_latex=r"C=\partial D",
        caption="正向边界表示沿区域外侧逆时针走一圈。",
    )

    field_scene = MathSceneSnapshot(
        x_min=-0.45,
        x_max=1.45,
        y_min=-0.45,
        y_max=1.45,
        regions=[square_region],
        segments=boundary_segments,
        vector_field=field,
        annotations=[
            MathSceneAnnotation(x=0.22, y=1.22, text="$\\mathbf F=(-y/2,x/2)$", align="ne"),
            MathSceneAnnotation(
                x=0.5,
                y=0.52,
                text="$\\partial Q/\\partial x-\\partial P/\\partial y=1$",
                align="center",
            ),
        ],
        formula_latex=r"\mathbf F=(P,Q)=(-y/2,x/2)",
        caption="向量场在区域内持续逆时针旋转，旋度处处为 1。",
    )

    boundary_formula = MathFormulaSnapshot(
        formula_latex=r"\oint_C P\,dx+Q\,dy",
        caption="左边沿边界 C 累加微小位移方向上的投影，表示一圈总环流。",
        highlights=[r"P\,dx", r"Q\,dy"],
        annotations=["只看边界", "方向必须与正向一致"],
    )

    curl_cell_scene = MathSceneSnapshot(
        x_min=-0.35,
        x_max=1.35,
        y_min=-0.35,
        y_max=1.35,
        regions=[
            square_region,
            MathSceneRegion(
                vertices=[(0.35, 0.35), (0.65, 0.35), (0.65, 0.65), (0.35, 0.65)],
                label="dA",
                emphasis="accent",
            ),
        ],
        segments=boundary_segments,
        vector_field=field,
        annotations=[
            MathSceneAnnotation(x=0.5, y=0.72, text="$dA$", align="center"),
            MathSceneAnnotation(
                x=0.08,
                y=-0.18,
                text="$\\mathrm{curl}\\,\\mathbf F=1$",
                align="ne",
            ),
        ],
        formula_latex=r"\iint_D \mathrm{curl}\,\mathbf F\,dA",
        caption="右边把每个小面积中的局部旋转密度加起来。",
    )

    computation = MathFormulaSnapshot(
        formula_latex=(
            r"P=-\frac{y}{2},\quad Q=\frac{x}{2}"
            r"\quad\Rightarrow\quad"
            r"\frac{\partial Q}{\partial x}-\frac{\partial P}{\partial y}=1"
        ),
        caption="在单位正方形上，面积积分就是 ∫∫D 1 dA = 1。",
        highlights=[r"\frac{\partial Q}{\partial x}", r"\frac{\partial P}{\partial y}", "1"],
        annotations=["例子选得简单：旋度恒定", "D 的面积为 1"],
    )

    result_scene = MathSceneSnapshot(
        x_min=-0.45,
        x_max=1.45,
        y_min=-0.45,
        y_max=1.45,
        regions=[square_region],
        segments=boundary_segments,
        vector_field=field,
        annotations=[
            MathSceneAnnotation(x=0.5, y=1.22, text="$\\oint_C Pdx+Qdy=1$", align="center"),
            MathSceneAnnotation(x=0.5, y=-0.22, text="$\\iint_D 1\\,dA=1$", align="center"),
        ],
        formula_latex=r"\oint_C P\,dx+Q\,dy=\iint_D 1\,dA=1",
        caption="边界一圈的总效果，等于内部所有局部旋转的总和。",
    )

    summary = NarrationCardSnapshot(
        text="记忆主线：边界环流 = 内部旋度总量。使用时先确认闭曲线、正向、P 和 Q 的偏导是否存在。",
        position="center",
        emphasis="accent",
    )

    steps = [
        step(
            1,
            "格林公式说什么",
            "格林公式连接两个看似不同的量：沿闭合边界走一圈得到的环流，和区域内部每一点的局部旋转密度总和。",
            intro,
            "enter",
        ),
        step(
            2,
            "先确定区域和正向边界",
            (
                "我们用单位正方形作为区域 D，边界 C 等于 D 的外边框。"
                "正向约定是逆时针行走，让区域始终在左手边。"
            ),
            region_scene,
            "draw",
        ),
        step(
            3,
            "把向量场放进区域",
            (
                "选择向量场 F 等于负二分之一 y、二分之一 x。"
                "箭头呈逆时针旋转，暗示区域内部存在稳定的局部环流。"
            ),
            field_scene,
            "draw",
        ),
        step(
            4,
            "左边：沿边界累加",
            (
                "公式左边的线积分，只沿 C 这一条闭曲线计算。"
                "每一小段都取向量场在行走方向上的投影，再沿整圈累加。"
            ),
            boundary_formula,
            "enter",
        ),
        step(
            5,
            "右边：累加内部旋度",
            "公式右边不是看边界，而是把区域切成很多小面积。每个小块贡献一个旋度乘面积，最后把它们全部加起来。",
            curl_cell_scene,
            "draw",
        ),
        step(
            6,
            "单位正方形上的验证",
            (
                "在这个例子里，Q 对 x 的偏导是二分之一，"
                "P 对 y 的偏导是负二分之一，两者相减得到一，所以面积积分等于一。"
            ),
            computation,
            "enter",
        ),
        step(
            7,
            "结论：边界等于内部",
            "最终，边界线积分等于一，内部旋度积分也等于一。格林公式告诉我们，可以在边界计算和区域计算之间自由转换。",
            result_scene,
            "draw",
        ),
        step(
            8,
            "使用格林公式的检查清单",
            (
                "使用格林公式时，先确认曲线闭合且正向，再确认区域足够规则，"
                "最后检查 P 和 Q 的偏导存在并连续。"
            ),
            summary,
            "enter",
        ),
    ]

    script = PlaybookScript(
        fps=fps,
        total_frames=step_frames * len(steps),
        domain="math",
        title="格林公式讲解",
        summary=prompt,
        steps=steps,
    )
    return script.model_dump_json(indent=2)


def _make_math_playbook(prompt: str, prompt_id: str) -> str:
    if "green" in prompt_id or "格林" in prompt:
        return _make_green_theorem_playbook(prompt)

    from app.domain.models.playbook import (
        Layer,
        LayerTiming,
        MathFormulaSnapshot,
        MathPlotCurve,
        MathPlotSnapshot,
        MetaStep,
        NarrationCardSnapshot,
        PlaybookScript,
    )

    fps = 30
    step_frames = 90
    steps = [
        MetaStep(
            step_id="step_01",
            end_frame=step_frames,
            title="引入概念",
            voiceover_text="本节我们将深入探讨这个数学概念，理解其定义和几何直觉。",
            animation_hint="enter",
            snapshot=NarrationCardSnapshot(text=f"概念导入：{prompt[:40]}"),
            layers=[Layer(timing=LayerTiming(), body=NarrationCardSnapshot(
                text=f"概念导入：{prompt[:40]}"))],
        ),
        MetaStep(
            step_id="step_02",
            end_frame=step_frames * 2,
            title="建立函数图像",
            voiceover_text="在坐标系中画出函数图像，观察它的基本形态和变化趋势。",
            animation_hint="draw",
            snapshot=MathPlotSnapshot(
                curves=[MathPlotCurve(expression="x^2", label="f(x)")],
                x_min=-3, x_max=3, formula_latex="f(x) = x^2",
            ),
            layers=[Layer(timing=LayerTiming(), body=MathPlotSnapshot(
                curves=[MathPlotCurve(expression="x^2", label="f(x)")],
                x_min=-3, x_max=3, formula_latex="f(x) = x^2",
            ))],
        ),
        MetaStep(
            step_id="step_03",
            end_frame=step_frames * 3,
            title="关键特征分析",
            voiceover_text="分析函数的单调性、极值点和对称轴，这些是理解函数行为的关键。",
            animation_hint="highlight",
            snapshot=MathPlotSnapshot(
                curves=[MathPlotCurve(expression="x^2 - 4*x + 3", label="f(x)")],
                x_min=-1, x_max=5, marker_x=2.0,
                formula_latex="f(x) = x^2 - 4x + 3",
            ),
            layers=[Layer(timing=LayerTiming(), body=MathPlotSnapshot(
                curves=[MathPlotCurve(expression="x^2 - 4*x + 3", label="f(x)")],
                x_min=-1, x_max=5, marker_x=2.0,
            ))],
        ),
        MetaStep(
            step_id="step_04",
            end_frame=step_frames * 4,
            title="公式推导",
            voiceover_text="通过代数推导，得出这个函数的标准表达式，掌握求解步骤。",
            animation_hint="enter",
            snapshot=MathFormulaSnapshot(
                formula_latex=r"f(x) = a(x-h)^2 + k",
                caption=None,
                highlights=["a", "h", "k"],
                annotations=["顶点式", "a > 0 开口向上"],
            ),
            layers=[Layer(timing=LayerTiming(), body=MathFormulaSnapshot(
                formula_latex=r"f(x) = a(x-h)^2 + k",
                caption=None,
            ))],
        ),
        MetaStep(
            step_id="step_05",
            end_frame=step_frames * 5,
            title="例题计算",
            voiceover_text="代入具体数值，逐步计算，验证我们的公式是否正确。",
            animation_hint="draw",
            snapshot=MathPlotSnapshot(
                curves=[
                    MathPlotCurve(expression="x^2 - 4*x + 3", label="f(x)", emphasis="primary"),
                    MathPlotCurve(expression="2*x - 5", label="切线", emphasis="secondary"),
                ],
                x_min=-1, x_max=5,
            ),
            layers=[Layer(timing=LayerTiming(), body=MathPlotSnapshot(
                curves=[
                    MathPlotCurve(expression="x^2 - 4*x + 3", label="f(x)"),
                    MathPlotCurve(expression="2*x - 5", label="切线", emphasis="secondary"),
                ],
                x_min=-1, x_max=5,
            ))],
        ),
        MetaStep(
            step_id="step_06",
            end_frame=step_frames * 6,
            title="总结",
            voiceover_text="通过本次学习，我们掌握了该函数的核心特性和分析方法，可以应用到实际问题中。",
            animation_hint="enter",
            snapshot=NarrationCardSnapshot(
                text="✓ 顶点坐标 (h, k)  ✓ 对称轴 x = h  ✓ 开口方向由 a 决定"
            ),
            layers=[Layer(timing=LayerTiming(), body=NarrationCardSnapshot(
                text="✓ 顶点坐标 (h, k)  ✓ 对称轴 x = h  ✓ 开口方向由 a 决定"
            ))],
        ),
    ]
    script = PlaybookScript(
        fps=fps,
        total_frames=step_frames * len(steps),
        domain="math",
        title=f"数学讲解：{prompt_id.replace('-', ' ')}",
        summary=prompt,
        steps=steps,
    )
    return script.model_dump_json(indent=2)


def _make_algorithm_playbook(prompt: str, prompt_id: str) -> str:
    from app.domain.models.playbook import (
        AlgorithmArraySnapshot,
        AlgorithmBarsSnapshot,
        Layer,
        LayerTiming,
        MetaStep,
        NarrationCardSnapshot,
        PlaybookScript,
    )

    if "bubble" in prompt_id or "冒泡" in prompt:
        arr = ["5", "2", "8", "1", "9"]
        nums = [5.0, 2.0, 8.0, 1.0, 9.0]
    elif "binary" in prompt_id or "二分" in prompt:
        arr = ["1", "3", "5", "7", "9", "11"]
        nums = [1.0, 3.0, 5.0, 7.0, 9.0, 11.0]
    else:
        arr = ["4", "2", "7", "3", "1"]
        nums = [4.0, 2.0, 7.0, 3.0, 1.0]

    fps, sf = 30, 90
    snap_intro = NarrationCardSnapshot(text=f"算法演示：{prompt[:50]}")
    snap_arr0 = AlgorithmArraySnapshot(array_values=arr, active_indices=[])
    snap_arr1 = AlgorithmArraySnapshot(array_values=arr, active_indices=[0, 1])
    snap_swap = AlgorithmArraySnapshot(
        array_values=[arr[1], arr[0]] + arr[2:], active_indices=[0, 1], swap_indices=[0, 1]
    )
    snap_bars = AlgorithmBarsSnapshot(
        array_values=sorted(arr), numeric_values=sorted(nums),
        sorted_indices=list(range(len(arr))),
    )
    snap_done = AlgorithmArraySnapshot(
        array_values=sorted(arr), sorted_indices=list(range(len(arr)))
    )

    steps = [
        MetaStep(
            step_id="step_01",
            end_frame=sf,
            title="问题介绍",
            voiceover_text=(
                f"我们来演示这个算法。初始输入数组是 {arr}，"
                "目标是通过系统性操作解决问题。"
            ),
            animation_hint="enter",
            snapshot=snap_intro,
            layers=[Layer(timing=LayerTiming(), body=snap_intro)],
        ),
        MetaStep(
            step_id="step_02",
            end_frame=sf * 2,
            title="初始状态",
            voiceover_text="首先显示初始数组，所有元素处于未处理状态，高亮显示当前待比较的位置。",
            animation_hint="enter",
            snapshot=snap_arr0,
            layers=[Layer(timing=LayerTiming(), body=snap_arr0)],
        ),
        MetaStep(
            step_id="step_03",
            end_frame=sf * 3,
            title="第一次比较",
            voiceover_text="从第一个位置开始，比较相邻元素的大小，确定是否需要交换。",
            animation_hint="highlight",
            snapshot=snap_arr1,
            layers=[Layer(timing=LayerTiming(), body=snap_arr1)],
        ),
        MetaStep(
            step_id="step_04",
            end_frame=sf * 4,
            title="执行交换",
            voiceover_text="发现顺序不对，执行交换操作，两个元素互换位置，数组更加有序。",
            animation_hint="swap",
            snapshot=snap_swap,
            layers=[Layer(timing=LayerTiming(), body=snap_swap)],
        ),
        MetaStep(
            step_id="step_05",
            end_frame=sf * 5,
            title="高度图对比",
            voiceover_text="用柱状图直观展示元素高度，可以更清楚地看到排序过程中的变化。",
            animation_hint="enter",
            snapshot=snap_bars,
            layers=[Layer(timing=LayerTiming(), body=snap_bars)],
        ),
        MetaStep(
            step_id="step_06",
            end_frame=sf * 6,
            title="排序完成",
            voiceover_text="经过多轮遍历，所有元素都就位，数组完成排序，绿色表示已排序的元素。",
            animation_hint="enter",
            snapshot=snap_done,
            layers=[Layer(timing=LayerTiming(), body=snap_done)],
        ),
    ]
    script = PlaybookScript(
        fps=fps, total_frames=sf * len(steps),
        domain="algorithm",
        title=f"算法演示：{prompt_id.replace('-', ' ')}",
        summary=prompt, steps=steps,
    )
    return script.model_dump_json(indent=2)


def _make_generic_playbook(prompt: str, prompt_id: str, domain: str) -> str:
    from app.domain.models.playbook import (
        Layer,
        LayerTiming,
        MathFormulaSnapshot,
        MetaStep,
        NarrationCardSnapshot,
        PlaybookScript,
    )

    fps, sf = 30, 90
    formulas = [
        (r"F = ma", "基本方程"),
        (r"\Delta x = v_0 t + \frac{1}{2}at^2", "位移方程"),
        (r"E = \frac{1}{2}mv^2", "动能公式"),
        (r"W = F \cdot d \cdot \cos\theta", "功的定义"),
        (r"P = \frac{W}{t}", "功率定义"),
    ]
    narrations = [
        f"首先来了解{domain}领域的基本概念，这是理解后续内容的基础。",
        f"深入分析{prompt[:20]}的核心原理，建立数学模型。",
        "通过方程推导，我们可以得到定量关系式，用于计算。",
        "代入具体数值，逐步求解，验证推导是否正确。",
        f"这个规律在实际{domain}问题中有广泛应用。",
        "总结本节核心要点，掌握分析方法，应用于实际问题。",
    ]

    steps = []
    for i, (formula_latex, annot) in enumerate(formulas[:5], 1):
        snap = MathFormulaSnapshot(
            formula_latex=formula_latex,
            caption=None,
            annotations=[annot],
        )
        steps.append(MetaStep(
            step_id=f"step_{i:02d}",
            end_frame=sf * i,
            title=f"第 {i} 步",
            voiceover_text=narrations[i - 1],
            animation_hint="enter",
            snapshot=snap,
            layers=[Layer(timing=LayerTiming(), body=snap)],
        ))
    # Final narration card for diversity
    snap_final = NarrationCardSnapshot(text=f"总结：{prompt[:60]}")
    steps.append(MetaStep(
        step_id="step_06",
        end_frame=sf * 6,
        title="总结",
        voiceover_text=narrations[5],
        snapshot=snap_final,
        layers=[Layer(timing=LayerTiming(), body=snap_final)],
    ))

    script = PlaybookScript(
        fps=fps, total_frames=sf * 6,
        domain=domain,
        title=f"{domain.upper()} 讲解：{prompt_id.replace('-', ' ')}",
        summary=prompt, steps=steps,
    )
    return script.model_dump_json(indent=2)


_BUILDERS = {
    "math": _make_math_playbook,
    "algorithm": _make_algorithm_playbook,
}


def _generate_single(prompt_id: str, prompt: str, domain: str) -> str:
    builder = _BUILDERS.get(domain)
    if builder:
        return builder(prompt, prompt_id)
    return _make_generic_playbook(prompt, prompt_id, domain)


# ---------------------------------------------------------------------------
# Live-mode fixture generation
# ---------------------------------------------------------------------------


def _generate_live(prompt: str, api_base: str, timeout: int = 180) -> str:
    try:
        import httpx
    except ImportError:
        raise RuntimeError("httpx not installed; run: uv add httpx") from None

    payload = {"prompt": prompt, "generation_mode": "agent"}
    resp = httpx.post(f"{api_base}/api/pipeline/run", json=payload, timeout=timeout)
    resp.raise_for_status()
    data = resp.json()
    playbook = data.get("playbook")
    if playbook is None:
        raise ValueError(f"No 'playbook' in response: {list(data.keys())}")
    if isinstance(playbook, dict):
        return json.dumps(playbook, ensure_ascii=False, indent=2)
    return playbook


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Generate eval fixtures")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--single", action="store_true", default=True)
    mode.add_argument("--live", action="store_true")
    parser.add_argument("--prompts", default=str(PROMPTS_DEFAULT))
    parser.add_argument("--api", default="http://localhost:8000")
    parser.add_argument("--ids", nargs="*")
    parser.add_argument("--overwrite", action="store_true")
    args = parser.parse_args(argv)

    prompts_path = pathlib.Path(args.prompts)
    if not prompts_path.exists():
        print(f"Error: {prompts_path} not found", file=sys.stderr)
        return 1

    data = yaml.safe_load(prompts_path.read_text())
    prompts: list[dict] = data.get("prompts", [])
    if args.ids:
        prompts = [p for p in prompts if p["id"] in args.ids]

    FIXTURES_DIR.mkdir(parents=True, exist_ok=True)
    mode_label = "live" if args.live else "single"
    print(f"\nGenerating {len(prompts)} fixtures  [mode: {mode_label}]")
    print("-" * 60)

    ok, skipped, failed = 0, 0, 0
    for item in prompts:
        pid = item["id"]
        prompt = item["prompt"]
        domain = item.get("domain", "math")
        out_path = FIXTURES_DIR / f"{pid}.json"

        if out_path.exists() and not args.overwrite:
            print(f"  skip  {pid}")
            skipped += 1
            continue

        try:
            raw = (
                _generate_live(prompt, args.api)
                if args.live
                else _generate_single(pid, prompt, domain)
            )
            out_path.write_text(raw)
            print(f"  ok    {pid}")
            ok += 1
        except Exception as exc:
            print(f"  FAIL  {pid}: {exc}")
            failed += 1

        if args.live:
            time.sleep(1)

    print(f"\n  {ok} generated, {skipped} skipped, {failed} failed")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
