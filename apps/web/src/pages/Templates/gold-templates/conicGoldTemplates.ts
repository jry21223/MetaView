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
import { applyNarrationTimeline, posterFrameForStep } from "../narrationTiming";
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
  const timed = applyNarrationTimeline(steps, FPS);
  return {
    schema_version: "2.0.0",
    fps: FPS,
    total_frames: timed.at(-1)?.end_frame ?? 0,
    domain: "math",
    title,
    summary,
    steps: timed,
    parameter_controls: controls,
    algorithm_id: algorithmId,
    initial_data: { scene_blueprint: [algorithmId], archetype: [algorithmId] },
  };
}

interface FollowupStepOverride {
  why?: string;
  parameter?: string;
}

function followups(
  script: PlaybookScript,
  fallback: { why: string; parameter: string },
  byStep?: Record<string, FollowupStepOverride>,
): TemplatePreviewFollowups {
  return Object.fromEntries(script.steps.map((step) => {
    const override = byStep?.[step.step_id] ?? {};
    return [step.step_id, [
      { id: `${step.step_id}-q1`, question: "这一幕应该观察什么？", answer: step.voiceover_text },
      { id: `${step.step_id}-q2`, question: "为什么这个结论成立？", answer: override.why ?? fallback.why },
      { id: `${step.step_id}-q3`, question: "修改参数会怎样？", answer: override.parameter ?? fallback.parameter },
    ] satisfies TemplatePreviewQuestion[]];
  }));
}

function ellipseCurve(a: number, b: number): NonNullable<MathSceneSnapshot["curves"]> {
  return [{
    expression_x: `${a}*cos(t)`, expression_y: `${b}*sin(t)`, t_min: 0, t_max: 2 * Math.PI,
    label: "椭圆", emphasis: "primary", semantic_role: "conic_curve",
  }];
}

function buildStringConstruction(params: TemplatePreviewParams): PlaybookScript {
  const ropeLength = clamp(numberParam(params, "rope", 10), 7, 13);
  const a = ropeLength / 2;
  const pinDistance = clamp(numberParam(params, "pins", 6), 2, 6.5);
  const c = Math.min(pinDistance / 2, a - 0.25);
  const t = clamp(numberParam(params, "t", 0.9), 0, 2 * Math.PI);
  const b = Math.sqrt(a * a - c * c);
  const spec = { a, b };
  const f1 = { x: -c, y: 0 };
  const f2 = { x: c, y: 0 };
  const p = ellipsePoint(spec, t);
  const d1 = Math.hypot(p.x - f1.x, p.y - f1.y);
  const d2 = Math.hypot(p.x - f2.x, p.y - f2.y);
  const residual = p.x * p.x / (a * a) + p.y * p.y / (b * b);
  const trail = Array.from({ length: 24 }, (_, index) => ellipsePoint(spec, (index / 24) * 2 * Math.PI));
  const base = (stage: number, caption: string, formula: string): MathSceneSnapshot => ({
    kind: "math_scene", camera_mode: "fixed", x_min: -a - 1.5, x_max: a + 1.5, y_min: -b - 1.5, y_max: b + 1.5,
    x_label: "x", y_label: "y",
    curves: stage >= 5 ? ellipseCurve(a, b) : [],
    points: [
      { ...f1, label: "$F_1$", emphasis: stage === 1 ? "accent" : "secondary", semantic_role: "focus" },
      { ...f2, label: "$F_2$", emphasis: stage === 1 ? "accent" : "secondary", semantic_role: "focus" },
      ...(stage >= 2 ? [{ ...p, label: "P", emphasis: "accent", semantic_role: "moving_point" }] : []),
      ...(stage >= 4 ? trail.map((point) => ({ ...point, emphasis: "secondary", semantic_role: "locus_trail" })) : []),
    ],
    segments: stage >= 2 ? [
      { x0: p.x, y0: p.y, x1: f1.x, y1: f1.y, label: `PF₁=${fixed(d1)}`, emphasis: stage === 3 ? "accent" : "secondary", semantic_role: "focal_distance" },
      { x0: p.x, y0: p.y, x1: f2.x, y1: f2.y, label: `PF₂=${fixed(d2)}`, emphasis: stage === 3 ? "accent" : "secondary", semantic_role: "focal_distance" },
    ] : [],
    annotations: stage === 1
      ? [{ x: -a - 1, y: b + 0.9, text: `$F_1F_2=2c=${fixed(2 * c)},\\ \\text{绳长}=2a=${fixed(2 * a)}$`, align: "nw", semantic_role: "setup_panel" }]
      : stage >= 4
        ? [{ x: -a - 1, y: b + 0.9, text: `$PF_1+PF_2=${fixed(d1 + d2)}=2a$`, align: "nw", semantic_role: "derivation_panel" }]
        : [],
    formula_latex: formula, caption,
  });
  const steps = [
    sceneStep(0, "string-setup", "观察目标：图钉、细绳与一个问题", `把两枚图钉钉在 F₁=(${fixed(-c)},0) 和 F₂=(${fixed(c)},0)，取一段长为 2a=${fixed(2 * a)} 的细绳，把两端分别系在图钉上。绳长 ${fixed(2 * a)} 大于图钉距离 ${fixed(2 * c)}，接下来的构造才能成立。`, base(1, "先检查构造条件：绳长必须大于两枚图钉的距离。", String.raw`\text{绳长}\ 2a=${fixed(2 * a)}>2c=${fixed(2 * c)}`)),
    sceneStep(1, "string-taut", "拉紧绳子：笔尖定在 P", `用笔尖把绳拉直，笔尖此时位于 P=(${fixed(p.x)},${fixed(p.y)})。绳被分成两段：PF₁=${fixed(d1)}，PF₂=${fixed(d2)}，两段之和就是绳长本身。`, base(2, "绳一旦绷直，就变成 PF₁、PF₂ 两条线段。", String.raw`PF_1+PF_2=${fixed(d1)}+${fixed(d2)}=${fixed(d1 + d2)}`)),
    sceneStep(2, "string-invariant", "改变 t：两段此消彼长，和不变", `拖动 t 移动笔尖：靠近 F₁ 时 PF₁ 变短、PF₂ 变长。只要绳保持绷直，两段之和始终等于绳长 2a=${fixed(2 * a)}，这就是实验里的不变量。`, base(3, "单段长度随笔尖移动改变，但两段之和被绳长锁定。", String.raw`PF_1+PF_2=${fixed(d1 + d2)}=2a`)),
    sceneStep(3, "string-trail", "积累尾迹：轨迹逐渐显形", "把笔尖到过的位置全部保留下来，这些点排成一条光滑的封闭曲线。它左右对称、上下对称，我们猜想：笔尖的轨迹是一个椭圆。", base(4, "尾迹是实验证据；它是什么曲线还需要下一步验证。", String.raw`\{P \mid PF_1+PF_2=2a\}`)),
    sceneStep(4, "string-verify", "验证轨迹：尾迹与椭圆重合", `令 b²=a²−c²=${fixed(b * b)}，画出椭圆 x²/a²+y²/b²=1。它与尾迹完全重合；把当前 P 代入方程，左边算得 ${fixed(residual, 4)}，恰好等于 1。`, base(5, "理论曲线此刻才出现，用来核对实验尾迹。", String.raw`\frac{x^2}{${fixed(a * a)}}+\frac{y^2}{${fixed(b * b)}}=1,\quad b^2=a^2-c^2`)),
    sceneStep(5, "string-definition", "总结定义与退化情形", `平面内到两个定点 F₁、F₂ 距离之和等于常数 2a 的点的轨迹，在 2a>2c 时就是椭圆。若 2a=2c，笔尖只能在线段 F₁F₂ 上移动，轨迹退化为线段；若 2a<2c，绳子够不着两枚图钉，无轨迹。`, base(5, "定义里的条件 2a>2c 正是实验能画出椭圆的原因。", String.raw`\boxed{PF_1+PF_2=2a\ (2a>2c)}`)),
  ];
  return playbook("椭圆的绳长实验", "两枚图钉一段细绳，画出椭圆并归纳定义。", "conic_ellipse_string_construction", steps, [
    { id: "rope", label: "绳长 2a", value: fixed(2 * a), description: "保持大于图钉距离" },
    { id: "pins", label: "图钉距离 2c", value: fixed(2 * c), description: "自动限制在绳长以内" },
    { id: "t", label: "笔尖位置 t", value: fixed(t), description: "0 到 2π" },
  ]);
}

