import type {
  MathPlotSnapshot,
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
 * 导数与切线 · 从伽利略斜面到瞬时速度。
 *
 * Galileo's inclined-plane distances (folio 107v, c. 1604, as transcribed by
 * Stillman Drake): eight equal "beats" of a water clock, distances in punti.
 * Normalised by the first beat they sit on the square numbers, which makes the
 * parabola f(t)=t² a measured object rather than a decreed one — the same
 * data-first opening the ecology coursepack uses.
 */
const GALILEO_PUNTI: readonly number[] = [33, 130, 298, 526, 824, 1192, 1620, 2123];

/** Distances in units of the first beat (33 punti): ≈ 1, 3.94, 9.03, … 64.33. */
const GALILEO_UNITS: readonly number[] = GALILEO_PUNTI.map((value) => value / GALILEO_PUNTI[0]);

/** Per-beat increments in first-beat units: ≈ the odd numbers 1, 3, 5, … 15. */
const GALILEO_INCREMENTS: readonly number[] = GALILEO_PUNTI.map((value, index) =>
  index === 0 ? 1 : (value - GALILEO_PUNTI[index - 1]) / GALILEO_PUNTI[0],
);

const X_MAX = 8.4;
const Y_MAX = 72;

/** Straight line `slope·x + intercept` as an evaluator-safe expression. */
function lineExpression(slope: number, intercept: number): string {
  const m = Number(slope.toPrecision(12)).toString();
  const b = Number(intercept.toPrecision(12));
  if (b === 0) return `${m}*x`;
  return `${m}*x${b > 0 ? "+" : "-"}${Math.abs(b)}`;
}

const CURVE = {
  expression: "x^2",
  label: "s(t)=t²",
  emphasis: "primary" as const,
  semantic_role: "distance_curve",
};

const DERIVATIVE_CURVE = {
  expression: "2*x",
  label: "f′(t)=2t",
  emphasis: "secondary" as const,
  semantic_role: "derivative_curve",
};

function secantCurve(a: number, h: number) {
  const slope = 2 * a + h;
  return {
    expression: lineExpression(slope, -a * a - a * h),
    label: `割线斜率 ${fixed(slope)}`,
    emphasis: "secondary" as const,
    semantic_role: "secant_line",
  };
}

// The canvas drag pilot (interaction/engine.ts) binds to the curve whose
// semantic_role is exactly "tangent" — keep that contract intact.
function tangentCurve(a: number) {
  return {
    expression: lineExpression(2 * a, -(a * a)),
    label: `切线斜率 ${fixed(2 * a)}`,
    emphasis: "accent" as const,
    semantic_role: "tangent",
  };
}

function observationPoints(emphasis: "primary" | "secondary"): NonNullable<MathPlotSnapshot["points"]> {
  return GALILEO_UNITS.map((value, index) => ({
    x: index + 1,
    y: value,
    label: index === 0 || index === GALILEO_UNITS.length - 1 ? fixed(value, 1) : null,
    emphasis,
    semantic_role: "observed_distance",
  }));
}

function plot(args: {
  curves: MathPlotSnapshot["curves"];
  points?: MathPlotSnapshot["points"];
  marker?: number | null;
  shade?: readonly [number, number];
  yMin?: number;
  caption: string;
  formula: string;
}): MathPlotSnapshot {
  return {
    kind: "math_plot",
    pack_id: "math-basic",
    curves: args.curves,
    points: args.points,
    x_min: 0,
    x_max: X_MAX,
    y_min: args.yMin ?? 0,
    y_max: Y_MAX,
    marker_x: args.marker ?? null,
    shade_from: args.shade?.[0] ?? null,
    shade_to: args.shade?.[1] ?? null,
    x_label: "时间 t（拍）",
    y_label: "距离 s（第一拍 = 1）",
    formula_latex: args.formula,
    caption: args.caption,
  };
}

