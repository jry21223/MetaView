import type { MathSceneSnapshot, MetaStep, PlaybookScript } from "../../../features/playbook/engine/types";
import {
  circlePolarLine,
  circleTangentPoints,
} from "../../../shared/domain/conicSections";
import type {
  TemplatePreviewFollowups,
  TemplatePreviewParams,
  TemplatePreviewQuestion,
} from "../templatePreviewCases";
import { attachPublicGoldTemplate, type GoldTemplateManifest } from "./manifest";

const FPS = 30;
const STEP_FRAMES = 90;
const RADIUS = 5;

interface PolePolarValues {
  radius: number;
  k: number;
  polarSum: number;
  pointA: readonly [number, number];
  pointB: readonly [number, number];
}

function finiteNumber(params: TemplatePreviewParams, key: string, fallback: number): number {
  const value = Number(params[key]);
  return Number.isFinite(value) ? value : fallback;
}

function fixed(value: number, digits = 2): string {
  const stable = value + Number.EPSILON * Math.max(1, Math.abs(value));
  const rounded = Number(stable.toFixed(digits));
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

function step(
  index: number,
  value: Omit<MetaStep<MathSceneSnapshot>, "end_frame" | "tokens">,
): MetaStep<MathSceneSnapshot> {
  return { ...value, end_frame: (index + 1) * STEP_FRAMES, tokens: [] };
}

function questions(
  stepId: string,
  entries: ReadonlyArray<readonly [string, string]>,
): TemplatePreviewQuestion[] {
  return entries.map(([question, answer], index) => ({
    id: `${stepId}-q${index + 1}`,
    question,
    answer,
  }));
}

function polePolarValues(params: TemplatePreviewParams): PolePolarValues {
  const k = Math.max(4, Math.min(8, finiteNumber(params, "k", 5)));
  const pole = { x: k, y: k };
  const [pointA, pointB] = circleTangentPoints({ x: 0, y: 0 }, RADIUS, pole);
  const polar = circlePolarLine({ x: 0, y: 0 }, RADIUS, pole);
  const polarSum = -polar.C / polar.A;
  return {
    radius: RADIUS,
    k,
    polarSum,
    pointA: [pointA.x, pointA.y],
    pointB: [pointB.x, pointB.y],
  };
}

function snapshot(
  values: PolePolarValues,
  stage: 1 | 2 | 3 | 4 | 5 | 6,
  caption: string,
  formulaLatex: string,
): MathSceneSnapshot {
  const [ax, ay] = values.pointA;
  const [bx, by] = values.pointB;
  const showTangency = stage >= 2;
  const showChord = stage >= 3;
  const showPolar = stage === 6;
  const halfSpan = 5.8;
  const midpoint = values.polarSum / 2;
  const viewMin = Math.min(
    -values.radius - 1,
    showPolar ? midpoint - halfSpan - 1 : Number.POSITIVE_INFINITY,
  );
  const viewMax = Math.max(
    values.radius + 1,
    values.k + 1,
    showPolar ? midpoint + halfSpan + 1 : Number.NEGATIVE_INFINITY,
  );
  const points: MathSceneSnapshot["points"] = [
    { x: 0, y: 0, label: "O", emphasis: "secondary", semantic_role: "center" },
    { x: values.k, y: values.k, label: "P", emphasis: stage === 1 || stage === 5 ? "accent" : "primary", semantic_role: "moving_point" },
  ];
  if (showTangency) {
    points.push(
      { x: ax, y: ay, label: "A", emphasis: stage === 4 ? "accent" : "primary", semantic_role: "tangent_point" },
      { x: bx, y: by, label: "B", emphasis: "primary", semantic_role: "tangent_point" },
    );
  }
  const segments: MathSceneSnapshot["segments"] = [];
  if (showTangency) {
    segments.push(
      { x0: values.k, y0: values.k, x1: ax, y1: ay, label: "PA", emphasis: stage === 2 ? "accent" : "secondary", semantic_role: "tangent" },
      { x0: values.k, y0: values.k, x1: bx, y1: by, label: "PB", emphasis: stage === 2 ? "accent" : "secondary", semantic_role: "tangent" },
      { x0: 0, y0: 0, x1: ax, y1: ay, label: "OA", emphasis: "secondary", semantic_role: "radius_to_tangent" },
      { x0: 0, y0: 0, x1: bx, y1: by, label: "OB", emphasis: "secondary", semantic_role: "radius_to_tangent" },
    );
  }
  if (showChord && !showPolar) {
    segments.push({ x0: ax, y0: ay, x1: bx, y1: by, label: "AB", emphasis: stage === 3 ? "accent" : "primary", semantic_role: "polar_line" });
  }
  if (showPolar) {
    segments.push({
      x0: midpoint - halfSpan,
      y0: midpoint + halfSpan,
      x1: midpoint + halfSpan,
      y1: midpoint - halfSpan,
      label: "polar-line",
      emphasis: "accent",
      semantic_role: "polar_line",
    });
  }
  const annotations: MathSceneSnapshot["annotations"] = [];
  if (stage === 1) annotations.push({ x: -5.4, y: 5.3, text: `$OP^2=${fixed(2 * values.k ** 2)}>R^2$`, align: "nw", semantic_role: "validity_check" });
  if (stage === 2) annotations.push({ x: -5.4, y: 5.3, text: "$OA\\perp PA,\\ OB\\perp PB$", align: "nw", semantic_role: "tangency_check" });
  if (stage === 3) annotations.push({ x: midpoint + 0.5, y: midpoint + 0.5, text: "接触弦 AB", align: "ne", semantic_role: "relation_label" });
  if (stage === 4) annotations.push({ x: ax + 0.45, y: ay + 0.65, text: "$A(a,b)$", align: "ne", semantic_role: "derivation_panel" });
  if (stage === 5) annotations.push({ x: -5.4, y: 5.3, text: String.raw`$A,B:\quad kx+ky=${values.radius ** 2}$`, align: "nw", semantic_role: "verification_panel" });
  if (showPolar) annotations.push({
    x: midpoint + 4.6,
    y: midpoint - 3.2,
    text: "极线",
    align: "se",
    semantic_role: "relation_label",
  });
  return {
    kind: "math_scene",
    camera_mode: "fixed",
    x_min: viewMin,
    x_max: viewMax,
    y_min: viewMin,
    y_max: viewMax,
    x_label: "x",
    y_label: "y",
    curves: [{
      expression_x: `${values.radius}*cos(t)`,
      expression_y: `${values.radius}*sin(t)`,
      t_min: 0,
      t_max: 2 * Math.PI,
      label: "C",
      emphasis: stage === 1 ? "primary" : "secondary",
      semantic_role: "conic_curve",
    }],
    points,
    segments,
    annotations,
    formula_latex: formulaLatex,
    caption,
    params: { R: values.radius, k: values.k },
  };
}

function buildPlaybook(params: TemplatePreviewParams): PlaybookScript {
  const values = polePolarValues(params);
  const k = fixed(values.k);
  const sum = fixed(values.polarSum);
  const [ax, ay] = values.pointA;
  const [bx, by] = values.pointB;
  const valueAtA = values.k * (ax + ay);
  const valueAtB = values.k * (bx + by);
  const steps = [
    step(0, { step_id: "pole-polar-setup", title: "观察目标：外点如何决定一条线", voiceover_text: `圆 C 的半径 R=${values.radius}，P=(${k},${k})。先验证 OP²=${fixed(2 * values.k ** 2)}>R²=25，所以 P 在圆外，两条实切线的构造才成立。`, snapshot: snapshot(values, 1, "第一步只检查构造条件：P 必须在圆外。", `OP^2=2k^2=${fixed(2 * values.k ** 2)}>R^2=25`) }),
    step(1, { step_id: "pole-polar-tangents", title: "构造两条切线并验证切点", voiceover_text: "从 P 引 PA、PB，再连接 OA、OB。画面中 OA⊥PA、OB⊥PB，这两个直角确认 A、B 确实是切点。", snapshot: snapshot(values, 2, "半径与切线的垂直关系，是这一幕唯一需要确认的事实。", "OA\\perp PA,\\quad OB\\perp PB") }),
    step(2, { step_id: "pole-polar-chord", title: "连接 A、B：猜想接触弦的方程", voiceover_text: "连接两个切点得到接触弦 AB。我们要寻找一个同时被 A、B 满足的一次方程；这条直线就是 P 关于圆 C 的极线。", snapshot: snapshot(values, 3, "先看见接触弦，再用切线方程证明它由 P 唯一决定。", "A,B\\in C\\quad\\text{且}\\quad A,B\\in l") }),
    step(3, { step_id: "pole-polar-tangent-equation", title: "代数解释：切线方程从哪里来", voiceover_text: "设 A=(a,b)。向量 OA=(a,b) 是切线的法向量，而 A 在圆上，a²+b²=R²，因此 A 点切线为 ax+by=R²。", snapshot: snapshot(values, 4, "法向量给出左边，切点在圆上给出右边 R²。", "A(a,b):\\quad (a,b)\\cdot(x,y)=a^2+b^2=R^2") }),
    step(4, { step_id: "pole-polar-substitute-pole", title: "代入 P：验证 A、B 共线", voiceover_text: `P=(${k},${k}) 同时在 A、B 处的两条切线上。对当前切点计算，k(a+b)=${fixed(valueAtA)}，k(x_B+y_B)=${fixed(valueAtB)}，都等于 R²=25，因此 A、B 共同满足 kx+ky=25。`, snapshot: snapshot(values, 5, `两个切点分别代入同一方程，数值均为 25。`, `A,B:\\quad kx+ky=R^2=25\\Rightarrow x+y=${sum}`) }),
    step(5, { step_id: "pole-polar-result", title: "写出极线并总结联动关系", voiceover_text: `所以 P=(${k},${k}) 的极线是 kx+ky=25，即 x+y=${sum}。增大 k 时，25/k 变小，极线便向原点平移；构造、推导与参数变化由同一方程统一。`, snapshot: snapshot(values, 6, `当前画面只突出整条极线 x+y=${sum}，而不再突出单个切点。`, `\\boxed{kx+ky=R^2}\\iff\\boxed{x+y=${sum}}`) }),
  ];
  return {
    schema_version: "2.0.0",
    fps: FPS,
    total_frames: steps.length * STEP_FRAMES,
    domain: "math",
    title: "极点与极线：从两条切线到接触弦",
    summary: "用圆外点的两条切线推导接触弦方程，并观察极点移动时极线如何联动。",
    steps,
    parameter_controls: [{ id: "k", label: "外点坐标 k", value: k, description: "外点固定为 P=(k,k)，圆半径 R=5。" }],
    algorithm_id: "circle_pole_polar",
    initial_data: { radius: [String(values.radius)], pole: [k, k], polar_sum: [sum] },
  };
}

function buildFollowups(
  params: TemplatePreviewParams,
  script: PlaybookScript,
): TemplatePreviewFollowups {
  const values = polePolarValues(params);
  const k = fixed(values.k);
  const sum = fixed(values.polarSum);
  const [ax, ay] = values.pointA;
  const [bx, by] = values.pointB;
  const specific: Record<string, readonly [string, string]> = {
    "pole-polar-setup": ["为什么必须让 P 在圆外？", "圆外点才能向圆引出两条不同的实切线，从而得到两个切点 A、B。"],
    "pole-polar-tangents": ["怎样确认 PA、PB 是切线？", "切点处半径垂直于切线，所以 OA⊥PA、OB⊥PB。"],
    "pole-polar-chord": ["AB 在这里叫什么？", "AB 是两个切点的接触弦，也是 P 关于圆 C 的极线。"],
    "pole-polar-tangent-equation": ["切点 A 的坐标怎样进入切线方程？", "若 A=(a,b)，则切线为 ax+by=R²。"],
    "pole-polar-substitute-pole": ["为什么 A、B 满足同一个一次方程？", `P=(${k},${k}) 同时位于两条切线上，代入两条切线公式都会得到 kx+ky=R²。`],
    "pole-polar-result": ["当前极线的最终方程是什么？", `kx+ky=25，化简为 x+y=${sum}。`],
  };
  const detail: Record<string, readonly [string, string]> = {
    "pole-polar-setup": ["怎样验证 P 确实在圆外？", `OP²=2k²=${fixed(2 * values.k ** 2)}，大于 R²=25。`],
    "pole-polar-tangents": ["当前两个切点坐标是多少？", `A=(${fixed(ax)},${fixed(ay)})，B=(${fixed(bx)},${fixed(by)})。`],
    "pole-polar-chord": ["接触弦由什么决定？", "圆固定后，接触弦的位置只由圆外点 P 决定。"],
    "pole-polar-tangent-equation": ["为什么切线公式右侧是 R²？", "因为 A 在圆上，所以 a²+b²=R²；把 A 代入 ax+by 正好得到 R²。"],
    "pole-polar-substitute-pole": ["这里如何同时利用两个切点？", "对 A、B 分别重复同一次代入，就能证明它们落在同一条直线上。"],
    "pole-polar-result": ["k 变大时极线怎样移动？", "R 固定时 R²/k 变小，所以直线 x+y=R²/k 向原点方向平移。"],
  };
  return Object.fromEntries(script.steps.map((item) => [item.step_id, questions(item.step_id, [
    specific[item.step_id] ?? ["这一幕说明什么？", item.voiceover_text],
    ["本题最关键的不变量是什么？", "两个切点始终同时位于圆上，并且同时满足由外点 P 决定的一次方程。"],
    detail[item.step_id] ?? ["下一步要寻找什么？", "继续寻找能同时描述两个切点的一次方程。"],
  ])]));
}

export const POLE_POLAR_GOLD_TEMPLATE: GoldTemplateManifest = attachPublicGoldTemplate({
  caseId: "pole-polar",
  archetypeId: "conic.pole-polar.circle",
  subject: "high_school_math",
  domain: "conic_sections",
  topic: "极点与极线",
  visibility: "public",
  title: "极点与极线（拓展）",
  description: "拓展（强基方向）：从圆外点的两条切线推导接触弦与极线方程，不属于常规课标序列",
  canonicalPrompt: "已知圆 x²+y²=25 和圆外点 P=(k,k)，推导接触弦及极线方程。",
  parameterSchema: {
    defaults: { k: 5 },
    controls: [{
      id: "k",
      kind: "range",
      label: "外点坐标 k",
      description: "P=(k,k)，R=5；限制在圆外",
      min: 4,
      max: 8,
      step: 0.25,
      resetPlayback: false,
    }],
  },
  poster: {
    url: "/template-previews/pole-polar/poster.webp",
    alt: "圆外点、两条切线与接触弦极线的 Playbook 画面",
    frame: 500,
  },
  buildPublicPlaybook: buildPlaybook,
  buildFollowups,
});