function buildStandardEquation(params: TemplatePreviewParams): PlaybookScript {
  const a = clamp(numberParam(params, "a", 5), 3, 7);
  const c = Math.min(clamp(numberParam(params, "c", 4), 1, 6), a - 0.25);
  const t = clamp(numberParam(params, "t", 0.7), 0, 2 * Math.PI);
  const b = Math.sqrt(a * a - c * c);
  const p = ellipsePoint({ a, b }, t);
  const d1 = Math.hypot(p.x + c, p.y);
  const d2 = Math.hypot(p.x - c, p.y);
  // Each derivation line is backed by both sides evaluated at the current P.
  const lhs3 = a * a - c * p.x;
  const rhs3 = a * d2;
  const lhs4 = (a * a - c * c) * p.x * p.x + a * a * p.y * p.y;
  const rhs4 = a * a * (a * a - c * c);
  const residual = p.x * p.x / (a * a) + p.y * p.y / (b * b);
  const triangle = (emphasis: "accent" | "secondary"): NonNullable<MathSceneSnapshot["segments"]> => [
    { x0: 0, y0: 0, x1: c, y1: 0, label: "c", emphasis, semantic_role: "semi_focal_distance" },
    { x0: 0, y0: 0, x1: 0, y1: b, label: `b=${fixed(b)}`, emphasis, semantic_role: "semi_minor_axis" },
    { x0: c, y0: 0, x1: 0, y1: b, label: `a=${fixed(a)}`, emphasis, semantic_role: "characteristic_triangle" },
  ];
  const base = (stage: number, caption: string, formula: string, check?: string): MathSceneSnapshot => ({
    kind: "math_scene", camera_mode: "fixed", x_min: -a - 1.5, x_max: a + 1.5, y_min: -b - 1.5, y_max: b + 1.5,
    x_label: "x", y_label: "y", curves: ellipseCurve(a, b),
    points: [
      { ...{ x: -c, y: 0 }, label: "$F_1$", emphasis: stage === 1 ? "accent" : "secondary", semantic_role: "focus" },
      { ...{ x: c, y: 0 }, label: "$F_2$", emphasis: stage === 1 ? "accent" : "secondary", semantic_role: "focus" },
      { ...p, label: "P", emphasis: "accent", semantic_role: "moving_point" },
    ],
    segments: [
      { x0: p.x, y0: p.y, x1: -c, y1: 0, label: `PF₁=${fixed(d1)}`, emphasis: stage <= 3 ? "accent" : "secondary", semantic_role: "focal_distance" },
      { x0: p.x, y0: p.y, x1: c, y1: 0, label: `PF₂=${fixed(d2)}`, emphasis: stage <= 3 ? "accent" : "secondary", semantic_role: "focal_distance" },
      ...(stage >= 6 ? triangle("accent") : []),
    ],
    annotations: check
      ? [{ x: -a - 1, y: b + 0.9, text: check, align: "nw", semantic_role: "derivation_panel" }]
      : [],
    formula_latex: formula, caption,
  });
  const steps = [
    sceneStep(0, "equation-setup", "观察目标：把定义翻译成方程", `建立坐标系，把焦点放在 x 轴上：F₁(−${fixed(c)},0)、F₂(${fixed(c)},0)。设 P(x,y)，定义"距离之和等于 2a"就写成一个含两个根号的方程。`, base(1, "先选好坐标系，定义才有最简单的代数形式。", String.raw`\sqrt{(x+c)^2+y^2}+\sqrt{(x-c)^2+y^2}=2a`, `$${fixed(d1)}+${fixed(d2)}=${fixed(d1 + d2)}=2a$`)),
    sceneStep(1, "equation-isolate", "移项：每次只处理一个根号", `直接平方会让两个根号纠缠在一起。先把一个根号移到右边：√((x+c)²+y²)=2a−√((x−c)²+y²)。当前点代入检验：左边 ${fixed(d1)}，右边 ${fixed(2 * a - d2)}，相等。`, base(2, "移项的目的只有一个：让下一次平方恰好消掉一个根号。", String.raw`\sqrt{(x+c)^2+y^2}=2a-\sqrt{(x-c)^2+y^2}`, `$${fixed(d1)}=2a-${fixed(d2)}$`)),
    sceneStep(2, "equation-first-square", "第一次平方：整理出线性关系", `两边平方后，x²、y² 与 c² 全部抵消，只剩 4cx−4a² 与根号项，整理得 a²−cx=a·√((x−c)²+y²)。当前点检验：左边 ${fixed(lhs3)}，右边 ${fixed(rhs3)}。`, base(3, "平方不是蛮力：抵消之后式子反而更短了。", String.raw`a^2-cx=a\sqrt{(x-c)^2+y^2}`, `$${fixed(lhs3)}=${fixed(rhs3)}$`)),
    sceneStep(3, "equation-second-square", "第二次平方：得到整式方程", `再平方一次消掉最后的根号：(a²−cx)²=a²[(x−c)²+y²]，展开整理得 (a²−c²)x²+a²y²=a²(a²−c²)。当前点检验：左边 ${fixed(lhs4)}，右边 ${fixed(rhs4)}。`, base(4, "两次平方后，方程里再也没有根号。", String.raw`(a^2-c^2)x^2+a^2y^2=a^2(a^2-c^2)`, `$${fixed(lhs4)}=${fixed(rhs4)}$`)),
    sceneStep(4, "equation-b-substitution", "引入 b²：写出标准方程", `因为 a>c>0，a²−c²=${fixed(a * a - c * c)} 是正数，把它记作 b²。两边除以 a²b²，得到标准方程 x²/a²+y²/b²=1。当前 P 代入，左边算得 ${fixed(residual, 4)}。`, base(5, "b² 不是硬凑记号：它就是那个反复出现的正数 a²−c²。", String.raw`\frac{x^2}{${fixed(a * a)}}+\frac{y^2}{${fixed(b * b)}}=1`, `$\\frac{x^2}{a^2}+\\frac{y^2}{b^2}=${fixed(residual, 4)}$`)),
    sceneStep(5, "equation-geometry", "总结：b 在图上是什么", `令 x=0 得 y=±b，所以 b=${fixed(b)} 是半短轴长。图中 O、(c,0)、(0,b) 构成直角三角形，斜边恰好为 a：这就是 b²=a²−c² 的几何身份。`, base(6, "推导中引入的 b，最终落在图形的短轴端点上。", String.raw`\boxed{\frac{x^2}{a^2}+\frac{y^2}{b^2}=1,\quad b^2=a^2-c^2}`)),
  ];
  return playbook("椭圆的标准方程推导", "从距离定义两次平方推出标准方程，每一步都有数值验证。", "conic_ellipse_standard_equation", steps, [
    { id: "a", label: "半长轴 a", value: fixed(a), description: "距离之和为 2a" },
    { id: "c", label: "半焦距 c", value: fixed(c), description: "自动保持 c<a" },
    { id: "t", label: "验证点 t", value: fixed(t), description: "选择代入检验的点" },
  ]);
}

