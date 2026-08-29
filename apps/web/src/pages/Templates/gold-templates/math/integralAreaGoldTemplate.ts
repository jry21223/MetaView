import type {
  MathSceneSnapshot,
  MetaStep,
  PlaybookScript,
} from "../../../../features/playbook/engine/types";
import type { TemplatePreviewParams } from "../../templatePreviewCases";
import type { GoldTemplateManifest } from "../manifest";
import {
  boundedNumber,
  fixed,
  playbook,
  sceneStep,
  standaloneCase,
} from "../standaloneCaseHelpers";

/**
 * 定积分 · 从阿基米德到黎曼和。
 *
 * The target area under y=x² on [0, b] is squeezed between left-endpoint and
 * right-endpoint rectangle sums. Both sums have closed forms — the lesson's
 * numbers are all exact:
 *
 *   upper  S_n = (b³/6)(1+1/n)(2+1/n)   (right endpoints, f increasing)
 *   lower  s_n = S_n − b³/n             (each column differs by one cap)
 *   exact  S   = b³/3
 *
 * Visual language: the lower sum is the green staircase, the upper sum is the
 * staircase plus orange caps, and the gap is the caps alone. Sliding every cap
 * to the right stacks them into one column of height f(b) and width Δx — the
 * telescoping proof-without-words that the gap is exactly b³/n.
 *
 * The scene units are square (Mafs preserves aspect), and the content block
 * [0,b]×[0,b²] is inherently 1:2 tall — so both flanks carry real content: the
 * value panel on the left, the cap stack on the right.
 */

export function upperRiemannSum(b: number, n: number): number {
  return (b ** 3 / 6) * (1 + 1 / n) * (2 + 1 / n);
}

export function lowerRiemannSum(b: number, n: number): number {
  return upperRiemannSum(b, n) - b ** 3 / n;
}

type Region = NonNullable<MathSceneSnapshot["regions"]>[number];
type ScenePoint = NonNullable<MathSceneSnapshot["points"]>[number];

/** Green staircase: left-endpoint rectangles (the k=0 slab has zero height). */
function lowerRectangles(b: number, n: number): Region[] {
  const width = b / n;
  const regions: Region[] = [];
  for (let k = 1; k < n; k += 1) {
    const left = k * width;
    const height = left ** 2;
    regions.push({
      vertices: [[left, 0], [left + width, 0], [left + width, height], [left, height]],
      emphasis: "primary",
      semantic_role: "riemann_rectangle",
    });
  }
  return regions;
}

/**
 * Orange caps: per column, the strip between the lower and the upper
 * rectangle. Staircase + caps = the upper sum; caps alone = the gap.
 */
function gapCaps(b: number, n: number): Region[] {
  const width = b / n;
  return Array.from({ length: n }, (_, k) => {
    const left = k * width;
    const lowerEdge = left ** 2;
    const upperEdge = (left + width) ** 2;
    return {
      vertices: [
        [left, lowerEdge],
        [left + width, lowerEdge],
        [left + width, upperEdge],
        [left, upperEdge],
      ],
      emphasis: "accent",
      semantic_role: "gap_strip",
    } satisfies Region;
  });
}

/**
 * The caps translated to one column right of the plot: strip k keeps its own
 * y-range, so the pile is contiguous from 0 to f(b) — one rectangle of width
 * Δx and height b², i.e. exactly the gap b³/n.
 */
function gapStack(b: number, n: number): Region[] {
  const width = b / n;
  const stackLeft = 1.18 * b;
  return Array.from({ length: n }, (_, k) => {
    const lowerEdge = (k * width) ** 2;
    const upperEdge = ((k + 1) * width) ** 2;
    return {
      vertices: [
        [stackLeft, lowerEdge],
        [stackLeft + width, lowerEdge],
        [stackLeft + width, upperEdge],
        [stackLeft, upperEdge],
      ],
      emphasis: "accent",
      semantic_role: "gap_stack",
    } satisfies Region;
  });
}

