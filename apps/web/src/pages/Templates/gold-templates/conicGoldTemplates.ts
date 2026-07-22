import type { MathSceneSnapshot, MetaStep, PlaybookScript } from "../../../features/playbook/engine/types";
import {
  chordFromIntersection,
  ellipseFocalDistanceSum,
  ellipseFoci,
  ellipseImplicit,
  ellipsePoint,
  hyperbolaFocalDistanceDifference,
  hyperbolaFoci,
  hyperbolaPoint,
  intersectLineConic,
  parabolaDefinitionDistances,
  parabolaFocus,
  parabolaPoint,
  type LineSpec,
} from "../../../shared/domain/conicSections";
import type {
  TemplatePreviewFollowups,
  TemplatePreviewParams,
  TemplatePreviewQuestion,
} from "../templatePreviewCases";
import { resolveConicArchetype } from "../../../shared/domain/conicArchetypeCatalog";
import { attachPublicGoldTemplate, type GoldTemplateManifest } from "./manifest";

const FPS = 30;
const STEP_FRAMES = 90;

function numberParam(params: TemplatePreviewParams, key: string, fallback: number): number {
  const value = Number(params[key]);
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function fixed(value: number, digits = 2): string {
  const rounded = Number(value.toFixed(digits));
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

function sceneStep(index: number, id: string, title: string, narration: string, snapshot: MathSceneSnapshot): MetaStep {
  return { step_id: id, end_frame: (index + 1) * STEP_FRAMES, title, voiceover_text: narration, snapshot, tokens: [] };
}

function playbook(title: string, summary: string, algorithmId: string, steps: MetaStep[], controls: PlaybookScript["parameter_controls"]): PlaybookScript {
  return {
    schema_version: "2.0.0",
    fps: FPS,
    total_frames: steps.length * STEP_FRAMES,
    domain: "math",
    title,
    summary,
    steps,
    parameter_controls: controls,
    algorithm_id: algorithmId,
    initial_data: { scene_blueprint: [algorithmId], archetype: [algorithmId] },
  };
}

function followups(script: PlaybookScript, why: string, parameter: string): TemplatePreviewFollowups {
  return Object.fromEntries(script.steps.map((step) => [step.step_id, [
    { id: `${step.step_id}-q1`, question: "这一幕应该观察什么？", answer: step.voiceover_text },
    { id: `${step.step_id}-q2`, question: "为什么这个结论成立？", answer: why },
    { id: `${step.step_id}-q3`, question: "修改参数会怎样？", answer: parameter },
  ] satisfies TemplatePreviewQuestion[]]));
}

function ellipseCurve(a: number, b: number): NonNullable<MathSceneSnapshot["curves"]> {
  return [{
    expression_x: `${a}*cos(t)`, expression_y: `${b}*sin(t)`, t_min: 0, t_max: 2 * Math.PI,
    label: "椭圆", emphasis: "primary", semantic_role: "conic_curve",
  }];
}

function buildEllipseFocus(params: TemplatePreviewParams): PlaybookScript {
  const a = clamp(numberParam(params, "a", 5), 3, 7);
  const b = clamp(numberParam(params, "b", 3), 1, a - 0.5);
  const t = clamp(numberParam(params, "t", 1), 0, 2 * Math.PI);
  const spec = { a, b };
  const [f1, f2] = ellipseFoci(spec);
  const c = Math.sqrt(a * a - b * b);
  const p = ellipsePoint(spec, t);
  const d1 = Math.hypot(p.x - f1.x, p.y - f1.y);
  const d2 = Math.hypot(p.x - f2.x, p.y - f2.y);
  const base = (stage: number, caption: string, formula: string): MathSceneSnapshot => ({
    kind: "math_scene", camera_mode: "fixed", x_min: -a - 1.5, x_max: a + 1.5, y_min: -b - 1.5, y_max: b + 1.5,
    x_label: "x", y_label: "y", curves: ellipseCurve(a, b),
    points: [
      { ...f1, label: "$F_1$", emphasis: stage === 1 ? "accent" : "secondary", semantic_role: "focus" },
      { ...f2, label: "$F_2$", emphasis: stage === 1 ? "accent" : "secondary", semantic_role: "focus" },
      ...(stage >= 2 ? [{ ...p, label: "P", emphasis: "accent", semantic_role: "moving_point" }] : []),
    ],
    segments: stage >= 3 ? [
      { x0: p.x, y0: p.y, x1: f1.x, y1: f1.y, label: `PF₁=${fixed(d1)}`, emphasis: stage === 3 ? "accent" : "secondary", semantic_role: "focal_distance" },
      { x0: p.x, y0: p.y, x1: f2.x, y1: f2.y, label: `PF₂=${fixed(d2)}`, emphasis: stage === 3 ? "accent" : "secondary", semantic_role: "focal_distance" },
    ] : [],
    annotations: stage >= 4 ? [{ x: -a, y: b + 0.6, text: `$PF_1+PF_2=${fixed(d1 + d2)}=2a$`, align: "nw", semantic_role: "derivation_panel" }] : [],
    formula_latex: formula, caption,
  });
  const steps = [
    sceneStep(0, "ellipse-foci", "观察目标：寻找不变量", `先固定两个焦点 F₁、F₂；它们与中心的距离是 c=${fixed(c)}。`, base(1, "先记住两个定点，下一幕再引入动点。", String.raw`c=\sqrt{a^2-b^2}=${fixed(c)}`)),
    sceneStep(1, "ellipse-moving-point", "改变 t：记录动点 P", `当 t=${fixed(t)} 时，P=(${fixed(p.x)},${fixed(p.y)})；改变 t 只改变 P 的位置，P 仍在同一椭圆上。`, base(2, "这一步只追踪 P 的位置，暂不计算距离。", String.raw`P(t)=(${a}\cos t,${b}\sin t)`)),
    sceneStep(2, "ellipse-two-distances", "测量 PF₁ 与 PF₂", `连线后得 PF₁=${fixed(d1)}、PF₂=${fixed(d2)}。拖动 t 时，两段长度会一增一减。`, base(3, "先比较两个分量：它们都会变。", String.raw`PF_1=${fixed(d1)},\quad PF_2=${fixed(d2)}`)),
    sceneStep(3, "ellipse-distance-sum", "提出猜想：距离和不变", `当前 PF₁+PF₂=${fixed(d1 + d2)}，恰好等于 2a=${fixed(2 * a)}。改变 t 后可继续检查这个猜想。`, base(4, "单段距离在变，但它们的和保持为 2a。", String.raw`PF_1+PF_2=${fixed(d1 + d2)}=2a`)),
    sceneStep(4, "ellipse-shape-parameters", "代数解释：变化项相消", `由 b²=a²-c² 化简距离式，得 PF₁=a+c cos t，PF₂=a−c cos t；相加时变化项正好抵消。`, base(5, "不变不是图上的巧合：+ c cos t 与 − c cos t 相消。", String.raw`PF_1=a+c\cos t,\quad PF_2=a-c\cos t`)),
    sceneStep(5, "ellipse-definition", "验证并写出椭圆定义", `确定性计算再次得到 ${fixed(ellipseFocalDistanceSum(spec, p))}=2a。因此，椭圆就是到两定点的距离之和等于常数 2a 的点的轨迹。`, base(5, "观察、猜想、代数解释与当前数值在这里闭合。", String.raw`\boxed{PF_1+PF_2=2a=${fixed(2 * a)}}`)),
  ];
  return playbook("椭圆的焦点定义", "看见椭圆上动点到两焦点距离之和恒为 2a。", "conic_ellipse_focus_definition", steps, [
    { id: "a", label: "长半轴 a", value: fixed(a), description: "满足 a>b>0" },
    { id: "b", label: "短半轴 b", value: fixed(b), description: "自动限制为 b<a" },
    { id: "t", label: "动点参数 t", value: fixed(t), description: "0 到 2π" },
  ]);
}

function buildParabola(params: TemplatePreviewParams): PlaybookScript {
  const p = clamp(numberParam(params, "p", 1.5), 0.5, 3);
  const t = clamp(numberParam(params, "t", 1.2), -2.2, 2.2);
  const spec = { p };
  const focus = parabolaFocus(spec);
  const point = parabolaPoint(spec, t);
  const foot = { x: -p, y: point.y };
  const distances = parabolaDefinitionDistances(spec, point);
  const snapshot = (stage: number, caption: string, formula: string): MathSceneSnapshot => ({
    kind: "math_scene", camera_mode: "fixed", x_min: -p - 1.5, x_max: p * 5.5, y_min: -p * 5, y_max: p * 5,
    x_label: "x", y_label: "y",
    curves: [{ expression_x: `${p}*t^2`, expression_y: `${2 * p}*t`, t_min: -2.4, t_max: 2.4, label: "抛物线", emphasis: "primary", semantic_role: "conic_curve" }],
    points: [
      { ...focus, label: "F", emphasis: stage === 1 ? "accent" : "secondary", semantic_role: "focus" },
      ...(stage >= 2 ? [{ ...point, label: "P", emphasis: "accent", semantic_role: "moving_point" }] : []),
      ...(stage >= 3 ? [{ ...foot, label: "H", emphasis: "secondary", semantic_role: "projection_foot" }] : []),
    ],
    segments: [
      { x0: -p, y0: -p * 5, x1: -p, y1: p * 5, label: "准线", emphasis: stage === 1 ? "accent" : "secondary", semantic_role: "directrix" },
      ...(stage >= 3 ? [
        { x0: point.x, y0: point.y, x1: focus.x, y1: focus.y, label: `PF=${fixed(distances.focus)}`, emphasis: "accent", semantic_role: "focal_distance" },
        { x0: point.x, y0: point.y, x1: foot.x, y1: foot.y, label: `PH=${fixed(distances.directrix)}`, emphasis: "secondary", semantic_role: "directrix_distance" },
      ] : []),
    ],
    annotations: [],
    formula_latex: formula, caption,
  });
  const steps = [
    sceneStep(0, "parabola-focus-directrix", "观察目标：寻找等距规则", `固定焦点 F=(${p},0) 与准线 l:x=${-p}，接下来只比较动点到它们的距离。`, snapshot(1, "一个定点、一条定直线，是整个定义的两个参照物。", String.raw`F(${p},0),\quad l:x=${-p}`)),
    sceneStep(1, "parabola-moving-point", "改变 t：追踪曲线上的 P", `当 t=${fixed(t)} 时，P=(${fixed(point.x)},${fixed(point.y)})。拖动 t 会改变 P，但焦点和准线不动。`, snapshot(2, "这一幕只确定要测量的点 P。", String.raw`P(t)=(${p}t^2,${2 * p}t)`)),
    sceneStep(2, "parabola-project", "构造可比的两段距离", `连接 PF，再作 PH⊥l。H=(${-p},${fixed(point.y)}) 是垂足，因此 PH 才是 P 到准线的最短距离。`, snapshot(3, "现在 PF 与 PH 表示同一个点 P 到两个参照物的距离。", String.raw`PH\perp l,\quad H(-p,2pt)`)),
    sceneStep(3, "parabola-distance", "代数解释：为什么 PF=PH", `代入 P=(pt²,2pt) 后，PF 化简为 p(t²+1)；而 PH=x_P+p，也是 p(t²+1)。相等由参数式直接导出。`, snapshot(4, "两段距离随 t 同步改变，因为它们化简后是同一个式子。", String.raw`PF=\sqrt{p^2(t^2-1)^2+4p^2t^2}=p(t^2+1)=PH`)),
    sceneStep(4, "parabola-definition", "数值验证并总结定义", `当前 PF=${fixed(distances.focus)}、PH=${fixed(distances.directrix)}，计算值一致。到定点 F 与定直线 l 距离相等的点的轨迹，就是抛物线。`, snapshot(4, "几何构造、代数化简和当前数值在这里共同验证定义。", String.raw`\boxed{PF=d(P,l)=${fixed(distances.focus)}}`)),
  ];
  return playbook("抛物线的焦点—准线定义", "比较动点到焦点和准线的距离。", "conic_parabola_focus_directrix", steps, [
    { id: "p", label: "焦参数 p", value: fixed(p), description: "保持 p>0" },
    { id: "t", label: "动点参数 t", value: fixed(t), description: "控制 P 的位置" },
  ]);
}

function buildHyperbola(params: TemplatePreviewParams): PlaybookScript {
  const a = clamp(numberParam(params, "a", 3), 1.5, 5);
  const b = clamp(numberParam(params, "b", 2), 1, 4);
  const u = clamp(numberParam(params, "u", 1), -1.7, 1.7);
  const spec = { a, b };
  const [f1, f2] = hyperbolaFoci(spec);
  const c = Math.hypot(a, b);
  const p = hyperbolaPoint(spec, u);
  const d1 = Math.hypot(p.x - f1.x, p.y - f1.y);
  const d2 = Math.hypot(p.x - f2.x, p.y - f2.y);
  const difference = hyperbolaFocalDistanceDifference(spec, p);
  const span = a * 3.2;
  const snapshot = (stage: number, caption: string, formula: string): MathSceneSnapshot => ({
    kind: "math_scene", camera_mode: "fixed", x_min: -span, x_max: span, y_min: -span * 0.9, y_max: span * 0.9, x_label: "x", y_label: "y",
    curves: [1, -1].map((branch) => ({ expression_x: `${branch * a}*cosh(t)`, expression_y: `${b}*sinh(t)`, t_min: -1.8, t_max: 1.8, label: branch === 1 ? "右支" : "左支", emphasis: "primary", semantic_role: "conic_curve" })),
    points: [
      ...(stage >= 5 ? [
        { ...f1, label: "$F_1$", emphasis: "secondary", semantic_role: "focus" },
        { ...f2, label: "$F_2$", emphasis: "secondary", semantic_role: "focus" },
      ] : []),
      ...(stage >= 3 ? [{ ...p, label: "P", emphasis: "accent", semantic_role: "moving_point" }] : []),
    ],
    segments: stage >= 2 ? [
      { x0: -span, y0: -span * b / a, x1: span, y1: span * b / a, label: "渐近线", emphasis: "secondary", semantic_role: "asymptote" },
      { x0: -span, y0: span * b / a, x1: span, y1: -span * b / a, label: "渐近线", emphasis: "secondary", semantic_role: "asymptote" },
      ...(stage >= 5 ? [
        { x0: p.x, y0: p.y, x1: f1.x, y1: f1.y, emphasis: "secondary", semantic_role: "focal_distance" },
        { x0: p.x, y0: p.y, x1: f2.x, y1: f2.y, emphasis: "accent", semantic_role: "focal_distance" },
      ] : []),
    ] : [],
    annotations: [],
    formula_latex: formula, caption,
  });
  const steps = [
    sceneStep(0, "hyperbola-branches", "观察目标：两支向哪里延伸", "先只看双曲线本身：它有互不相连的左、右两支，并关于坐标轴和原点对称。", snapshot(1, "先识别两支结构，下一幕再给出它们的参照方向。", String.raw`\frac{x^2}{${a * a}}-\frac{y^2}{${b * b}}=1`)),
    sceneStep(1, "hyperbola-asymptotes", "提出猜想：两条参照线", `画出 y=±(b/a)x，当前斜率为 ±${fixed(b / a)}。从图上猜想：曲线越远离中心，越靠近这两条线。`, snapshot(2, "渐近线是待验证的方向，不是双曲线的一部分。", String.raw`y=\pm\frac ba x=\pm${fixed(b / a)}x`)),
    sceneStep(2, "hyperbola-moving-point", "改变 u：比较 P 的方向", `当 u=${fixed(u)} 时，P=(${fixed(p.x)},${fixed(p.y)})，y/x=${fixed(p.y / p.x, 3)}。增大 |u| 时，这个比值会靠近 ±b/a。`, snapshot(3, "这一幕只跟踪动点方向 y/x 如何靠近渐近线斜率。", String.raw`P(u)=(${a}\cosh u,${b}\sinh u)`)),
    sceneStep(3, "hyperbola-focal-difference", "代数验证渐近趋势", `由 y/x=(b/a)tanh u，当 u 趋向正、负无穷时，tanh u 趋向±1，因此 y/x 趋向±b/a。`, snapshot(4, "渐近线斜率来自参数式的极限，不只是目测结果。", String.raw`\frac yx=\frac ba\tanh u\longrightarrow\pm\frac ba`)),
    sceneStep(4, "hyperbola-eccentricity", "建立第二个关系：焦距差", `现在引入 F₁、F₂。当前 PF₁=${fixed(d1)}、PF₂=${fixed(d2)}，两者不相等，但差的绝对值是 ${fixed(difference)}。`, snapshot(5, "分别测量两段焦距，关注它们的差而不是和。", String.raw`|PF_1-PF_2|=${fixed(difference)}`)),
    sceneStep(5, "hyperbola-summary", "推导、验证并总结", `令 c=√(a²+b²)=${fixed(c)}，右支上 PF₁=c cosh u+a，PF₂=c cosh u−a，相减恒得 2a=${fixed(2 * a)}。当前数值 ${fixed(difference)} 与推导一致。`, snapshot(6, "双曲线同时具有渐近方向与焦距差不变两层结构。", String.raw`\boxed{|PF_1-PF_2|=2a=${fixed(difference)}}`)),
  ];
  return playbook("双曲线与渐近线", "理解双曲线两支、渐近趋势与焦点距离差。", "conic_hyperbola_asymptotes", steps, [
    { id: "a", label: "实半轴 a", value: fixed(a), description: "保持 a>0" },
    { id: "b", label: "虚半轴 b", value: fixed(b), description: "决定渐近线斜率" },
    { id: "u", label: "动点参数 u", value: fixed(u), description: "控制 P 的位置" },
  ]);
}

function lineSegment(line: LineSpec, span: number, role = "moving_line"): NonNullable<MathSceneSnapshot["segments"]>[number] {
  return line.kind === "vertical"
    ? { x0: line.x, y0: -span, x1: line.x, y1: span, emphasis: "accent", semantic_role: role }
    : { x0: -span, y0: -span * line.slope + line.intercept, x1: span, y1: span * line.slope + line.intercept, emphasis: "accent", semantic_role: role };
}

function buildLineEllipse(params: TemplatePreviewParams): PlaybookScript {
  const a = 5;
  const b = 3;
  const lineType = params.lineType === "vertical" ? "vertical" : "slope";
  const line: LineSpec = lineType === "vertical"
    ? { kind: "vertical", x: clamp(numberParam(params, "verticalX", 4), -6, 6) }
    : { kind: "slope", slope: clamp(numberParam(params, "slope", 0.35), -1.2, 1.2), intercept: clamp(numberParam(params, "intercept", 0), -4, 4) };
  const result = intersectLineConic(ellipseImplicit({ a, b }), line, 1e-8);
  const statusText = { secant: "相交", tangent: "相切", disjoint: "相离" }[result.status];
  const snapshot = (shown: LineSpec[], caption: string, formula: string): MathSceneSnapshot => {
    const displayedResult = intersectLineConic(ellipseImplicit({ a, b }), shown.at(-1)!, 1e-8);
    const displayedStatus = { secant: "相交", tangent: "相切", disjoint: "相离" }[displayedResult.status];
    return {
      kind: "math_scene", camera_mode: "fixed", x_min: -7, x_max: 7, y_min: -5, y_max: 5, x_label: "x", y_label: "y", curves: ellipseCurve(a, b),
      segments: shown.map((item, index) => lineSegment(item, 7, index === shown.length - 1 ? "moving_line" : "reference_line")),
      points: displayedResult.points.map((point, index) => ({ ...point, label: displayedResult.status === "tangent" ? "T" : index === 0 ? "A" : "B", emphasis: "accent", semantic_role: displayedResult.status === "tangent" ? "tangent_point" : "intersection_point" })),
      annotations: [{ x: -6.3, y: 4.2, text: String.raw`$\Delta=${fixed(displayedResult.discriminant, 3)}\;\cdot\;\text{${displayedStatus}}$`, align: "nw", semantic_role: "discriminant_panel" }],
      formula_latex: formula, caption,
    };
  };
  const steps = [
    sceneStep(0, "line-ellipse-setup", "观察目标：交点数如何变化", "拖动直线时，先只记录它与椭圆有 2、1 还是 0 个交点。要解释这个变化，需要把联立问题化为一元二次方程。", snapshot([line], "画面中的交点数，会与代入后的实根数一一对应。", String.raw`l\cap C\Longleftrightarrow Ax^2+Bx+C=0`)),
    sceneStep(1, "line-ellipse-secant", "验证一：Δ>0 对应两交点", "取 y=0，代入后得 x²/25−1=0，有 x=±5 两个实根；画面中正好出现 A、B 两个交点。", snapshot([{ kind: "slope", slope: 0, intercept: 0 }], "两个不同实根与两个交点一一对应。", String.raw`x=\pm5\Rightarrow\Delta>0\Longleftrightarrow\text{相交}`)),
    sceneStep(2, "line-ellipse-tangent", "验证二：Δ=0 对应唯一切点", "取 y=3，代入后只剩 x²/25=0，x=0 是重根；原来的两个交点在 T=(0,3) 合并。", snapshot([{ kind: "slope", slope: 0, intercept: 3 }], "重根不是两个可见交点，而是一个唯一切点。", String.raw`x^2=0\Rightarrow\Delta=0\Longleftrightarrow\text{相切}`)),
    sceneStep(3, "line-ellipse-disjoint", "验证三：Δ<0 对应相离", "取 y=3.8，代入后 x²/25+3.8²/9=1 无实数解；画面中直线也完全位于椭圆外。", snapshot([{ kind: "slope", slope: 0, intercept: 3.8 }], "无实根与零个几何交点一致。", String.raw`\frac{x^2}{25}+\frac{3.8^2}{9}=1\Rightarrow\Delta<0\Longleftrightarrow\text{相离}`)),
    sceneStep(4, "line-ellipse-vertical", "单独处理竖直直线", "竖直直线没有斜率，直接令 x 为常数代入，不能伪造一个无限大斜率。", snapshot([{ kind: "vertical", x: 4 }], "x=4 仍得到两个有序交点。", String.raw`x=c\Rightarrow\frac{y^2}{b^2}=1-\frac{c^2}{a^2}`)),
    sceneStep(5, "line-ellipse-current", "回到当前参数并下结论", `当前判别式Δ=${fixed(result.discriminant, 4)}，所以直线与椭圆${statusText}；容差内的近重根按一个切点处理。`, snapshot([line], `先看Δ的符号，再读出交点数：当前结论为${statusText}。`, String.raw`\boxed{\Delta=${fixed(result.discriminant, 4)}\Rightarrow\text{${statusText}}}`)),
  ];
  return playbook("直线与椭圆的位置关系", "把交点个数与判别式正、零、负对应起来。", "conic_line_ellipse_position", steps, [
    { id: "lineType", label: "直线类型", value: lineType, description: "斜率式或竖直式" },
    { id: "slope", label: "斜率 m", value: line.kind === "slope" ? fixed(line.slope) : "0", description: "斜率式使用" },
    { id: "intercept", label: "截距 q", value: line.kind === "slope" ? fixed(line.intercept) : "0", description: "斜率式使用" },
    { id: "verticalX", label: "竖直线 x", value: line.kind === "vertical" ? fixed(line.x) : "4", description: "竖直式使用" },
  ]);
}

function buildChordLocus(params: TemplatePreviewParams): PlaybookScript {
  const a = 5;
  const b = 3;
  const q = clamp(numberParam(params, "fixedX", 2), 0.8, 3.8);
  const slope = clamp(numberParam(params, "slope", 0.6), -2.5, 2.5);
  const line: LineSpec = { kind: "slope", slope, intercept: -slope * q };
  const intersection = intersectLineConic(ellipseImplicit({ a, b }), line);
  if (intersection.status !== "secant") throw new Error("clamped fixed point must define a secant chord");
  const chord = chordFromIntersection(line, intersection);
  const trail = Array.from({ length: 25 }, (_, index) => -2.4 + index * 0.2).map((m) => {
    const hit = intersectLineConic(ellipseImplicit({ a, b }), { kind: "slope", slope: m, intercept: -m * q });
    return hit.status === "secant" ? chordFromIntersection({ kind: "slope", slope: m, intercept: -m * q }, hit).midpoint : null;
  }).filter((point): point is { x: number; y: number } => point != null);
  const locusA = q / 2;
  const locusB = b * q / (2 * a);
  const locusResidual = a * a * chord.midpoint.y * chord.midpoint.y
    + b * b * chord.midpoint.x * (chord.midpoint.x - q);
  const snapshot = (stage: number, caption: string, formula: string): MathSceneSnapshot => ({
    kind: "math_scene", camera_mode: "fixed", x_min: -6, x_max: 6, y_min: -4, y_max: 4, x_label: "x", y_label: "y", curves: [
      ...ellipseCurve(a, b),
      ...(stage >= 5 ? [{ expression_x: `${q / 2}+${locusA}*cos(t)`, expression_y: `${locusB}*sin(t)`, t_min: 0, t_max: 2 * Math.PI, label: "理论轨迹", emphasis: "secondary", semantic_role: "theoretical_locus" }] : []),
    ],
    segments: [{ ...lineSegment(line, 6), label: "动弦 AB", semantic_role: "chord" }],
    points: [
      { x: q, y: 0, label: "Q", emphasis: "secondary", semantic_role: "fixed_point" },
      ...(stage >= 2 ? [
        { ...chord.endpoints[0], label: "A", emphasis: "primary", semantic_role: "intersection_point" },
        { ...chord.endpoints[1], label: "B", emphasis: "primary", semantic_role: "intersection_point" },
      ] : []),
      ...(stage >= 3 ? [{ ...chord.midpoint, label: "M", emphasis: "accent", semantic_role: "chord_midpoint" }] : []),
      ...(stage >= 4 ? trail.map((point) => ({ ...point, emphasis: "secondary", semantic_role: "locus_trail" })) : []),
    ],
    annotations: stage >= 3 ? [{ x: -5.4, y: 3.3, text: `$M(${fixed(chord.midpoint.x)},${fixed(chord.midpoint.y)})$`, align: "nw", semantic_role: "derivation_panel" }] : [],
    formula_latex: formula, caption,
  });
  const steps = [
    sceneStep(0, "chord-family", "观察目标：弦的中点往哪里走", `固定 Q=(${fixed(q)},0)，让直线 y=m(x−${fixed(q)}) 绕 Q 转动。这一幕只确认所有动直线都经过同一定点。`, snapshot(1, "先建立直线族，下一幕再取它与椭圆的交点。", `y=m(x-${fixed(q)})`)),
    sceneStep(1, "chord-endpoints", "从交点得到动弦 AB", `当前直线与椭圆交于 A、B，两点同时满足直线与椭圆方程，弦长 AB=${fixed(chord.length)}。`, snapshot(2, "A、B 是同一个二次方程的两个实根对应的交点。", String.raw`\frac{x^2}{25}+\frac{m^2(x-q)^2}{9}=1`)),
    sceneStep(2, "chord-midpoint", "只追踪中点 M", `对当前动弦取坐标平均，得 M=(${fixed(chord.midpoint.x)},${fixed(chord.midpoint.y)})。改变 m 时，A、B、M 会一起重算。`, snapshot(3, "每条有效动弦只保留一个中点，避免让端点轨迹干扰观察。", String.raw`M\left(\frac{x_A+x_B}{2},\frac{y_A+y_B}{2}\right)`)),
    sceneStep(3, "chord-trail", "积累尾迹并提出猜想", "改变斜率 m，保留每次的 M。散点排成一条封闭曲线，因此猜想中点轨迹是一个有范围的椭圆。", snapshot(4, "尾迹只是猜想依据；轨迹方程与端点还需要代数证明。", String.raw`m\mapsto M(m)`)),
    sceneStep(4, "chord-vieta", "用韦达关系消去 A、B 与 m", `直线代入椭圆后，用两根之和求 x_M，再以 y_M=m(x_M−${fixed(q)}) 消去 m，得 ${a * a}y_M²+${b * b}x_M(x_M−${fixed(q)})=0。`, snapshot(5, "理论曲线现在才出现，用来检查之前的尾迹猜想。", String.raw`x_M=\frac{a^2m^2q}{b^2+a^2m^2}\Rightarrow a^2y_M^2+b^2x_M(x_M-${fixed(q)})=0`)),
    sceneStep(5, "chord-locus-result", "代入验证并补足轨迹范围", `当前 M 代入轨迹方程，左边计算为 ${fixed(locusResidual, 6)}；尾迹与理论椭圆重合。竖直弦给出两个端点，由 m→±∞ 补足。`, snapshot(5, "数值残差为零，理论轨迹、采样尾迹和退化端点共同闭合。", String.raw`\boxed{${a * a}y^2+${b * b}x(x-${fixed(q)})=0}`)),
  ];
  return playbook("椭圆动弦与中点轨迹", "从动弦观察出发，用韦达关系验证中点轨迹。", "conic_ellipse_chord_midpoint_locus", steps, [
    { id: "fixedX", label: "定点横坐标 q", value: fixed(q), description: "自动限制在椭圆内部" },
    { id: "slope", label: "动直线斜率 m", value: fixed(slope), description: "竖直弦由轨迹端点补足" },
  ]);
}

function manifest(args: {
  caseId: string;
  archetypeId: string;
  topic: string;
  title: string;
  description: string;
  prompt: string;
  defaults: TemplatePreviewParams;
  controls: NonNullable<GoldTemplateManifest["parameterSchema"]>["controls"];
  builder: (params: TemplatePreviewParams) => PlaybookScript;
}): GoldTemplateManifest {
  const archetype = resolveConicArchetype(args.archetypeId);
  return attachPublicGoldTemplate({
    caseId: args.caseId, archetypeId: args.archetypeId, subject: "high_school_math", domain: "conic_sections", topic: args.topic,
    visibility: "public", title: args.title, description: args.description, canonicalPrompt: args.prompt,
    parameterSchema: { defaults: args.defaults, controls: args.controls },
    poster: { url: `/template-previews/${args.caseId}/poster.webp`, alt: `${args.title}的 Playbook 代表画面`, frame: archetype.pedagogicalRubric.minimumSteps * STEP_FRAMES - 40 },
    buildPublicPlaybook: args.builder,
    buildFollowups: (params, script) => followups(script, "所有数值由同一个圆锥曲线纯函数内核验证，画面只呈现已通过约束的结果。", `当前参数会重新构建完整 Playbook；例如 ${Object.entries(params).map(([key, value]) => `${key}=${value}`).join("，")}。`),
  });
}

export const CONIC_PUBLIC_GOLD_TEMPLATES: readonly GoldTemplateManifest[] = Object.freeze([
  manifest({ caseId: "ellipse-focus-definition", archetypeId: "conic.ellipse.focus-definition", topic: "椭圆", title: "椭圆的焦点定义", description: "观察动点到两焦点距离之和恒定", prompt: "用动点解释椭圆的焦点定义，并验证 PF₁+PF₂=2a。", defaults: { a: 5, b: 3, t: 1 }, controls: [
    { id: "a", kind: "range", label: "长半轴 a", description: "3 到 7", min: 3, max: 7, step: 0.25, resetPlayback: false },
    { id: "b", kind: "range", label: "短半轴 b", description: "自动满足 b<a", min: 1, max: 6.5, step: 0.25, resetPlayback: false },
    { id: "t", kind: "range", label: "动点参数 t", description: "沿椭圆移动", min: 0, max: 6.28, step: 0.05, resetPlayback: false },
  ], builder: buildEllipseFocus }),
  manifest({ caseId: "parabola-focus-directrix", archetypeId: "conic.parabola.focus-directrix", topic: "抛物线", title: "抛物线的焦点—准线定义", description: "同步比较动点到焦点和准线的距离", prompt: "用动点、焦点、准线和垂足解释抛物线定义。", defaults: { p: 1.5, t: 1.2 }, controls: [
    { id: "p", kind: "range", label: "焦参数 p", description: "保持 p>0", min: 0.5, max: 3, step: 0.1, resetPlayback: false },
    { id: "t", kind: "range", label: "动点参数 t", description: "控制 P", min: -2.2, max: 2.2, step: 0.05, resetPlayback: false },
  ], builder: buildParabola }),
  manifest({ caseId: "hyperbola-asymptotes", archetypeId: "conic.hyperbola.asymptotes", topic: "双曲线", title: "双曲线与渐近线", description: "理解两支结构、渐近趋势和焦点距离差", prompt: "展示双曲线两支、渐近线、焦点与动点的距离差。", defaults: { a: 3, b: 2, u: 1 }, controls: [
    { id: "a", kind: "range", label: "实半轴 a", description: "保持正值", min: 1.5, max: 5, step: 0.25, resetPlayback: false },
    { id: "b", kind: "range", label: "虚半轴 b", description: "改变渐近线", min: 1, max: 4, step: 0.25, resetPlayback: false },
    { id: "u", kind: "range", label: "动点参数 u", description: "沿右支移动", min: -1.7, max: 1.7, step: 0.05, resetPlayback: false },
  ], builder: buildHyperbola }),
  manifest({ caseId: "line-ellipse-position", archetypeId: "conic.line-ellipse.position", topic: "直线与椭圆", title: "直线与椭圆的位置关系", description: "对应相交、相切、相离与判别式状态", prompt: "联立直线与椭圆，展示 Δ>0、Δ=0、Δ<0 和竖直直线。", defaults: { lineType: "slope", slope: 0.35, intercept: 0, verticalX: 4 }, controls: [
    { id: "lineType", kind: "select", label: "直线类型", description: "覆盖斜率不存在", resetPlayback: false, options: [{ label: "斜率式", value: "slope" }, { label: "竖直线", value: "vertical" }] },
    { id: "slope", kind: "range", label: "斜率 m", description: "斜率式", min: -1.2, max: 1.2, step: 0.05, resetPlayback: false },
    { id: "intercept", kind: "range", label: "截距 q", description: "斜率式", min: -4, max: 4, step: 0.05, resetPlayback: false },
    { id: "verticalX", kind: "range", label: "竖直线 x", description: "竖直式", min: -6, max: 6, step: 0.05, resetPlayback: false },
  ], builder: buildLineEllipse }),
  manifest({ caseId: "ellipse-chord-midpoint-locus", archetypeId: "conic.ellipse.chord-midpoint-locus", topic: "动弦与轨迹", title: "椭圆动弦与中点轨迹", description: "连接动弦、中点尾迹与韦达消元", prompt: "展示过椭圆内定点的动弦与中点轨迹，并用韦达关系验证。", defaults: { fixedX: 2, slope: 0.6 }, controls: [
    { id: "fixedX", kind: "range", label: "定点横坐标 q", description: "限制在椭圆内部", min: 0.8, max: 3.8, step: 0.1, resetPlayback: false },
    { id: "slope", kind: "range", label: "斜率 m", description: "控制动弦", min: -2.5, max: 2.5, step: 0.05, resetPlayback: false },
  ], builder: buildChordLocus }),
]);