function buildParametersEccentricity(params: TemplatePreviewParams): PlaybookScript {
  const a = clamp(numberParam(params, "a", 5), 3, 7);
  const c = Math.min(clamp(numberParam(params, "c", 3), 0.5, 6), a - 0.25);
  const b = Math.sqrt(a * a - c * c);
  const e = c / a;
  const cLow = 0.5;
  const bLow = Math.sqrt(a * a - cLow * cLow);
  const cHigh = a - 0.3;
  const bHigh = Math.sqrt(a * a - cHigh * cHigh);
  const comparison = (cx: number, bx: number): NonNullable<MathSceneSnapshot["curves"]>[number] => ({
    expression_x: `${a}*cos(t)`, expression_y: `${bx}*sin(t)`, t_min: 0, t_max: 2 * Math.PI,
    label: `e=${fixed(cx / a, 2)}`, emphasis: "accent", semantic_role: "comparison_curve",
  });
  const axes = (emphasis: "accent" | "secondary"): NonNullable<MathSceneSnapshot["segments"]> => [
    { x0: 0, y0: 0, x1: a, y1: 0, label: `a=${fixed(a)}`, emphasis, semantic_role: "semi_major_axis" },
    { x0: 0, y0: 0, x1: 0, y1: b, label: `b=${fixed(b)}`, emphasis, semantic_role: "semi_minor_axis" },
    { x0: 0, y0: 0, x1: c, y1: 0, label: `c=${fixed(c)}`, emphasis: "secondary", semantic_role: "semi_focal_distance" },
    { x0: c, y0: 0, x1: 0, y1: b, emphasis, semantic_role: "characteristic_triangle" },
  ];
  const base = (stage: number, caption: string, formula: string, extraCurve?: NonNullable<MathSceneSnapshot["curves"]>[number]): MathSceneSnapshot => ({
    kind: "math_scene", camera_mode: "fixed", x_min: -a - 1.5, x_max: a + 1.5, y_min: -a - 0.8, y_max: a + 0.8,
    x_label: "x", y_label: "y",
    curves: [
      { expression_x: `${a}*cos(t)`, expression_y: `${b}*sin(t)`, t_min: 0, t_max: 2 * Math.PI, label: "椭圆", emphasis: extraCurve ? "secondary" : "primary", semantic_role: "conic_curve" },
      ...(extraCurve ? [extraCurve] : []),
    ],
    points: [
      { x: -c, y: 0, label: "$F_1$", emphasis: stage === 2 ? "accent" : "secondary", semantic_role: "focus" },
      { x: c, y: 0, label: "$F_2$", emphasis: stage === 2 ? "accent" : "secondary", semantic_role: "focus" },
    ],
    segments: stage === 1 || stage === 6 ? axes(stage === 1 ? "accent" : "secondary") : stage === 2 ? axes("secondary") : [],
    annotations: stage >= 3
      ? [{ x: -a - 1, y: a + 0.4, text: `$e=\\dfrac{c}{a}=${fixed(e, 2)}$`, align: "nw", semantic_role: "derivation_panel" }]
      : [],
    formula_latex: formula, caption,
  });
  const steps = [
    sceneStep(0, "shape-setup", "观察目标：三个量与一个三角形", `在这个椭圆里，a=${fixed(a)} 是半长轴，b=${fixed(b)} 是半短轴，c=${fixed(c)} 是半焦距。O、(c,0)、(0,b) 组成直角三角形，斜边长度恰好是 a。`, base(1, "先认清 a、b、c 各自落在图上的哪条线段。", String.raw`b^2=a^2-c^2=${fixed(b * b)}`)),
    sceneStep(1, "shape-change-c", "改变 c：形状随焦点移动", `保持半长轴 a=${fixed(a)} 不变，调大 c：两个焦点向端点靠近，b=√(a²−c²) 随之变小，椭圆被压扁。当前 c=${fixed(c)}，b=${fixed(b)}。`, base(2, "焦点离中心越远，椭圆就越扁。", String.raw`b=\sqrt{a^2-c^2}=${fixed(b)}`)),
    sceneStep(2, "shape-eccentricity", "定义离心率：e=c/a", `把整幅图放大一倍，a 和 c 同时翻倍，椭圆的胖瘦却不变。所以度量形状要用比值：定义离心率 e=c/a，当前 e=${fixed(c)}/${fixed(a)}=${fixed(e, 2)}。`, base(3, "用比值度量形状，大小的影响就被除掉了。", String.raw`e=\frac{c}{a}=${fixed(e, 2)}`)),
    sceneStep(3, "shape-near-circle", "验证一：e 接近 0，椭圆接近圆", `作对照：同样的 a=${fixed(a)}，取 c=${fixed(cLow)}，此时 e=${fixed(cLow / a, 2)}，b=${fixed(bLow)} 几乎与 a 相等，对照曲线的轮廓接近圆。`, base(4, "对照曲线的 e 很小，长短轴几乎一样长。", String.raw`e=\frac{${fixed(cLow)}}{${fixed(a)}}=${fixed(cLow / a, 2)}`, comparison(cLow, bLow))),
    sceneStep(4, "shape-flat", "验证二：e 接近 1，椭圆越来越扁", `再作对照：取 c=${fixed(cHigh)}（非常接近 a），此时 e=${fixed(cHigh / a, 2)}，b 只剩 ${fixed(bHigh)}，对照曲线被压得很扁，越来越接近一条线段。`, base(5, "e 逼近 1 时，短轴迅速消失。", String.raw`e=\frac{${fixed(cHigh)}}{${fixed(a)}}=${fixed(cHigh / a, 2)}`, comparison(cHigh, bHigh))),
    sceneStep(5, "shape-summary", "总结：a 管大小，e 管形状", `因为 0<c<a，所以 0<e<1：e 靠近 0 时接近圆，靠近 1 时越来越扁。a 决定椭圆有多大，e 决定它有多圆或多扁，两个数合起来就确定了这个椭圆的样子。`, base(6, "大小与形状由 a 与 e 分工描述。", String.raw`\boxed{e=\frac{c}{a}\in(0,1)}`)),
  ];
  return playbook("椭圆的 a、b、c 与离心率", "认清三个量的几何身份，用 e=c/a 解释从圆到扁的变化。", "conic_ellipse_parameters_eccentricity", steps, [
    { id: "a", label: "半长轴 a", value: fixed(a), description: "决定椭圆大小" },
    { id: "c", label: "半焦距 c", value: fixed(c), description: "自动保持 c<a" },
  ]);
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
  // 人教 A 版约定：y²=2px，p 是焦点到准线的距离（焦准距），焦点 (p/2,0)、
  // 准线 x=−p/2。内核 spec 的 p 表示顶点到焦点的距离，因此传入 p/2。
  const p = clamp(numberParam(params, "p", 2), 1, 4);
  const t = clamp(numberParam(params, "t", 1.2), -2.2, 2.2);
  const spec = { p: p / 2 };
  const half = p / 2;
  const focus = parabolaFocus(spec);
  const point = parabolaPoint(spec, t);
  const foot = { x: -half, y: point.y };
  const distances = parabolaDefinitionDistances(spec, point);
  const snapshot = (stage: number, caption: string, formula: string): MathSceneSnapshot => ({
    // Viewport hugs the drawn content (vertex, focus, directrix, P up to
    // t=±2.2) so the action fills the frame instead of crowding one edge.
    kind: "math_scene", camera_mode: "fixed", x_min: -half - 1.2, x_max: p * 2.6, y_min: -p * 2.4, y_max: p * 2.4,
    x_label: "x", y_label: "y",
    curves: [{ expression_x: `${half}*t^2`, expression_y: `${p}*t`, t_min: -2.2, t_max: 2.2, label: "抛物线", emphasis: "primary", semantic_role: "conic_curve" }],
    points: [
      { ...focus, label: "F", emphasis: stage === 1 ? "accent" : "secondary", semantic_role: "focus" },
      ...(stage >= 2 ? [{ ...point, label: "P", emphasis: "accent", semantic_role: "moving_point" }] : []),
      ...(stage >= 3 ? [{ ...foot, label: "H", emphasis: "secondary", semantic_role: "projection_foot" }] : []),
    ],
    segments: [
      { x0: -half, y0: -p * 2.4, x1: -half, y1: p * 2.4, label: "准线", emphasis: stage === 1 ? "accent" : "secondary", semantic_role: "directrix" },
      ...(stage >= 3 ? [
        { x0: point.x, y0: point.y, x1: focus.x, y1: focus.y, label: `PF=${fixed(distances.focus)}`, emphasis: "accent", semantic_role: "focal_distance" },
        { x0: point.x, y0: point.y, x1: foot.x, y1: foot.y, label: `PH=${fixed(distances.directrix)}`, emphasis: "secondary", semantic_role: "directrix_distance" },
      ] : []),
    ],
    annotations: [],
    formula_latex: formula, caption,
  });
  const steps = [
    sceneStep(0, "parabola-focus-directrix", "观察目标：寻找等距规则", `抛物线 y²=2px 中，p=${fixed(p)} 是焦点到准线的距离。固定焦点 F=(${fixed(half)},0) 与准线 l:x=${fixed(-half)}，接下来只比较动点到它们的距离。`, snapshot(1, "一个定点、一条定直线，是整个定义的两个参照物。", String.raw`y^2=2px\ (p=${fixed(p)}),\quad F(\tfrac p2,0),\ l:x=-\tfrac p2`)),
    sceneStep(1, "parabola-moving-point", "改变 t：追踪曲线上的 P", `当 t=${fixed(t)} 时，P=(${fixed(point.x)},${fixed(point.y)})。拖动 t 会改变 P，但焦点和准线不动。`, snapshot(2, "这一幕只确定要测量的点 P。", String.raw`P(t)=\left(\tfrac p2 t^2,\ pt\right)`)),
    sceneStep(2, "parabola-project", "构造可比的两段距离", `连接 PF，再作 PH⊥l。H=(${fixed(-half)},${fixed(point.y)}) 是垂足，因此 PH 才是 P 到准线的最短距离。`, snapshot(3, "现在 PF 与 PH 表示同一个点 P 到两个参照物的距离。", String.raw`PH\perp l,\quad H\left(-\tfrac p2,\ pt\right)`)),
    sceneStep(3, "parabola-distance", "代数解释：为什么 PF=PH", `代入 P=(pt²/2, pt) 后，PF 化简为 (p/2)(t²+1)；而 PH=x_P+p/2，同样是 (p/2)(t²+1)。相等由参数式直接导出。`, snapshot(4, "两段距离随 t 同步改变，因为它们化简后是同一个式子。", String.raw`PF=\sqrt{\tfrac{p^2}{4}(t^2-1)^2+p^2t^2}=\tfrac p2(t^2+1)=PH`)),
    sceneStep(4, "parabola-definition", "数值验证并总结定义", `当前 PF=${fixed(distances.focus)}、PH=${fixed(distances.directrix)}，计算值一致。到定点 F 与定直线 l 距离相等的点的轨迹，就是抛物线。`, snapshot(4, "几何构造、代数化简和当前数值在这里共同验证定义。", String.raw`\boxed{PF=d(P,l)=${fixed(distances.focus)}}`)),
  ];
  return playbook("抛物线的焦点—准线定义", "比较动点到焦点和准线的距离。", "conic_parabola_focus_directrix", steps, [
    { id: "p", label: "焦准距 p", value: fixed(p), description: "焦点到准线的距离，y²=2px" },
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
    sceneStep(2, "hyperbola-moving-point", "改变 u：比较 P 的方向", `当前 P=(${fixed(p.x)},${fixed(p.y)})，比值 y/x=${fixed(p.y / p.x, 3)}。让 P 沿右支远离中心，这个比值会越来越接近 ±b/a=±${fixed(b / a, 3)}。`, snapshot(3, "这一幕只跟踪动点方向 y/x 如何靠近渐近线斜率。", String.raw`P(${fixed(p.x)},${fixed(p.y)}),\quad \frac yx=${fixed(p.y / p.x, 3)}`)),
    sceneStep(3, "hyperbola-focal-difference", "代数验证渐近趋势", `由方程解出 y=±(b/a)·√(x²−a²)。x 越大，√(x²−a²) 与 x 的差距越小，所以曲线与直线 y=±(b/a)x 无限接近但永不相交——这正是渐近线的含义。`, snapshot(4, "渐近线斜率来自代数化简，不只是目测结果。", String.raw`y=\pm\frac ba\sqrt{x^2-a^2}\longrightarrow\pm\frac ba x`)),
    sceneStep(4, "hyperbola-eccentricity", "建立第二个关系：焦距差", `现在引入 F₁、F₂。当前 PF₁=${fixed(d1)}、PF₂=${fixed(d2)}，两者不相等，但差的绝对值是 ${fixed(difference)}。`, snapshot(5, "分别测量两段焦距，关注它们的差而不是和。", String.raw`|PF_1-PF_2|=${fixed(difference)}`)),
    sceneStep(5, "hyperbola-summary", "推导、验证并总结", `令 c=√(a²+b²)=${fixed(c)}，离心率 e=c/a=${fixed(c / a, 3)}。右支上 PF₁=e·x+a、PF₂=e·x−a，相减后与 x 无关，恒得 2a=${fixed(2 * a)}。当前数值 ${fixed(difference)} 与推导一致。`, snapshot(6, "双曲线同时具有渐近方向与焦距差不变两层结构。", String.raw`PF_1-PF_2=(ex+a)-(ex-a)=\boxed{2a=${fixed(difference)}}`)),
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
  why: string;
  parameterNote: string;
  followupsByStep?: (params: TemplatePreviewParams) => Record<string, FollowupStepOverride>;
}): GoldTemplateManifest {
  const archetype = resolveConicArchetype(args.archetypeId);
  const defaultScript = args.builder(args.defaults);
  return attachPublicGoldTemplate({
    caseId: args.caseId, archetypeId: args.archetypeId, subject: "high_school_math", domain: "conic_sections", topic: args.topic,
    visibility: "public", title: args.title, description: args.description, canonicalPrompt: args.prompt,
    parameterSchema: { defaults: args.defaults, controls: args.controls },
    poster: { url: `/template-previews/${args.caseId}/poster.webp`, alt: `${args.title}的 Playbook 代表画面`, frame: posterFrameForStep(defaultScript, archetype.pedagogicalRubric.minimumSteps - 1) },
    buildPublicPlaybook: args.builder,
    buildFollowups: (params, script) => followups(
      script,
      { why: args.why, parameter: args.parameterNote },
      args.followupsByStep?.(params),
    ),
  });
}

export const CONIC_PUBLIC_GOLD_TEMPLATES: readonly GoldTemplateManifest[] = Object.freeze([
  manifest({
    caseId: "ellipse-string-construction",
    archetypeId: "conic.ellipse.string-construction",
    topic: "椭圆",
    title: "椭圆的绳长实验",
    description: "两枚图钉一段细绳，画出椭圆并归纳定义",
    prompt: "用绳长实验演示椭圆的定义：固定两枚图钉与一段细绳，展示 PF₁+PF₂=2a 恒成立并画出轨迹。",
    defaults: { rope: 10, pins: 6, t: 0.9 },
    controls: [
      { id: "rope", kind: "range", label: "绳长 2a", description: "7 到 13", min: 7, max: 13, step: 0.5, resetPlayback: false },
      { id: "pins", kind: "range", label: "图钉距离 2c", description: "自动保持小于绳长", min: 2, max: 6.5, step: 0.5, resetPlayback: false },
      { id: "t", kind: "range", label: "笔尖位置 t", description: "沿轨迹移动", min: 0, max: 6.28, step: 0.05, resetPlayback: false },
    ],
    builder: buildStringConstruction,
    why: "绳被拉直后就是 PF₁、PF₂ 两条线段，它们的和被绳长 2a 锁定；这个不变量正是椭圆定义的核心。",
    parameterNote: "增大绳长 2a 椭圆整体变大；图钉距离 2c 越接近 2a，椭圆越扁；一旦 2a 不大于 2c，轨迹退化为线段或不存在。",
  }),
  manifest({
    caseId: "ellipse-standard-equation",
    archetypeId: "conic.ellipse.standard-equation",
    topic: "椭圆",
    title: "椭圆的标准方程推导",
    description: "移项、两次平方到 b²=a²−c²，每步带数值验证",
    prompt: "从椭圆定义 PF₁+PF₂=2a 出发，通过移项与两次平方推导标准方程，并解释 b² 的引入。",
    defaults: { a: 5, c: 4, t: 0.7 },
    controls: [
      { id: "a", kind: "range", label: "半长轴 a", description: "3 到 7", min: 3, max: 7, step: 0.25, resetPlayback: false },
      { id: "c", kind: "range", label: "半焦距 c", description: "自动保持 c<a", min: 1, max: 6, step: 0.25, resetPlayback: false },
      { id: "t", kind: "range", label: "验证点 t", description: "选择代入检验的点", min: 0, max: 6.28, step: 0.05, resetPlayback: false },
    ],
    builder: buildStandardEquation,
    why: "每一步变形的合法性都能在当前验证点上核对：移项与平方不改变等式两边的数值相等，最终的 1 就是定义成立的代数化身。",
    parameterNote: "改变 a、c 会重算整条推导链的所有数值；拖动验证点 t 可以换一个点重新核对每一行等式。",
  }),
  manifest({
    caseId: "ellipse-parameters-eccentricity",
    archetypeId: "conic.ellipse.parameters-eccentricity",
    topic: "椭圆",
    title: "椭圆的 a、b、c 与离心率",
    description: "特征三角形、e=c/a，与从圆到扁的两极对照",
    prompt: "讲解椭圆中 a、b、c 的几何含义与关系 b²=a²−c²，并用离心率 e=c/a 解释形状变化。",
    defaults: { a: 5, c: 3 },
    controls: [
      { id: "a", kind: "range", label: "半长轴 a", description: "3 到 7", min: 3, max: 7, step: 0.25, resetPlayback: false },
      { id: "c", kind: "range", label: "半焦距 c", description: "自动保持 c<a", min: 0.5, max: 6, step: 0.25, resetPlayback: false },
    ],
    builder: buildParametersEccentricity,
    why: "b²=a²−c² 来自 O、(c,0)、(0,b) 的直角三角形；而形状只由比值 e=c/a 决定，因为同时缩放 a、c 不改变胖瘦。",
    parameterNote: "增大 a 椭圆整体变大但 e 不变形状不变；增大 c 则 e 上升、b 变小，椭圆变扁，直到 c 逼近 a 时接近线段。",
  }),
  manifest({ caseId: "ellipse-focus-definition", archetypeId: "conic.ellipse.focus-definition", topic: "椭圆", title: "椭圆的焦点定义", description: "观察动点到两焦点距离之和恒定", prompt: "用动点解释椭圆的焦点定义，并验证 PF₁+PF₂=2a。", defaults: { a: 5, b: 3, t: 1 }, controls: [
    { id: "a", kind: "range", label: "长半轴 a", description: "3 到 7", min: 3, max: 7, step: 0.25, resetPlayback: false },
    { id: "b", kind: "range", label: "短半轴 b", description: "自动满足 b<a", min: 1, max: 6.5, step: 0.25, resetPlayback: false },
    { id: "t", kind: "range", label: "动点参数 t", description: "沿椭圆移动", min: 0, max: 6.28, step: 0.05, resetPlayback: false },
  ], builder: buildEllipseFocus,
  why: "椭圆上任意一点到两焦点的距离之和恒等于 2a，这是由 b²=a²−c² 保证的代数恒等式。",
  parameterNote: "a 控制椭圆大小，b 控制扁平程度（须 b<a），t 只移动动点；焦距 c=√(a²−b²) 随 a、b 联动。",
  followupsByStep: (params) => {
    const a = clamp(numberParam(params, "a", 5), 3, 7);
    const b = clamp(numberParam(params, "b", 3), 1, a - 0.5);
    const t = clamp(numberParam(params, "t", 1), 0, 2 * Math.PI);
    const sum = ellipseFocalDistanceSum({ a, b }, ellipsePoint({ a, b }, t));
    return {
      "ellipse-foci": { why: `焦点由 c=√(a²−b²)=${fixed(Math.sqrt(a * a - b * b))} 唯一确定：椭圆越扁（b 越小），c 越大，两个焦点越靠近顶点。` },
      "ellipse-moving-point": { why: "P=(a·cos t, b·sin t) 代入 x²/a²+y²/b² 恒等于 1，所以无论 t 取多少，P 都不会离开这条椭圆。" },
      "ellipse-two-distances": { why: "P 靠近哪个焦点，那段焦半径就变短；由椭圆的对称结构，另一段恰好变长相应的量。" },
      "ellipse-distance-sum": { why: `当前 PF₁+PF₂=${fixed(sum)}，恰好等于 2a=${fixed(2 * a)}；多试几个 t 结果都相同，这不是巧合，下一步给出代数原因。` },
      "ellipse-shape-parameters": { why: "由 b²=a²−c² 化简得 PF₁=a+c·cos t、PF₂=a−c·cos t，两式相加时 ±c·cos t 两项正好抵消，只剩常数 2a。" },
      "ellipse-definition": { why: "距离和与 t 无关，说明「到两定点距离之和为 2a」刻画的正是这条椭圆上的全部点——这就是椭圆的定义。" },
    };
  } }),
  manifest({ caseId: "parabola-focus-directrix", archetypeId: "conic.parabola.focus-directrix", topic: "抛物线", title: "抛物线的焦点—准线定义", description: "同步比较动点到焦点和准线的距离", prompt: "用动点、焦点、准线和垂足解释抛物线 y²=2px 的定义。", defaults: { p: 2, t: 1.2 }, controls: [
    { id: "p", kind: "range", label: "焦准距 p", description: "焦点到准线的距离（y²=2px）", min: 1, max: 4, step: 0.25, resetPlayback: false },
    { id: "t", kind: "range", label: "动点参数 t", description: "控制 P", min: -2.2, max: 2.2, step: 0.05, resetPlayback: false },
  ], builder: buildParabola,
  why: "抛物线上任意一点到焦点的距离恒等于它到准线的距离，这由 y²=2px 直接化简可得。",
  parameterNote: "p 是焦点到准线的距离：p 越大，抛物线开口越阔，焦点与准线同时远离顶点；t 只移动动点。",
  followupsByStep: () => ({
    "parabola-focus-directrix": { why: "焦点与准线分别位于顶点两侧、各距 p/2；它们的间距 p 叫焦准距，定义只依赖这两个参照物。" },
    "parabola-moving-point": { why: "P=(pt²/2, pt) 满足 y²=2px，所以 P 始终在抛物线上；t 的符号决定 P 在 x 轴上方还是下方。" },
    "parabola-project": { why: "点到直线的距离是垂线段的长，所以必须作 PH⊥l；H 与 P 同高，PH 就是水平距离 x_P+p/2。" },
    "parabola-distance": { why: "PF=√((x−p/2)²+y²)，用 y²=2px 替换 y² 后根号内恰好配成 (x+p/2)²，开方即得 PH=x+p/2。" },
    "parabola-definition": { why: "无论 t 取多少，PF 与 PH 都化简为同一个式子 (p/2)(t²+1)，所以等距是恒成立的性质而不是当前参数下的巧合。" },
  }) }),
  manifest({ caseId: "hyperbola-asymptotes", archetypeId: "conic.hyperbola.asymptotes", topic: "双曲线", title: "双曲线与渐近线", description: "理解两支结构、渐近趋势和焦点距离差", prompt: "展示双曲线两支、渐近线、焦点与动点的距离差。", defaults: { a: 3, b: 2, u: 1 }, controls: [
    { id: "a", kind: "range", label: "实半轴 a", description: "保持正值", min: 1.5, max: 5, step: 0.25, resetPlayback: false },
    { id: "b", kind: "range", label: "虚半轴 b", description: "改变渐近线", min: 1, max: 4, step: 0.25, resetPlayback: false },
    { id: "u", kind: "range", label: "动点参数 u", description: "沿右支移动", min: -1.7, max: 1.7, step: 0.05, resetPlayback: false },
  ], builder: buildHyperbola,
  why: "双曲线的两支无限贴近渐近线 y=±(b/a)x，而两条焦半径之差恒等于 2a。",
  parameterNote: "a 决定两支间距与焦距差 2a，b 决定渐近线斜率 ±b/a；u 只沿右支移动动点。",
  followupsByStep: () => ({
    "hyperbola-branches": { why: "方程中 x²/a²=1+y²/b²≥1 迫使 |x|≥a，所以平面被分成互不相连、关于原点对称的左右两支。" },
    "hyperbola-asymptotes": { why: "把方程右边的 1 换成 0 就得到 y=±(b/a)x，它们是曲线的「极限方向」，本身不属于双曲线。" },
    "hyperbola-moving-point": { why: "远离中心时 y 与 x 同时增大，比值 y/x 逐渐稳定；下一步用代数证明它稳定到 ±b/a。" },
    "hyperbola-focal-difference": { why: "x−√(x²−a²)=a²/(x+√(x²−a²)) 随 x 增大趋于 0，所以曲线与直线 y=±(b/a)x 无限接近但永不相交。" },
    "hyperbola-eccentricity": { why: "右支上的点到较远焦点的距离总比到较近焦点多出固定的 2a——与椭圆的「和不变」形成对照。" },
    "hyperbola-summary": { why: "焦半径 PF₁=ex+a、PF₂=ex−a 都随 x 变化，但相减时 ex 项抵消，只剩常数 2a。" },
  }) }),
  manifest({ caseId: "line-ellipse-position", archetypeId: "conic.line-ellipse.position", topic: "直线与椭圆", title: "直线与椭圆的位置关系", description: "对应相交、相切、相离与判别式状态", prompt: "联立直线与椭圆，展示 Δ>0、Δ=0、Δ<0 和竖直直线。", defaults: { lineType: "slope", slope: 0.35, intercept: 0, verticalX: 4 }, controls: [
    { id: "lineType", kind: "select", label: "直线类型", description: "覆盖斜率不存在", resetPlayback: false, options: [{ label: "斜率式", value: "slope" }, { label: "竖直线", value: "vertical" }] },
    { id: "slope", kind: "range", label: "斜率 m", description: "斜率式", min: -1.2, max: 1.2, step: 0.05, resetPlayback: false },
    { id: "intercept", kind: "range", label: "截距 q", description: "斜率式", min: -4, max: 4, step: 0.05, resetPlayback: false },
    { id: "verticalX", kind: "range", label: "竖直线 x", description: "竖直式", min: -6, max: 6, step: 0.05, resetPlayback: false },
  ], builder: buildLineEllipse,
  why: "直线与椭圆的交点个数等于联立后一元二次方程实根的个数，由判别式 Δ 的符号唯一决定。",
  parameterNote: "调斜率或截距会连续改变 Δ 的符号；把截距推向 ±3 附近，可以亲眼看到相交→相切→相离的转变。",
  followupsByStep: (params) => {
    const lineType = params.lineType === "vertical" ? "vertical" : "slope";
    const line: LineSpec = lineType === "vertical"
      ? { kind: "vertical", x: clamp(numberParam(params, "verticalX", 4), -6, 6) }
      : { kind: "slope", slope: clamp(numberParam(params, "slope", 0.35), -1.2, 1.2), intercept: clamp(numberParam(params, "intercept", 0), -4, 4) };
    const result = intersectLineConic(ellipseImplicit({ a: 5, b: 3 }), line, 1e-8);
    return {
      "line-ellipse-setup": { why: "交点坐标必须同时满足直线与椭圆两个方程，联立消元后交点个数就等于一元二次方程实根的个数。" },
      "line-ellipse-secant": { why: "Δ>0 时方程有两个不同实根，对应两个不同交点；取 y=0 时两根 x=±5 正是长轴端点。" },
      "line-ellipse-tangent": { why: "Δ=0 表示两个实根重合成一个：几何上两个交点合并为唯一切点，直线恰好「擦过」椭圆。" },
      "line-ellipse-disjoint": { why: "Δ<0 时方程没有实根，代数上无解等价于几何上直线与椭圆没有公共点。" },
      "line-ellipse-vertical": { why: "竖直直线没有斜率，不能写成 y=mx+q；把 x=c 直接代入椭圆方程同样能数出交点个数，不需要伪造「无穷大斜率」。" },
      "line-ellipse-current": { why: `当前 Δ=${fixed(result.discriminant, 4)}，它的符号唯一决定实根个数，从而唯一决定交点个数。` },
    };
  } }),
  manifest({ caseId: "ellipse-chord-midpoint-locus", archetypeId: "conic.ellipse.chord-midpoint-locus", topic: "动弦与轨迹", title: "椭圆动弦与中点轨迹", description: "连接动弦、中点尾迹与韦达消元", prompt: "展示过椭圆内定点的动弦与中点轨迹，并用韦达关系验证。", defaults: { fixedX: 2, slope: 0.6 }, controls: [
    { id: "fixedX", kind: "range", label: "定点横坐标 q", description: "限制在椭圆内部", min: 0.8, max: 3.8, step: 0.1, resetPlayback: false },
    { id: "slope", kind: "range", label: "斜率 m", description: "控制动弦", min: -2.5, max: 2.5, step: 0.05, resetPlayback: false },
  ], builder: buildChordLocus,
  why: "过椭圆内定点的动弦中点满足由韦达定理导出的轨迹方程，轨迹是一个内含于原椭圆的小椭圆。",
  parameterNote: "q 移动定点：轨迹小椭圆的中心 (q/2,0) 与半轴随之变化，但始终内含于原椭圆；m 只选择当前这条动弦。",
  followupsByStep: (params) => {
    const q = clamp(numberParam(params, "fixedX", 2), 0.8, 3.8);
    return {
      "chord-family": { why: `所有动直线都写成 y=m(x−${fixed(q)})，无论 m 取多少都经过定点 Q(${fixed(q)},0)——这是「过定点的直线族」。` },
      "chord-endpoints": { why: "A、B 的横坐标是联立后一元二次方程的两个实根；Q 在椭圆内部保证 Δ>0，动弦总是存在。" },
      "chord-midpoint": { why: "中点坐标是两根的平均值，因此可以用韦达定理直接表达，而不必真的解出 A、B。" },
      "chord-trail": { why: "每个斜率 m 给出一个中点，m 连续变化时中点连续移动，尾迹就是这条轨迹的采样点。" },
      "chord-vieta": { why: `由 x_M=(x_A+x_B)/2 与 y_M=m(x_M−${fixed(q)}) 消去 m，得到只含 x_M、y_M 的方程——这就是轨迹方程。` },
      "chord-locus-result": { why: `轨迹方程可配方为中心 (${fixed(q / 2)},0) 的小椭圆；当前 M 代入后残差为 0，与尾迹重合。` },
    };
  } }),
]);