/** Dots where the rectangle heights touch the curve (left or right endpoints). */
function endpointDots(b: number, n: number, side: "left" | "right"): ScenePoint[] {
  const width = b / n;
  const first = side === "left" ? 0 : 1;
  return Array.from({ length: n }, (_, k) => {
    const x = (k + first) * width;
    return {
      x,
      y: x ** 2,
      emphasis: side === "left" ? "primary" : "accent",
      semantic_role: "sample_point",
    } satisfies ScenePoint;
  });
}

function targetAreaRegion(b: number, emphasis: "secondary" | "accent", upTo = b): Region {
  const samples = 32;
  const vertices: Array<[number, number]> = [[0, 0]];
  for (let index = 0; index <= samples; index += 1) {
    const x = (index / samples) * upTo;
    vertices.push([x, x ** 2]);
  }
  vertices.push([upTo, 0]);
  return { vertices, emphasis, semantic_role: "target_area", label: null };
}

export function buildIntegralAreaGoldPlaybook(params: TemplatePreviewParams): PlaybookScript {
  const n = Math.round(boundedNumber(params, "n", 4, 2, 64));
  const b = boundedNumber(params, "b", 2, 1, 3);
  const lower = lowerRiemannSum(b, n);
  const upper = upperRiemannSum(b, n);
  const exact = b ** 3 / 3;
  const gap = b ** 3 / n;
  const frontier = 0.7 * b;
  const bText = fixed(b);
  // Parametric so the parabola stays clipped to the teaching range instead of
  // sprouting its x<0 branch across the value panel.
  // The Mafs stage does not clip overflow, so each frame's curve must top out
  // inside its own window (tight y_max 1.03b², wide 1.14b²).
  const areaCurve = (frame: "tight" | "wide") => ({
    expression_x: "t",
    expression_y: "t^2",
    t_min: -0.06 * b,
    t_max: (frame === "tight" ? 1.005 : 1.03) * b,
    label: "y=x²",
    emphasis: "primary" as const,
    semantic_role: "area_curve",
  });
  // Mafs' background grid washes out on the paper theme, so the number line
  // the narration leans on ("从 0 到 b") is drawn explicitly: an x-axis with
  // ticks and labels at 0 and b, extended under the cap stack in wide frames.
  const axisFurniture = (frame: "tight" | "wide") => ({
    segments: [
      {
        x0: -0.28 * b,
        y0: 0,
        x1: (frame === "tight" ? 1.28 : 1.7) * b,
        y1: 0,
        emphasis: "secondary",
        semantic_role: "x_axis",
      },
      ...[0, b].map((x) => ({
        x0: x,
        y0: 0,
        x1: x,
        y1: -0.045 * b * b,
        emphasis: "secondary",
        semantic_role: "axis_tick",
      })),
    ] satisfies MathSceneSnapshot["segments"],
    annotations: [
      { x: 0, y: -0.09 * b * b, text: "$0$", semantic_role: "axis_label" },
      { x: b, y: -0.09 * b * b, text: `$${bText}$`, semantic_role: "axis_label" },
    ],
  });
  const scene = (args: {
    regions?: Region[];
    points?: ScenePoint[];
    segments?: MathSceneSnapshot["segments"];
    annotations?: MathSceneSnapshot["annotations"];
    valuePanel?: string;
    caption: string;
    formula: string;
    /**
     * "tight" frames the opening acts on the figure itself; "wide" reserves
     * the flanks the later acts fill (value panel left, cap stack right).
     * The reframe lands on the slide-caps step, where pulling back to make
     * room on the right is the story.
     */
    frame?: "tight" | "wide";
  }): MathSceneSnapshot => {
    const frame = args.frame ?? "wide";
    const axis = axisFurniture(frame);
    return {
      kind: "math_scene",
      camera_mode: "fixed",
      ...(frame === "tight"
        // The stage's height is the binding constraint under square units, so
        // the tight frame trims the vertical span instead of the flanks: the
        // curve pierces the top edge and the figure gains real size.
        ? { x_min: -0.35 * b, x_max: 1.35 * b, y_min: -0.17 * b * b, y_max: 1.06 * b * b }
        : { x_min: -0.66 * b, x_max: 1.74 * b, y_min: -0.19 * b * b, y_max: 1.14 * b * b }),
      x_label: "x",
      y_label: "y",
      curves: [areaCurve(frame)],
      regions: args.regions ?? [],
      points: args.points ?? [],
      segments: [...axis.segments, ...(args.segments ?? [])],
      annotations: [
        ...axis.annotations,
        ...(args.valuePanel
          ? [{
              // Tight frames have no left flank; the panel sits in the empty
              // upper-left corner above the staircase's shallow end instead.
              x: frame === "tight" ? 0.1 * b : -0.4 * b,
              y: 0.86 * b * b,
              text: args.valuePanel,
              semantic_role: "value_panel",
            }]
          : []),
        ...(args.annotations ?? []),
      ],
      formula_latex: args.formula,
      caption: args.caption,
    };
  };
  const refineLadder = [8, 16, 64]
    .map((count) => `n=${count}，${fixed(lowerRiemannSum(b, count))} 与 ${fixed(upperRiemannSum(b, count))}`)
    .join("；");
  const steps: MetaStep[] = [
    sceneStep(0, "integral-puzzle", "曲边图形：公式失效的地方", `三角形、长方形、圆——古典几何给每种规则图形都配了面积公式。可抛物线 y=x² 下方、从 0 到 ${bText} 的这块图形，有一条边是弯的，任何现成公式都套不上。公元前 3 世纪，阿基米德用穷竭法第一个算出了这类面积；两千年后，黎曼把那套办法炼成了定义。目标只有一个数：这块面积 S 究竟是多少。`, scene({
      frame: "tight",
      regions: [targetAreaRegion(b, "secondary")],
      annotations: [
        { x: 0.58 * b, y: 0.22 * b * b, text: "$S=\\,?$", semantic_role: "area_question" },
      ],
      caption: "曲边梯形：三条直边，加一条抛物线弧。",
      formula: String.raw`S=\,?`,
    })),
    sceneStep(1, "integral-lower-sum", "地板：藏在曲线下面的矩形", `用手里有的东西——矩形——去逼近。把 [0, ${bText}] 均分成 n=${n} 段，每段以左端点的曲线高度立一个矩形——圆点标出每块矩形的高度从曲线上哪里来。因为 y=x² 递增，它们全部藏在曲线下方，总面积是 ${fixed(lower)}。无论真值 S 是多少，它一定大于 ${fixed(lower)}——我们拿到了一块地板。`, scene({
      frame: "tight",
      regions: lowerRectangles(b, n),
      points: endpointDots(b, n, "left"),
      valuePanel: `$s_{${n}}=${fixed(lower)}$`,
      caption: "绿色阶梯是下和：每一块都不越过曲线。",
      formula: String.raw`s_{n}=\sum_{k=0}^{n-1}f(x_k)\,\Delta x=${fixed(lower)}`,
    })),
    sceneStep(2, "integral-upper-sum", "天花板：每列加一顶帽子", `把每列矩形加高到右端点的曲线高度——图中橙色的帽子。绿色阶梯加上橙色帽子就是上和 ${fixed(upper)}，它盖住了整块曲边图形。于是真值被夹住了：${fixed(lower)} < S < ${fixed(upper)}。而夹缝——上和多出来的部分——恰恰就是那些橙色帽子本身，总面积 ${fixed(gap)}。`, scene({
      frame: "tight",
      regions: [...lowerRectangles(b, n), ...gapCaps(b, n)],
      points: endpointDots(b, n, "right"),
      valuePanel: `$s_{${n}}=${fixed(lower)},\\ S_{${n}}=${fixed(upper)}$`,
      caption: "绿=下和；绿+橙=上和；橙色帽子=夹缝。",
      formula: String.raw`S_{${n}}-s_{${n}}=${fixed(gap)}`,
    })),
    sceneStep(3, "integral-refine", "滑动橙色帽子：夹缝的真身", `把每顶橙色帽子水平滑到图形右侧：它们各自保持高度，恰好首尾相接，摞成一根宽 Δx=${fixed(b / n, 3)}、高 f(${bText})=${fixed(b * b)} 的细柱——夹缝的总面积就是 f(${bText})·Δx=${fixed(b ** 3, 1)}/n。所以 n 每翻一倍，柱子细一半，夹缝精确减半：${refineLadder}。右侧的 n 归你：拖到 64，看这根柱子当着你的面消失。`, scene({
      regions: [...lowerRectangles(b, n), ...gapCaps(b, n), ...gapStack(b, n)],
      segments: [{
        x0: 1.04 * b,
        y0: 0.5 * b * b,
        x1: 1.16 * b,
        y1: 0.5 * b * b,
        arrow: true,
        emphasis: "accent",
        semantic_role: "slide_hint",
      }],
      // The corner formula card already states S_n−s_n=f(b)·Δx; an in-plot
      // duplicate only collides with the title or the caption.
      valuePanel: `$S_{${n}}-s_{${n}}=${fixed(gap)},\\ \\Delta x=${fixed(b / n, 3)}$`,
      caption: `帽子平移不改变面积：夹缝 = 最右一根柱 = f(${bText})·Δx。`,
      formula: String.raw`S_n-s_n=f(${bText})\cdot\Delta x=\frac{${fixed(b ** 3, 1)}}{n}`,
    })),
    sceneStep(4, "integral-exact-sum", "精确求和：阿基米德的武器", `夹缝中央到底是哪个数？右和有闭式：S_n=(b³/n³)·(1²+2²+⋯+n²)，代入平方和公式 1²+⋯+n²=n(n+1)(2n+1)/6，得 S_n=(b³/6)(1+1/n)(2+1/n)。这条求和公式在阿基米德的时代就已知——他正是用它的几何版本证明抛物线弓形等于内接三角形的 4/3。现在让 n 无限增大：两个括号分别趋于 1 和 2，S_n 趋于 b³/3=${fixed(exact)}。`, scene({
      regions: [...lowerRectangles(b, n), ...gapCaps(b, n)],
      valuePanel: `$S_{${n}}=${fixed(upper)}\\to ${fixed(exact)}$`,
      caption: "闭式在手，极限只是让 1/n 归零。",
      formula: String.raw`S_n=\frac{b^3}{6}\Bigl(1+\frac1n\Bigr)\Bigl(2+\frac1n\Bigr)\to\frac{b^3}{3}`,
    })),
    sceneStep(5, "integral-definition", "定义：把极限写成 ∫", `于是可以放心定义：这块面积 S=lim Σf(xₖ)Δx=${fixed(exact)}。莱布尼茨在 1675 年把求和 Summa 的首字母 S 拉长，造出记号 ∫——被积函数 x²、下限 0、上限 ${bText} 各就各位。下和与上和收敛到同一个 b³/3，这个数从此不再依赖矩形怎么摆：定积分存在。`, scene({
      regions: [targetAreaRegion(b, "accent")],
      valuePanel: `$\\int_0^{${bText}}x^2\\,dx=${fixed(exact)}$`,
      caption: "极限收口之后，面积第一次成为一个确定的数。",
      formula: String.raw`\int_0^{${bText}}x^2\,dx=\frac{${bText}^3}{3}=${fixed(exact)}`,
    })),
    sceneStep(6, "integral-ftc", "换一条路验证：请出上一课的导数", `用完全独立的第二条路检查。令面积函数 A(x) 表示从 0 积到 x 的面积：x 向右挪一小步，新增的橙色窄条面积约等于 f(x) 乘步长——所以 A′(x)=x²，面积的瞬时增长率恰是右边界的高度。于是找一个导数为 x² 的函数：F(x)=x³/3，则 S=F(${bText})−F(0)=${fixed(exact)}，与矩形夹逼分毫不差。求面积与求切线互为逆运算——这就是微积分基本定理。`, scene({
      regions: [
        targetAreaRegion(b, "secondary", frontier),
        {
          vertices: [
            [frontier, 0],
            [frontier + 0.06 * b, 0],
            [frontier + 0.06 * b, frontier ** 2],
            [frontier, frontier ** 2],
          ],
          emphasis: "accent",
          semantic_role: "marginal_strip",
        },
      ],
      segments: [{ x0: frontier, y0: 0, x1: frontier, y1: frontier ** 2, arrow: false, label: "f(x)", emphasis: "accent", semantic_role: "area_frontier" }],
      annotations: [{
        x: frontier + 0.32 * b,
        y: frontier ** 2 + 0.12 * b * b,
        text: "$\\Delta A\\approx f(x)\\,\\Delta x$",
        semantic_role: "marginal_note",
      }],
      valuePanel: `$A'(x)=x^2,\\ F(x)=\\tfrac{x^3}{3}$`,
      caption: "推进中的右边界：新增橙色窄条的高度就是 f(x)。",
      formula: String.raw`S=F(${bText})-F(0)=${fixed(exact)}`,
    })),
    sceneStep(7, "integral-transfer", "骨架：切细、求和、取极限", `“切细—求和—取极限”是把无数微小贡献累积成总量的通用骨架：速度曲线下的面积是路程——伽利略斜面故事的另一半；力沿位移累积成功；概率密度下的面积是概率。阿基米德的穷竭、黎曼的矩形、莱布尼茨的记号，说的都是同一件事。沙盘：n 与上限 b 都归你——把 n 拖到 64 看橙色夹缝消失，把 b 拖到 3 验证面积变成 27/3=9。`, scene({
      regions: [...lowerRectangles(b, n), ...gapCaps(b, n), targetAreaRegion(b, "secondary")],
      valuePanel: `$n=${n},\\ b=${bText},\\ S=${fixed(exact)}$`,
      caption: "沙盘：矩形与真实面积同屏，橙色是仍未消化的误差。",
      formula: String.raw`\boxed{\int_0^{b}x^2\,dx=\lim_{n\to\infty}\sum_{k}f(x_k)\,\Delta x=\frac{b^3}{3}}`,
    })),
  ];
  return playbook(
    "math",
    "定积分 · 从阿基米德到黎曼和",
    "下和阶梯加橙色帽子夹出曲边面积，帽子滑移摞成 b³/n，闭式取极限，基本定理双路验证。",
    "math_integral_riemann_area",
    steps,
    [
      { id: "n", label: "矩形数量 n", value: String(n), description: "2 到 64；夹缝按 b³/n 收窄" },
      { id: "b", label: "积分上限 b", value: bText, description: "1 到 3；面积始终是 b³/3" },
    ],
  );
}

