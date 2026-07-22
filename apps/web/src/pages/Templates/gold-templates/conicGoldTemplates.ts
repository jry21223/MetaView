import type { MathSceneSnapshot, MetaStep, PlaybookScript } from "../../../features/playbook/engine/types";
import {
  chordFromIntersection,
  ellipseEccentricity,
  ellipseFocalDistanceSum,
  ellipseFoci,
  ellipseImplicit,
  ellipsePoint,
  hyperbolaEccentricity,
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
  const p = ellipsePoint(spec, t);
  const d1 = Math.hypot(p.x - f1.x, p.y - f1.y);
  const d2 = Math.hypot(p.x - f2.x, p.y - f2.y);
  const base = (stage: number, caption: string, formula: string): MathSceneSnapshot => ({
    kind: "math_scene", camera_mode: "fixed", x_min: -a - 1.5, x_max: a + 1.5, y_min: -b - 1.5, y_max: b + 1.5,
    x_label: "x", y_label: "y", curves: ellipseCurve(a, b),
    points: [
      { ...f1, label: "$F_1$", emphasis: "secondary", semantic_role: "focus" },
      { ...f2, label: "$F_2$", emphasis: "secondary", semantic_role: "focus" },
      ...(stage >= 2 ? [{ ...p, label: "P", emphasis: "accent", semantic_role: "moving_point" }] : []),
    ],
    segments: stage >= 3 ? [
      { x0: p.x, y0: p.y, x1: f1.x, y1: f1.y, label: `PF₁=${fixed(d1)}`, emphasis: "secondary", semantic_role: "focal_distance" },
      { x0: p.x, y0: p.y, x1: f2.x, y1: f2.y, label: `PF₂=${fixed(d2)}`, emphasis: "accent", semantic_role: "focal_distance" },
    ] : [],
    annotations: stage >= 4 ? [{ x: -a, y: b + 0.6, text: `$PF_1+PF_2=${fixed(d1 + d2)}=2a$`, align: "nw", semantic_role: "derivation_panel" }] : [],
    formula_latex: formula, caption,
  });
  const steps = [
    sceneStep(0, "ellipse-foci", "先看两个焦点", "椭圆由两个固定焦点组织，并不是把圆随意压扁。", base(1, "F₁、F₂ 固定，曲线围绕它们展开。", String.raw`a=${a},\ b=${b}`)),
    sceneStep(1, "ellipse-moving-point", "让点 P 沿椭圆移动", `当前参数 t=${fixed(t)}，P=(${fixed(p.x)},${fixed(p.y)})。`, base(2, "P 始终被确定性参数点限制在椭圆上。", String.raw`P(t)=(${a}\cos t,${b}\sin t)`)),
    sceneStep(2, "ellipse-two-distances", "连接 P 与两个焦点", `当前 PF₁=${fixed(d1)}，PF₂=${fixed(d2)}。`, base(3, "两段距离分别变化。", String.raw`PF_1=${fixed(d1)},\ PF_2=${fixed(d2)}`)),
    sceneStep(3, "ellipse-distance-sum", "比较距离和", `两段距离相加为 ${fixed(d1 + d2)}，恰好等于 2a=${fixed(2 * a)}。`, base(4, "单段长度会变，但距离和保持不变。", `PF_1+PF_2=2a=${fixed(2 * a)}`)),
    sceneStep(4, "ellipse-shape-parameters", "改变 a 与 b", `当前离心率 e=${fixed(ellipseEccentricity(spec))}；a 与 b 改变时，焦点和形状同步重算。`, base(4, "参数变化不会破坏焦点定义。", String.raw`e=\frac{\sqrt{a^2-b^2}}a=${fixed(ellipseEccentricity(spec))}`)),
    sceneStep(5, "ellipse-definition", "总结椭圆定义", `椭圆是到两个定点距离之和等于常数 2a 的点的轨迹；当前计算验证值为 ${fixed(ellipseFocalDistanceSum(spec, p))}。`, base(4, "定义、图形与数值在同一画面闭合。", String.raw`\boxed{PF_1+PF_2=2a}`)),
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
      { ...focus, label: "F", emphasis: "secondary", semantic_role: "focus" },
      ...(stage >= 2 ? [{ ...point, label: "P", emphasis: "accent", semantic_role: "moving_point" }] : []),
      ...(stage >= 3 ? [{ ...foot, label: "H", emphasis: "secondary", semantic_role: "projection_foot" }] : []),
    ],
    segments: [
      { x0: -p, y0: -p * 5, x1: -p, y1: p * 5, label: "准线", emphasis: "secondary", semantic_role: "directrix" },
      ...(stage >= 3 ? [
        { x0: point.x, y0: point.y, x1: focus.x, y1: focus.y, label: `PF=${fixed(distances.focus)}`, emphasis: "accent", semantic_role: "focal_distance" },
        { x0: point.x, y0: point.y, x1: foot.x, y1: foot.y, label: `PH=${fixed(distances.directrix)}`, emphasis: "secondary", semantic_role: "directrix_distance" },
      ] : []),
    ], formula_latex: formula, caption,
  });
  const steps = [
    sceneStep(0, "parabola-focus-directrix", "建立焦点与准线", `焦点 F=(${p},0)，准线是 x=${-p}。`, snapshot(1, "焦点和准线共同决定抛物线。", String.raw`F(${p},0),\ l:x=${-p}`)),
    sceneStep(1, "parabola-moving-point", "选取曲线上动点", `参数 t=${fixed(t)} 给出 P=(${fixed(point.x)},${fixed(point.y)})。`, snapshot(2, "P 沿抛物线移动。", `P(t)=(${p}t^2,${2 * p}t)`)),
    sceneStep(2, "parabola-project", "向准线作垂线", "H 是 P 到准线的垂足，所以 PH 是点到准线的距离。", snapshot(3, "PF 与 PH 在同一画面比较。", String.raw`PH\perp l`)),
    sceneStep(3, "parabola-distance", "同步比较两段距离", `PF=${fixed(distances.focus)}，PH=${fixed(distances.directrix)}，两者相等。`, snapshot(3, "点移动时两段距离同步变化。", `PF=PH=${fixed(distances.focus)}`)),
    sceneStep(4, "parabola-definition", "总结焦点—准线定义", "到定点 F 与定直线 l 距离相等的点的轨迹就是抛物线。", snapshot(3, "几何定义与参数方程互相验证。", String.raw`\boxed{PF=d(P,l)}`)),
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
  const p = hyperbolaPoint(spec, u);
  const difference = hyperbolaFocalDistanceDifference(spec, p);
  const span = a * 3.2;
  const snapshot = (stage: number, caption: string, formula: string): MathSceneSnapshot => ({
    kind: "math_scene", camera_mode: "fixed", x_min: -span, x_max: span, y_min: -span * 0.75, y_max: span * 0.75, x_label: "x", y_label: "y",
    curves: [1, -1].map((branch) => ({ expression_x: `${branch * a}*cosh(t)`, expression_y: `${b}*sinh(t)`, t_min: -1.8, t_max: 1.8, label: branch === 1 ? "右支" : "左支", emphasis: "primary", semantic_role: "conic_curve" })),
    points: [
      { ...f1, label: "$F_1$", emphasis: "secondary", semantic_role: "focus" }, { ...f2, label: "$F_2$", emphasis: "secondary", semantic_role: "focus" },
      ...(stage >= 3 ? [{ ...p, label: "P", emphasis: "accent", semantic_role: "moving_point" }] : []),
    ],
    segments: stage >= 2 ? [
      { x0: -span, y0: -span * b / a, x1: span, y1: span * b / a, label: "渐近线", emphasis: "secondary", semantic_role: "asymptote" },
      { x0: -span, y0: span * b / a, x1: span, y1: -span * b / a, label: "渐近线", emphasis: "secondary", semantic_role: "asymptote" },
      ...(stage >= 3 ? [
        { x0: p.x, y0: p.y, x1: f1.x, y1: f1.y, emphasis: "secondary", semantic_role: "focal_distance" },
        { x0: p.x, y0: p.y, x1: f2.x, y1: f2.y, emphasis: "accent", semantic_role: "focal_distance" },
      ] : []),
    ] : [], formula_latex: formula, caption,
  });
  const steps = [
    sceneStep(0, "hyperbola-branches", "辨认左右两支", "双曲线由互不相连的两支组成。", snapshot(1, "两支关于坐标轴和中心对称。", String.raw`\frac{x^2}{${a * a}}-\frac{y^2}{${b * b}}=1`)),
    sceneStep(1, "hyperbola-asymptotes", "画出两条渐近线", `渐近线斜率是 ±b/a=±${fixed(b / a)}。`, snapshot(2, "曲线接近渐近线，但不会与它重合。", String.raw`y=\pm\frac ba x=\pm${fixed(b / a)}x`)),
    sceneStep(2, "hyperbola-moving-point", "沿一支移动点 P", `当前 u=${fixed(u)}，P=(${fixed(p.x)},${fixed(p.y)})。`, snapshot(3, "参数增大时，点沿右支远离顶点。", String.raw`P(u)=(${a}\cosh u,${b}\sinh u)`)),
    sceneStep(3, "hyperbola-focal-difference", "比较到两焦点的距离", `两焦点距离差的绝对值为 ${fixed(difference)}，恒等于 2a=${2 * a}。`, snapshot(3, "距离差是不变量。", `|PF_1-PF_2|=2a=${2 * a}`)),
    sceneStep(4, "hyperbola-eccentricity", "观察离心率", `当前 e=${fixed(hyperbolaEccentricity(spec))}>1；改变 a、b 会同步改变开口和渐近线。`, snapshot(3, "离心率大于 1 是双曲线的特征。", String.raw`e=\frac{\sqrt{a^2+b^2}}a=${fixed(hyperbolaEccentricity(spec))}`)),
    sceneStep(5, "hyperbola-summary", "总结渐近趋势", "越远离中心，双曲线越贴近两条渐近线，同时保持焦点距离差不变。", snapshot(3, "结构、渐近线和焦点定义共同描述双曲线。", String.raw`\boxed{|PF_1-PF_2|=2a}`)),
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
    sceneStep(0, "line-ellipse-setup", "把直线代入椭圆", "联立后得到一元二次方程，几何交点数由实根个数决定。", snapshot([line], "当前参数先进入同一个确定性求交器。", String.raw`\frac{x^2}{25}+\frac{y^2}{9}=1`)),
    sceneStep(1, "line-ellipse-secant", "Δ>0：两个交点", "参考直线 y=0 穿过椭圆，二次方程有两个不同实根。", snapshot([{ kind: "slope", slope: 0, intercept: 0 }], "两个实根对应 A、B。", String.raw`\Delta>0\Longleftrightarrow\text{相交}`)),
    sceneStep(2, "line-ellipse-tangent", "Δ=0：交点合并", "参考直线 y=3 与椭圆相切，两个交点合并为一个切点。", snapshot([{ kind: "slope", slope: 0, intercept: 3 }], "重根对应唯一切点。", String.raw`\Delta=0\Longleftrightarrow\text{相切}`)),
    sceneStep(3, "line-ellipse-disjoint", "Δ<0：没有实交点", "参考直线 y=3.8 位于椭圆外，方程没有实根。", snapshot([{ kind: "slope", slope: 0, intercept: 3.8 }], "无实根对应相离。", String.raw`\Delta<0\Longleftrightarrow\text{相离}`)),
    sceneStep(4, "line-ellipse-vertical", "单独处理竖直直线", "竖直直线没有斜率，直接令 x 为常数代入，不能伪造一个无限大斜率。", snapshot([{ kind: "vertical", x: 4 }], "x=4 仍得到两个有序交点。", String.raw`x=c\Rightarrow\frac{y^2}{b^2}=1-\frac{c^2}{a^2}`)),
    sceneStep(5, "line-ellipse-current", "回到当前参数", `当前直线与椭圆${statusText}，判别式为 ${fixed(result.discriminant, 4)}。`, snapshot([line], `容差内的近重根按相切处理；当前状态为${statusText}。`, String.raw`\boxed{\Delta=${fixed(result.discriminant, 4)}}`)),
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
  const snapshot = (stage: number, caption: string, formula: string): MathSceneSnapshot => ({
    kind: "math_scene", camera_mode: "fixed", x_min: -6, x_max: 6, y_min: -4, y_max: 4, x_label: "x", y_label: "y", curves: [
      ...ellipseCurve(a, b),
      ...(stage >= 4 ? [{ expression_x: `${q / 2}+${locusA}*cos(t)`, expression_y: `${locusB}*sin(t)`, t_min: 0, t_max: 2 * Math.PI, label: "理论轨迹", emphasis: "secondary", semantic_role: "theoretical_locus" }] : []),
    ],
    segments: [{ ...lineSegment(line, 6), label: "动弦 AB", semantic_role: "chord" }],
    points: [
      { x: q, y: 0, label: "Q", emphasis: "secondary", semantic_role: "fixed_point" },
      { ...chord.endpoints[0], label: "A", emphasis: "primary", semantic_role: "intersection_point" },
      { ...chord.endpoints[1], label: "B", emphasis: "primary", semantic_role: "intersection_point" },
      { ...chord.midpoint, label: "M", emphasis: "accent", semantic_role: "chord_midpoint" },
      ...(stage >= 3 ? trail.map((point) => ({ ...point, emphasis: "secondary", semantic_role: "locus_trail" })) : []),
    ],
    annotations: [{ x: -5.4, y: 3.3, text: `m=${fixed(slope)} · M(${fixed(chord.midpoint.x)},${fixed(chord.midpoint.y)})`, align: "nw", semantic_role: "derivation_panel" }],
    formula_latex: formula, caption,
  });
  const steps = [
    sceneStep(0, "chord-family", "建立过定点的动直线", `固定点 Q=(${fixed(q)},0) 在椭圆内部，任意有限斜率都给出一条实弦。`, snapshot(1, "直线绕 Q 转动。", `y=m(x-${fixed(q)})`)),
    sceneStep(1, "chord-endpoints", "求出弦的两个端点", `当前交点 A、B 由同一个确定性二次方程求出，弦长为 ${fixed(chord.length)}。`, snapshot(2, "交点按直线参数稳定排序。", `AB=${fixed(chord.length)}`)),
    sceneStep(2, "chord-midpoint", "标出中点 M", `M=(${fixed(chord.midpoint.x)},${fixed(chord.midpoint.y)})，它由 A、B 坐标平均得到。`, snapshot(2, "每条有效弦只对应一个中点。", String.raw`M=\frac{A+B}{2}`)),
    sceneStep(3, "chord-trail", "保留中点运动尾迹", "随着斜率变化，中点形成有范围的轨迹，而不是随机散点。", snapshot(3, "无实交点或退化参数不会写入尾迹。", String.raw`m\mapsto M(m)`)),
    sceneStep(4, "chord-vieta", "用韦达关系消去端点", "把直线代入椭圆，利用两根之和表达中点，再消去斜率。", snapshot(4, "代数关系给出理论轨迹。", `a^2y_M^2+b^2x_M(x_M-${fixed(q)})=0`)),
    sceneStep(5, "chord-locus-result", "比较尾迹与理论轨迹", "采样尾迹落在理论小椭圆上；竖直弦对应轨迹端点，由极限补足。", snapshot(4, "运动观察与点差/韦达推导一致。", String.raw`\boxed{${a * a}y^2+${b * b}x(x-${fixed(q)})=0}`)),
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