export function buildDerivativeTangentGoldPlaybook(params: TemplatePreviewParams): PlaybookScript {
  const a = boundedNumber(params, "a", 2, 0.5, 3.5);
  const h = boundedNumber(params, "h", 1, 0.05, 2);
  const secantSlope = 2 * a + h;
  const tangentSlope = 2 * a;
  const shrink = [1, 0.5, 0.1, 0.05].map((gap) => `h=${fixed(gap)} 斜率 ${fixed(2 * a + gap)}`);
  const steps: MetaStep[] = [
    sceneStep(0, "derivative-galileo-data", "先看数据：斜面上的八拍", `1604 年前后，伽利略让铜球沿斜面滚下，用琴弦和水钟标出等时的八拍，在手稿第 107 页留下八个距离：${GALILEO_PUNTI.join("、")}。把第一拍记作 1 个单位，它们几乎就是 1、4、9、16——平方数。曲线好认，问题难答：球在第 2 拍那一瞬间究竟滚多快？水钟量得出一段时间，量不出一个瞬间。`, plot({
      curves: [],
      points: observationPoints("primary"),
      caption: "数据：伽利略手稿 f.107v（Drake 整理）；纵轴以第一拍距离为单位。",
      formula: String.raw`s(t)\overset{?}{\propto}t^2`,
    })),
    sceneStep(1, "derivative-odd-rule", "奇数律：为什么是平方", `看相邻两拍之间多滚的距离：${GALILEO_INCREMENTS.map((value) => fixed(value, 2)).join("、")}——几乎就是奇数 1、3、5、7、9、11、13、15。而前 t 个奇数之和恰好是 t²，于是一条曲线 s(t)=t² 穿过全部八个点。伽利略把它称为奇数律；三百年后的教科书叫它匀加速。`, plot({
      curves: [CURVE],
      points: observationPoints("primary"),
      caption: "等时段位移差按奇数递增，累加即平方数。",
      formula: String.raw`1+3+\cdots+(2t-1)=t^2`,
    })),
    sceneStep(2, "derivative-secant", "平均速度就是割线", `先回答一个答得出的问题：从 t=${fixed(a)} 到 t=${fixed(a + h)} 的平均速度。位移差除以时间差，(f(a+h)−f(a))/h=2a+h=${fixed(secantSlope)}——在图上，它就是连接 (${fixed(a)}, ${fixed(a * a)}) 与 (${fixed(a + h)}, ${fixed((a + h) ** 2)}) 这条割线的斜率。但“平均”抹掉了过程：它仍然不是 t=${fixed(a)} 那一瞬的快慢。`, plot({
      curves: [CURVE, secantCurve(a, h)],
      points: observationPoints("secondary"),
      marker: a,
      shade: [a, a + h],
      yMin: -10,
      caption: "阴影是所取的时间段；割线连接段两端的曲线点。",
      formula: String.raw`\frac{f(a+h)-f(a)}{h}=2a+h=${fixed(secantSlope)}`,
    })),
    sceneStep(3, "derivative-shrink-h", "把 h 拧小：数列咬住一个值", `割线的两脚正在互相靠近。a=${fixed(a)} 时：${shrink.join("；")}。h 每砍一半，斜率与 ${fixed(tangentSlope)} 的距离也恰好砍一半——数列死死咬住 ${fixed(tangentSlope)}。右侧的 h 现在归你：把它从 1 拖到 0.05，看割线一路贴向那条还没画出的极限直线。`, plot({
      curves: [CURVE, secantCurve(a, h)],
      points: observationPoints("secondary"),
      marker: a,
      shade: [a, a + h],
      yMin: -10,
      caption: `当前 h=${fixed(h)}，割线斜率 ${fixed(secantSlope)}；与 2a 的差恰是 h 本身。`,
      formula: String.raw`(2a+h)-2a=h`,
    })),
    sceneStep(4, "derivative-tangent", "h 趋于零：割线的极限是切线", `让 h 一路趋近于零——割线绕着切点转动，停在一个确定的极限位置：这条直线就是切线，斜率 f′(a)=lim(h→0)(f(a+h)−f(a))/h=2a。当前 a=${fixed(a)}，f′(${fixed(a)})=${fixed(tangentSlope)}——“那一瞬间的速度”第一次有了严格定义。伽利略缺的正是这一步；六十年后，牛顿与莱布尼茨把“极限”造了出来。`, plot({
      curves: [CURVE, tangentCurve(a)],
      points: observationPoints("secondary"),
      marker: a,
      yMin: -10,
      caption: "切线只碰到曲线一次：两只脚已经并成同一个切点。",
      formula: String.raw`f'(${fixed(a)})=\lim_{h\to0}(2a+h)=${fixed(tangentSlope)}`,
    })),
    sceneStep(5, "derivative-function", "每一点都有自己的斜率", `切点不必钉死：a 滑到哪里，斜率就是 2a。把每个位置的斜率收集起来，得到一个新函数 f′(t)=2t，叫导函数——它就是速度随时间的规律：匀加速运动的速度线性增长。拖动右侧的切点 a，看切线沿抛物线滑动，斜率同步改写。`, plot({
      curves: [CURVE, DERIVATIVE_CURVE, tangentCurve(a)],
      marker: a,
      yMin: -10,
      caption: `切点 a=${fixed(a)}：曲线上的斜率 ${fixed(tangentSlope)}，恰是直线 f′(t)=2t 在同一时刻的高度。`,
      formula: String.raw`f'(t)=2t`,
    })),
    sceneStep(6, "derivative-verify-odd", "回到 1604：在数据里验证导数", `用伽利略自己的数据检验：第 4 到第 5 拍，理论位移差 f(5)−f(4)=25−16=9，观测值 (824−526)/33=${fixed(GALILEO_INCREMENTS[4], 2)}。而 9 恰好等于区间中点的瞬时速度 f′(4.5)=9——抛物线上每段的平均速度都等于其中点的瞬时速度，位移差因此按 1、3、5、7 递增：奇数律正是“速度 2t 线性增长”在等时采样下的影子。`, plot({
      curves: [CURVE, DERIVATIVE_CURVE],
      points: observationPoints("primary"),
      marker: 4.5,
      shade: [4, 5],
      caption: "偏差约 0.3%，在水钟的精度之内。数据与导数互相咬合。",
      formula: String.raw`f(5)-f(4)=9=f'(4.5)`,
    })),
    sceneStep(7, "derivative-skeleton", "骨架：瞬时变化率", `导数抓住的骨架是“瞬时变化率”：位置的导数是速度，速度的导数是加速度；生态课里 dN/dt 度量种群增长，经济里它叫边际。条件只有一个——曲线要足够光滑，有折角的地方没有切线。沙盘：a 和 h 都归你，把 a 拖到别处验证斜率恒为 2a，把 h 拖大，看“平均”与“瞬时”的差距重新张开。下一课把这个过程反过来：用无数细条，把面积找回来。`, plot({
      curves: [CURVE, tangentCurve(a), secantCurve(a, h), DERIVATIVE_CURVE],
      points: observationPoints("secondary"),
      marker: a,
      shade: [a, a + h],
      yMin: -10,
      caption: "沙盘：切线与割线同屏，差距由 h 决定。下一课：定积分。",
      formula: String.raw`\boxed{f'(a)=\lim_{h\to0}\frac{f(a+h)-f(a)}{h}=2a}`,
    })),
  ];
  return playbook(
    "math",
    "导数与切线 · 从伽利略斜面到瞬时速度",
    "伽利略 1604 斜面数据、奇数律、割线极限、导函数与中点速度验证。",
    "math_derivative_tangent",
    steps,
    [
      { id: "a", label: "切点 a", value: fixed(a), description: "0.5 到 3.5；切线与导数值同步改写" },
      { id: "h", label: "间隔 h", value: fixed(h), description: "拖向 0.05 看割线贴住切线" },
    ],
  );
}