export const INTEGRAL_AREA_GOLD_TEMPLATE: GoldTemplateManifest = standaloneCase({
  caseId: "integral-area",
  archetypeId: "math.calculus.integral-riemann-area",
  subject: "high_school_math",
  domain: "calculus",
  topic: "定积分",
  title: "定积分 · 从阿基米德到黎曼和",
  description: "下和阶梯与橙色夹缝帽、帽子滑移的 b³/n 无字证明、∫ 记号与基本定理双路验证",
  prompt: "讲解定积分 ∫₀² x² dx 的几何意义：用左端点矩形建立下和，给每列加右端点高度的帽子得到上和，把帽子平移堆叠证明夹缝恰为 b³/n 并随 n 加密收窄，用平方和公式求出极限 8/3，引入 ∫ 记号，再用面积函数的导数与 F(x)=x³/3 做微积分基本定理的第二路验证。",
  defaults: { n: 4, b: 2 },
  controls: [
    { id: "n", kind: "range", label: "矩形数量 n", description: "加密矩形，夹缝减半", min: 2, max: 64, step: 1, resetPlayback: false, steps: ["integral-lower-sum", "integral-upper-sum", "integral-refine", "integral-exact-sum", "integral-transfer"] },
    { id: "b", kind: "range", label: "积分上限 b", description: "面积随之变成 b³/3", min: 1, max: 3, step: 0.1, resetPlayback: false },
  ],
  requiredCapabilities: ["math_scene", "expression_curve", "filled_region", "formula_card"],
  handsOn: ["integral-refine", "integral-transfer"],
  expectedFacts: [
    { id: "integral-archimedes", description: "以阿基米德穷竭法与抛物线弓形开场", anyOf: ["阿基米德", "穷竭", "4/3"] },
    { id: "integral-sandwich", description: "下和与上和从两侧夹住面积", anyOf: ["夹住", "地板", "天花板"] },
    { id: "integral-gap", description: "夹缝恰为帽子堆叠 f(b)·Δx=b³/n 并随加密减半", anyOf: ["8/n", "b³/n", "f(2)·Δx", "减半"] },
    { id: "integral-square-sum", description: "平方和闭式 n(n+1)(2n+1)/6 给出精确极限", anyOf: ["n(n+1)(2n+1)/6", "平方和"] },
    { id: "integral-value", description: "∫₀²x²dx=8/3", anyOf: ["8/3", "b³/3", "2.67"] },
    { id: "integral-ftc", description: "微积分基本定理：A′(x)=f(x)，S=F(b)−F(0)", anyOf: ["x³/3", "基本定理", "互为逆"] },
  ],
  visualInvariants: [{
    id: "integral-visual",
    description: "抛物线、下和阶梯、橙色夹缝帽与目标曲边区域同屏可辨认",
    requiredSemanticRoles: ["area_curve", "riemann_rectangle", "gap_strip", "gap_stack", "target_area", "x_axis"],
    requiredStateFields: ["curves", "regions", "points", "annotations", "x_min"],
  }],
  objective: "把曲边面积识别为上下矩形和的公共极限，用帽子滑移看见夹缝 b³/n，用平方和闭式算出 b³/3，并以微积分基本定理做独立的第二路验证。",
  minimumSteps: 8,
  builder: buildIntegralAreaGoldPlaybook,
  mechanism: "f 在 [0,b] 上递增，左端点矩形恒在曲线下、右端点补高的帽子恒盖住曲线；两串和单调逼近同一极限，夹缝 b³/n 可任意小。",
  mechanismByStep: {
    "integral-puzzle": "直边图形可以剖分成三角形处理，曲边不行：任何有限次直线剖分都留下弯曲的残边。阿基米德的穷竭法正是“用无穷多个直边图形吃掉残边”。",
    "integral-lower-sum": "y=x² 在 [0,b] 上单调递增，每段的最小值在左端点取得，所以左端点矩形整块位于曲线下方，s_n 是 S 的下界。",
    "integral-upper-sum": "同一段的最大值在右端点取得，帽子把矩形补高到右端点后盖住该段全部曲线下面积；于是 s_n<S<s_n+帽子面积=S_n 对每个 n 都成立。",
    "integral-refine": "第 k 顶帽子的高度是 f(x_{k+1})−f(x_k)；水平平移不改变面积，而这些高度首尾相接恰好望远镜求和成 f(b)−f(0)=b²——所以整摞是一根 b²×Δx 的柱子，夹缝随 1/n 线性消失。",
    "integral-exact-sum": "S_n=Σ(kΔx)²Δx=(b³/n³)Σk²；代入 Σk²=n(n+1)(2n+1)/6 后，n 只以 1/n 的形式出现，极限一目了然。",
    "integral-definition": "下和上和的公共极限存在且唯一，才允许把“面积”定义为这个极限；对连续函数这一点总成立，这正是黎曼积分的内容。",
    "integral-ftc": "A(x+Δx)−A(x) 是那根橙色窄条，夹在 f(x)Δx 与 f(x+Δx)Δx 之间，除以 Δx 取极限得 A′(x)=f(x)；再由“导数相同的函数只差常数”得 S=F(b)−F(0)。",
    "integral-transfer": "被积函数换成速度 v(t)，同一套黎曼和就是“短时间×速度”的路程累加——上一课导数把位置变速度，这一课积分把速度变回位置，两个方向互逆。",
  },
  transfer: "把 n 从 4 拖到 64，看右侧橙色柱子按 b³/n 变细直至消失；再把 b 拖到 3，验证面积变成 27/3=9，且第 7 步的 F(b)−F(0) 给出同一个数。",
  posterStepIndex: 3,
});