export const DERIVATIVE_TANGENT_GOLD_TEMPLATE: GoldTemplateManifest = standaloneCase({
  caseId: "derivative-tangent",
  archetypeId: "math.calculus.derivative-tangent",
  subject: "high_school_math",
  domain: "calculus",
  topic: "导数",
  title: "导数与切线 · 从伽利略斜面到瞬时速度",
  description: "伽利略 1604 斜面数据、奇数律、割线极限、导函数与中点速度验证",
  prompt: "从伽利略 1604 年斜面实验的八拍距离数据出发讲解导数：奇数律为什么给出 s=t²，平均速度如何对应割线斜率 2a+h，h→0 时割线如何收敛为切线，定义 f′(a)=2a 并引出导函数 f′(t)=2t，最后用数据的位移差验证平均速度等于中点瞬时速度。",
  defaults: { a: 2, h: 1 },
  controls: [
    { id: "a", kind: "range", label: "切点 a", description: "切线沿抛物线滑动", min: 0.5, max: 3.5, step: 0.1, resetPlayback: false, steps: ["derivative-secant", "derivative-shrink-h", "derivative-tangent", "derivative-function", "derivative-skeleton"] },
    { id: "h", kind: "range", label: "间隔 h", description: "拖向 0.05 看割线收敛", min: 0.05, max: 2, step: 0.05, resetPlayback: false, steps: ["derivative-secant", "derivative-shrink-h", "derivative-skeleton"] },
  ],
  requiredCapabilities: ["math_plot", "expression_curve", "curve_marker", "data_points"],
  handsOn: ["derivative-shrink-h", "derivative-function"],
  expectedFacts: [
    { id: "derivative-data-first", description: "以伽利略 1604 斜面奇数律数据开场", anyOf: ["伽利略", "107", "奇数"] },
    { id: "derivative-secant-slope", description: "平均速度等于割线斜率 2a+h", anyOf: ["割线", "平均速度", "2a+h"] },
    { id: "derivative-limit", description: "导数定义为 h→0 的极限", anyOf: ["极限", "h→0", "趋近于零"] },
    { id: "derivative-value", description: "f′(a)=2a，默认切点斜率为 4", anyOf: ["2a", "f′(2)=4"] },
    { id: "derivative-function-view", description: "导函数 f′(t)=2t 是速度规律", anyOf: ["导函数", "2t"] },
    { id: "derivative-mvt-check", description: "位移差等于中点时刻的瞬时速度", anyOf: ["中点", "9.03", "f′(4.5)"] },
  ],
  visualInvariants: [{
    id: "derivative-visual",
    description: "抛物线、割线或切线与观测数据点同屏可辨认",
    requiredSemanticRoles: ["distance_curve", "secant_line", "tangent", "derivative_curve", "observed_distance"],
    requiredStateFields: ["curves", "points", "marker_x", "shade_from", "x_min"],
  }],
  objective: "从真实数据出发把平均速度识别为割线斜率，经由 h→0 的极限得到切线与导数 f′(a)=2a，并用导函数与奇数律互相验证。",
  minimumSteps: 8,
  builder: buildDerivativeTangentGoldPlaybook,
  mechanism: "割线斜率 (f(a+h)−f(a))/h=2a+h 与极限值 2a 只差 h 本身；h 可以任意小，差距随之任意小，这正是极限的含义。",
  mechanismByStep: {
    "derivative-galileo-data": "等时拍由水钟与琴弦校准，距离量到 punti（约 0.94 mm）。数据落在平方曲线上不是拟合巧合：匀加速意味着速度线性增长，位移随之按 t² 累积。",
    "derivative-odd-rule": "前 t 个奇数之和是 t²：把 (t−1)² 的方阵补上一圈 L 形恰好用去第 t 个奇数 2t−1 个单位格，累加即平方数。",
    "derivative-secant": "((a+h)²−a²)/h=(2ah+h²)/h=2a+h：先展开再约去 h，这一步要求 h≠0——也正因此，“平均”永远差“瞬时”最后一口气。",
    "derivative-shrink-h": "|(2a+h)−2a|=h：误差恰好等于间隔本身，h 砍半误差就砍半。“误差可以任意小”这句话，就是极限语言的全部内容。",
    "derivative-tangent": "约分在取极限之前完成，2a+h 对 h 连续，故 lim(h→0)(2a+h)=2a 合法；几何上割线的两个交点合并成唯一的切点。",
    "derivative-function": "对每个 a 重复同一套极限流程，结果 2a 只依赖 a——“斜率”于是自己成为函数。求导是从函数到函数的运算。",
    "derivative-verify-odd": "抛物线割线斜率 2a+h 恰等于中点 a+h/2 处的切线斜率：平均速度恒等于中点瞬时速度，等时差分因此线性递增。观测 9.03 与理论 9 偏差约 0.3%，在水钟精度内。",
    "derivative-skeleton": "可导要求局部像直线：不断放大后曲线与切线不可分辨。|t| 在 0 处左右斜率 −1 与 1 不相等，极限不存在，因此没有切线。",
  },
  transfer: "把 h 拖到 0.05 看斜率贴向 2a；再把 a 拖到 3 验证切线斜率变成 6；最后回到第 7 步，用相邻两拍的位移差核对奇数律。",
  posterStepIndex: 5,
});
