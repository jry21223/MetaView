import type {
  AnySnapshot,
  MathFormulaSnapshot,
  MathPlotSnapshot,
  MetaStep,
  PhysicsForceSceneSnapshot,
  PlaybookScript,
} from "../../../../features/playbook/engine/types";
import type {
  TemplatePreviewFollowups,
  TemplatePreviewParams,
  TemplatePreviewQuestion,
} from "../../templatePreviewCases";
import {
  defineStandaloneGoldTemplate,
  type ExpectedFact,
  type GoldTemplateManifest,
  type PedagogicalRubric,
  type VisualInvariant,
} from "../manifest";
import {
  PROJECTILE_DEFAULTS,
  PROJECTILE_LIMITS,
  projectileAtFraction,
  projectileScenePoint,
  projectileSceneTrajectory,
  solveProjectile,
  type ProjectileState,
} from "./projectileMotionDomain";

const FPS = 30;
const STEP_FRAMES = 90;

function fixed(value: number, digits = 2): string {
  const rounded = Number(value.toFixed(digits));
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

function expressionNumber(value: number): string {
  return Number(value.toPrecision(12)).toString();
}

function teachingStep<T extends AnySnapshot>(
  index: number,
  id: string,
  title: string,
  narration: string,
  snapshot: T,
): MetaStep<T> {
  return {
    step_id: id,
    end_frame: (index + 1) * STEP_FRAMES,
    title,
    voiceover_text: narration,
    animation_hint: "draw teaching objects in causal order",
    snapshot,
    layers: [{
      id: `${id}-teaching-layer`,
      timing: { enter_at: 0, exit_at: 1, appear_anim: "draw", z_order: 0 },
      body: snapshot,
    }],
    tokens: [],
  };
}

function safePlotSpan(value: number): number {
  return Math.max(1, value);
}

function horizontalPositionPlot(state: ProjectileState): MathPlotSnapshot {
  const timeMax = safePlotSpan(state.flightTime);
  const plottedRange = state.vx * timeMax;
  return {
    kind: "math_plot",
    pack_id: "math-basic",
    curves: [{
      expression: `${expressionNumber(state.vx)}*x`,
      label: `x(t)=${fixed(state.vx)}t`,
      emphasis: "primary",
      semantic_role: "horizontal_position",
    }],
    x_min: 0,
    x_max: timeMax,
    y_min: 0,
    y_max: safePlotSpan(plottedRange * 1.12),
    marker_x: state.flightTime > 0 ? state.flightTime : 0,
    shade_from: null,
    shade_to: null,
    x_label: "t / s",
    y_label: "x / m",
    formula_latex: String.raw`x(t)=v_0\cos\theta\,t=${fixed(state.vx)}t`,
    caption: state.vx === 0
      ? "竖直发射时 vₓ=0，所以水平位置始终不变。"
      : `图像斜率恒为 vₓ=${fixed(state.vx)} m/s。`,
  };
}

function verticalVelocityPlot(state: ProjectileState): MathPlotSnapshot {
  const timeMax = safePlotSpan(state.flightTime);
  const plottedEndVelocity = state.vy0 - state.gravity * timeMax;
  const velocityExtent = safePlotSpan(
    Math.max(Math.abs(state.vy0), Math.abs(plottedEndVelocity)) * 1.2,
  );
  return {
    kind: "math_plot",
    pack_id: "math-basic",
    curves: [{
      expression: `${expressionNumber(state.vy0)}-${expressionNumber(state.gravity)}*x`,
      label: `vᵧ(t)=${fixed(state.vy0)}−${fixed(state.gravity)}t`,
      emphasis: "accent",
      semantic_role: "vertical_velocity",
    }],
    x_min: 0,
    x_max: timeMax,
    y_min: -velocityExtent,
    y_max: velocityExtent,
    marker_x: state.apexTime,
    shade_from: null,
    shade_to: null,
    x_label: "t / s",
    y_label: "vᵧ / (m·s⁻¹)",
    formula_latex: String.raw`v_y(t)=v_0\sin\theta-gt`,
    caption: state.flightTime === 0
      ? "地面切向边界没有正的腾空时间；公式仍给出随后向下的速度趋势。"
      : `直线斜率为 −g；在 t=${fixed(state.apexTime)} s 穿过 vᵧ=0。`,
  };
}

function verticalPositionPlot(state: ProjectileState): MathPlotSnapshot {
  const timeMax = safePlotSpan(state.flightTime);
  const plottedEndHeight = state.vy0 * timeMax - 0.5 * state.gravity * timeMax ** 2;
  return {
    kind: "math_plot",
    pack_id: "math-basic",
    curves: [{
      expression: `${expressionNumber(state.vy0)}*x-0.5*${expressionNumber(state.gravity)}*x^2`,
      label: "y(t)",
      emphasis: "primary",
      semantic_role: "vertical_position",
    }],
    x_min: 0,
    x_max: timeMax,
    y_min: Math.min(-1, plottedEndHeight * 1.12),
    y_max: safePlotSpan(state.maxHeight * 1.2),
    marker_x: state.apexTime,
    shade_from: null,
    shade_to: null,
    x_label: "t / s",
    y_label: "y / m",
    formula_latex: String.raw`y(t)=v_0\sin\theta\,t-\frac12gt^2`,
    caption: state.flightTime === 0
      ? "此边界下 y(t) 没有位于地面上方的正时间区间。"
      : `开口向下；顶点高度 H=${fixed(state.maxHeight)} m，两个零点是 0 与 ${fixed(state.flightTime)} s。`,
  };
}

interface PhysicsSnapshotOptions {
  showResultant?: boolean;
  showComponents?: boolean;
  showGravity?: boolean;
}

function physicsSnapshot(
  state: ProjectileState,
  fraction: number,
  caption: string,
  formulaLatex: string,
  options: PhysicsSnapshotOptions = {},
): PhysicsForceSceneSnapshot {
  const point = projectileAtFraction(state, fraction);
  const [x, y] = projectileScenePoint(state, fraction);
  const vectorScale = state.speed > 0 ? 18 / state.speed : 0;
  const vectors: PhysicsForceSceneSnapshot["vectors"] = [];

  if (options.showResultant && point.speed > 0) {
    vectors.push({
      id: "instantaneous-velocity",
      target: "projectile-body",
      semantic_role: "velocity",
      dx: point.vx * vectorScale,
      dy: -point.vy * vectorScale,
      label: "v",
      magnitude: `${fixed(point.speed)} m/s`,
    });
  }
  if (options.showComponents) {
    if (Math.abs(point.vx) > 1e-9) {
      vectors.push({
        id: "horizontal-velocity",
        target: "projectile-body",
        semantic_role: "velocity",
        dx: point.vx * vectorScale,
        dy: 0,
        label: "vₓ",
        magnitude: `${fixed(point.vx)} m/s`,
      });
    }
    if (Math.abs(point.vy) > 1e-9) {
      vectors.push({
        id: "vertical-velocity",
        target: "projectile-body",
        semantic_role: "velocity",
        dx: 0,
        dy: -point.vy * vectorScale,
        label: "vᵧ",
        magnitude: `${fixed(Math.abs(point.vy))} m/s`,
      });
    }
  }
  if (options.showGravity) {
    vectors.push({
      id: "gravity-acceleration",
      target: "projectile-body",
      semantic_role: "acceleration",
      dx: 0,
      dy: 9,
      label: "g",
      magnitude: `${fixed(state.gravity)} m/s²`,
    });
  }

  return {
    kind: "physics_force_scene",
    pack_id: "physics-basic",
    objects: [{
      id: "projectile-body",
      label: "质点",
      x,
      y,
      radius: 2.8,
    }],
    vectors,
    trajectory: projectileSceneTrajectory(state),
    formula_latex: formulaLatex,
    caption,
  };
}

function summaryFormula(state: ProjectileState): MathFormulaSnapshot {
  const formula = state.vx === 0
    ? String.raw`\begin{aligned}x(t)&=0\\y(t)&=${fixed(state.vy0)}t-\frac12(${fixed(state.gravity)})t^2\\\text{轨迹}&:\ x=0\end{aligned}`
    : String.raw`\begin{aligned}x(t)&=${fixed(state.vx)}t\\y(t)&=${fixed(state.vy0)}t-\frac12(${fixed(state.gravity)})t^2\\y(x)&=x\tan ${fixed(state.angle)}^\circ-\frac{${fixed(state.gravity)}}{2(${fixed(state.vx)})^2}x^2\end{aligned}`;
  return {
    kind: "math_formula",
    formula_latex: formula,
    caption: "同一个时间 t 连接两条分运动；消去 t 后得到抛物线轨迹。",
    highlights: ["x(t)", "y(t)", "y(x)"],
    annotations: [
      `飞行时间 T=${fixed(state.flightTime)} s`,
      `最高点 H=${fixed(state.maxHeight)} m`,
      `水平射程 R=${fixed(state.range)} m`,
    ],
  };
}

function boundaryFormula(state: ProjectileState): MathFormulaSnapshot {
  const boundaryExplanation = {
    regular: "当前参数是常规斜抛：T、H、R 都由同一组分量计算。",
    stationary: "v₀=0 时质点不离开原点，T=H=R=0。",
    "ground-tangent": "θ=0° 且从地面发射时，理想模型没有正的腾空时间，T=H=R=0。",
    "vertical-launch": "θ=90° 时 vₓ=0，因此 R=0；竖直上抛过程仍完整存在。",
  }[state.boundaryCase];
  return {
    kind: "math_formula",
    formula_latex: String.raw`y(0)=0,\quad y(T)=0,\quad v_y(T)=-v_{y0}`,
    caption: boundaryExplanation,
    highlights: ["y(0)=0", "y(T)=0"],
    annotations: [
      "模型边界：同一水平面起落、重力恒定、忽略空气阻力。",
      `当前输入已规范为 v₀=${fixed(state.speed)} m/s，θ=${fixed(state.angle)}°，g=${fixed(state.gravity)} m/s²。`,
      "非法数值使用默认值；超范围数值限制在模板公开的安全区间。",
    ],
  };
}

export function buildProjectileMotionPlaybook(params: TemplatePreviewParams): PlaybookScript {
  const state = solveProjectile({
    speed: params.speed,
    angle: params.angle,
    gravity: params.gravity,
  });
  const launchPrompt = state.boundaryCase === "regular"
    ? `以 ${fixed(state.speed)} m/s、${fixed(state.angle)}° 发射后，为什么轨迹会弯曲，又如何预测最高点和落点？`
    : `当前参数触发“${state.boundaryCase}”边界；先判断物体是否真正形成空中轨迹。`;
  const steps: MetaStep[] = [
    teachingStep(0, "projectile-observe", "先提出观察问题", launchPrompt, physicsSnapshot(
      state,
      0,
      "先区分初速度方向与始终竖直向下的重力加速度。",
      `v₀=${fixed(state.speed)} m/s · θ=${fixed(state.angle)}°`,
      { showResultant: true, showGravity: true },
    )),
    teachingStep(1, "projectile-decompose", "把初速度分解到两轴", `同一个初速度分解为 vₓ=${fixed(state.vx)} m/s 与 vᵧ₀=${fixed(state.vy0)} m/s。忽略空气阻力后，重力只改变竖直分量。`, physicsSnapshot(
      state,
      0,
      "水平与竖直运动共享时间，但遵循不同的运动规律。",
      "vₓ=v₀cosθ  vᵧ₀=v₀sinθ",
      { showComponents: true, showGravity: true },
    )),
    teachingStep(2, "projectile-horizontal", "建立水平位移—时间关系", state.vx === 0
      ? "竖直发射使水平分量为零，所以 x(t) 始终等于零。"
      : `水平方向没有加速度，vₓ=${fixed(state.vx)} m/s 保持不变，因此 x(t) 是一条过原点的直线。`, horizontalPositionPlot(state)),
    teachingStep(3, "projectile-vertical-velocity", "追踪竖直速度如何变化", state.flightTime === 0
      ? "当前边界没有正的腾空区间；但 vᵧ(t)=vᵧ₀−gt 仍说明重力使竖直速度持续减小。"
      : `vᵧ(t) 以每秒 ${fixed(state.gravity)} m/s 的速率减小，在 t=${fixed(state.apexTime)} s 变为零，随后转向下。`, verticalVelocityPlot(state)),
    teachingStep(4, "projectile-vertical-position", "建立竖直位移—时间关系", state.flightTime === 0
      ? "从地面水平擦出或静止时，模型没有位于地面上方的正时间区间。"
      : `对 vᵧ(t) 累积得到 y(t)。开口向下的二次函数在 t=${fixed(state.apexTime)} s 达到 ${fixed(state.maxHeight)} m。`, verticalPositionPlot(state)),
    teachingStep(5, "projectile-compose-trajectory", "用同一个时间生成轨迹", "对每个相同的 t，把 x(t) 与 y(t) 配成平面上的一个点；这些点连续连接，才得到真实轨迹，而不是先假定它是抛物线。", physicsSnapshot(
      state,
      0.35,
      `当前时刻 t=${fixed(state.flightTime * 0.35)} s 的横、纵坐标来自同一个时间参数。`,
      `P(t)=(x(t),y(t))`,
      { showResultant: true, showComponents: true, showGravity: true },
    )),
    teachingStep(6, "projectile-apex", "检查最高点", state.flightTime === 0
      ? "当前边界没有离地后的最高点；最大高度为零。"
      : `最高点只表示 vᵧ=0，并不表示速度为零；质点仍以 vₓ=${fixed(state.vx)} m/s 水平运动。`, physicsSnapshot(
      state,
      0.5,
      `tₕ=${fixed(state.apexTime)} s，H=${fixed(state.maxHeight)} m；此刻仍保留水平速度。`,
      `vᵧ=0 · H=${fixed(state.maxHeight)} m`,
      { showComponents: true, showGravity: true },
    )),
    teachingStep(7, "projectile-landing", "检查落地时刻", state.flightTime === 0
      ? "T=0 表示这组同高起落参数没有形成空中飞行段。"
      : `令 y(T)=0 并取非零根，得到 T=${fixed(state.flightTime)} s；再代入 x(T)，射程为 ${fixed(state.range)} m。`, physicsSnapshot(
      state,
      1,
      `落地时 vᵧ=${fixed(-state.vy0)} m/s；在理想同高模型中，它与初始竖直速度大小相等、方向相反。`,
      `T=${fixed(state.flightTime)} s · R=${fixed(state.range)} m`,
      { showResultant: true, showComponents: true, showGravity: true },
    )),
    teachingStep(8, "projectile-eliminate-time", "消去时间得到轨迹方程", state.vx === 0
      ? "vₓ=0 时不能用 x/vₓ 消去时间；轨迹退化为竖直线，必须单独讨论。"
      : "由 t=x/vₓ 代入 y(t)，得到关于 x 的二次函数。这一步把时间规律与空间轨迹严格连接起来。", summaryFormula(state)),
    teachingStep(9, "projectile-verify-boundaries", "总结结论并验证边界", `回代检查 y(0)=0、y(T)=0，并核对落地竖直速度。${boundaryFormula(state).caption}`, boundaryFormula(state)),
  ];

  return {
    schema_version: "2.0.0",
    fps: FPS,
    total_frames: steps.length * STEP_FRAMES,
    domain: "physics",
    title: "抛体运动：从分运动到轨迹",
    summary: "从观察问题出发，分别建立水平与竖直时间关系，再合成轨迹并验证最高点、落地与退化边界。",
    steps,
    parameter_controls: [
      { id: "speed", label: "初速度 v₀", value: fixed(state.speed), description: "单位 m/s；允许 0 以检查静止边界。" },
      { id: "angle", label: "抛射角 θ", value: fixed(state.angle), description: "0° 到 90°，覆盖水平与竖直退化。" },
      { id: "gravity", label: "重力加速度 g", value: fixed(state.gravity), description: "单位 m/s²；改变后完整重算时间、高度与射程。" },
    ],
    algorithm_id: "projectile_motion_teacher_case",
    initial_data: {
      speed: [fixed(state.speed)],
      angle: [fixed(state.angle)],
      gravity: [fixed(state.gravity)],
      boundary_case: [state.boundaryCase],
    },
  };
}

function questionsForStep(
  step: MetaStep,
  state: ProjectileState,
): TemplatePreviewQuestion[] {
  const common = {
    horizontal: state.vx === 0
      ? "当前 vₓ=0，水平位置不变。"
      : `当前 vₓ=${fixed(state.vx)} m/s 恒定，所以 x(t)=${fixed(state.vx)}t。`,
    vertical: `当前 vᵧ₀=${fixed(state.vy0)} m/s，重力使 vᵧ 每秒减少 ${fixed(state.gravity)} m/s。`,
    result: `T=${fixed(state.flightTime)} s，H=${fixed(state.maxHeight)} m，R=${fixed(state.range)} m。`,
    boundary: boundaryFormula(state).caption ?? "",
  };
  const local: Record<string, Array<[string, string]>> = {
    "projectile-observe": [
      ["这一幕先不要急着算什么？", "先辨认初速度与重力的方向，并提出轨迹为什么弯曲的问题。"],
      ["重力会直接改变水平速度吗？", "不会。忽略空气阻力时，重力只有竖直分量。"],
    ],
    "projectile-decompose": [
      ["为什么可以分别研究两个方向？", "水平与竖直方程共享同一个时间，但加速度分量彼此独立。"],
      ["当前两个初速度分量是多少？", `vₓ=${fixed(state.vx)} m/s，vᵧ₀=${fixed(state.vy0)} m/s。`],
    ],
    "projectile-horizontal": [
      ["直线图像的斜率表示什么？", common.horizontal],
      ["改变 g 会改变这条直线吗？", "不会；g 只进入竖直方向方程。"],
    ],
    "projectile-vertical-velocity": [
      ["vᵧ=0 是否表示物体静止？", `不一定；此时仍可能有 vₓ=${fixed(state.vx)} m/s。`],
      ["图像为什么是一条下降直线？", common.vertical],
    ],
    "projectile-vertical-position": [
      ["为什么 y(t) 是二次函数？", "因为竖直速度随时间线性变化，对速度累积后得到二次位移。"],
      ["最高点对应图像哪里？", `对应抛物线顶点，t=${fixed(state.apexTime)} s，y=${fixed(state.maxHeight)} m。`],
    ],
    "projectile-compose-trajectory": [
      ["轨迹点如何生成？", "选定同一个 t，分别算 x(t) 和 y(t)，再组成点 P(t)。"],
      ["为什么不能给 x、y 使用不同时间？", "真实质点在每个时刻只有一个位置，两个方向必须同步。"],
    ],
    "projectile-apex": [
      ["最高点的速度一定为零吗？", `只有 vᵧ=0；总速度大小是 |vₓ|=${fixed(Math.abs(state.vx))} m/s。`],
      ["最高点之后发生什么？", "vᵧ 变为负值，物体进入下降阶段；vₓ 仍保持不变。"],
    ],
    "projectile-landing": [
      ["y(T)=0 为什么有两个根？", "t=0 是发射时刻；另一个非负根才是同高落地时刻。"],
      ["怎样从 T 得到射程？", `代入 x(T)=vₓT，当前得到 R=${fixed(state.range)} m。`],
    ],
    "projectile-eliminate-time": [
      ["抛物线是如何推出来的？", "当 vₓ≠0 时，用 t=x/vₓ 消去时间，y 就成为 x 的二次函数。"],
      ["什么时候不能这样消元？", "竖直发射时 vₓ=0，不能除以零；轨迹退化为竖直线。"],
    ],
    "projectile-verify-boundaries": [
      ["最终数值结论是什么？", common.result],
      ["这些公式依赖哪些前提？", "同一水平面起落、匀强重力场、质点模型，并忽略空气阻力。"],
    ],
  };
  const firstTwo = local[step.step_id] ?? [["这一幕在说明什么？", step.voiceover_text]];
  return [
    ...firstTwo,
    ["调整初速度会怎样？", "在角度与 g 不变时，T 与 v₀ 成正比，H 与 R 与 v₀² 成正比。"],
    ["调整重力加速度会怎样？", "在 v₀ 与 θ 不变时，T、H、R 都与 g 成反比。"],
    ["当前参数是否触发边界？", common.boundary],
  ].slice(0, 5).map(([question, answer], index) => ({
    id: `${step.step_id}-q${index + 1}`,
    question,
    answer,
  }));
}

export function buildProjectileMotionFollowups(
  params: TemplatePreviewParams,
  script: PlaybookScript,
): TemplatePreviewFollowups {
  const state = solveProjectile({
    speed: params.speed,
    angle: params.angle,
    gravity: params.gravity,
  });
  return Object.fromEntries(script.steps.map((step) => [
    step.step_id,
    questionsForStep(step, state),
  ]));
}

export const PROJECTILE_EXPECTED_FACTS: readonly ExpectedFact[] = Object.freeze([
  {
    id: "projectile.horizontal-constant",
    description: "Horizontal velocity is constant and horizontal displacement is linear in time.",
    anyOf: ["v_x=v_0 cos(theta)", "x(t)=v_x t"],
    tolerance: 0.01,
  },
  {
    id: "projectile.vertical-kinematics",
    description: "Vertical velocity and displacement use the same downward gravity.",
    anyOf: ["v_y(t)=v_y0-g t", "y(t)=v_y0 t-1/2 g t^2"],
    tolerance: 0.01,
  },
  {
    id: "projectile.key-moments",
    description: "The apex and same-height landing are derived from the vertical equations.",
    anyOf: ["v_y(t_apex)=0", "y(T)=0", "R=v_x T"],
    tolerance: 0.01,
  },
  {
    id: "projectile.boundaries",
    description: "Stationary, ground-tangent, and vertical launches avoid division by zero and false airborne motion.",
    anyOf: ["v0=0 => T=H=R=0", "theta=90deg => R=0", "v_x=0 is not eliminated"],
  },
]);

export const PROJECTILE_VISUAL_INVARIANTS: readonly VisualInvariant[] = Object.freeze([
  {
    id: "projectile.causal-visual-chain",
    description: "Velocity components, gravity, time plots, and the trajectory preserve their semantic identity across the lesson.",
    requiredSemanticRoles: [
      "velocity",
      "acceleration",
      "horizontal_position",
      "vertical_velocity",
      "vertical_position",
    ],
    requiredStateFields: [
      "snapshot.objects",
      "snapshot.vectors",
      "snapshot.trajectory",
      "snapshot.curves",
      "snapshot.formula_latex",
    ],
  },
]);

export const PROJECTILE_PEDAGOGICAL_RUBRIC: PedagogicalRubric = Object.freeze({
  objective: "Students can derive a projectile path from two synchronized one-dimensional motions and verify key moments and model boundaries.",
  requiredPhases: [
    "observation-question",
    "velocity-decomposition",
    "horizontal-time-relation",
    "vertical-time-relations",
    "trajectory-composition",
    "apex-and-landing",
    "conclusion-and-boundary-check",
  ],
  minimumSteps: 10,
});

export const PROJECTILE_MOTION_GOLD_TEMPLATE: GoldTemplateManifest = defineStandaloneGoldTemplate({
  caseId: "projectile",
  archetypeId: "physics.projectile.motion-decomposition",
  subject: "high_school_physics",
  domain: "projectile_motion",
  topic: "抛体运动",
  title: "抛体运动：从分运动到轨迹",
  description: "从水平、竖直时间关系推导轨迹，并验证最高点、落地与退化边界",
  canonicalPrompt: "一个物体从地面以初速度 v₀、仰角 θ 抛出。在忽略空气阻力、重力恒定的条件下，从速度分解开始推导 x(t)、vᵧ(t)、y(t) 和轨迹方程，并说明最高点、落地时刻、射程以及 v₀=0、θ=0°、θ=90° 的边界。",
  requiredCapabilities: [
    "physics.projectile.solve",
    "physics.velocity.decompose",
    "math.time-series.plot",
    "physics.trajectory.compose",
    "education.boundary.verify",
  ],
  expectedFacts: PROJECTILE_EXPECTED_FACTS,
  visualInvariants: PROJECTILE_VISUAL_INVARIANTS,
  pedagogicalRubric: PROJECTILE_PEDAGOGICAL_RUBRIC,
  parameterSchema: {
    defaults: PROJECTILE_DEFAULTS,
    controls: [
      {
        id: "speed",
        kind: "range",
        label: "初速度 v₀",
        description: "m/s；含 v₀=0 边界",
        min: PROJECTILE_LIMITS.speed.min,
        max: PROJECTILE_LIMITS.speed.max,
        step: 1,
        resetPlayback: false,
      },
      {
        id: "angle",
        kind: "range",
        label: "抛射角 θ",
        description: "0° 到 90°",
        min: PROJECTILE_LIMITS.angle.min,
        max: PROJECTILE_LIMITS.angle.max,
        step: 1,
        resetPlayback: false,
      },
      {
        id: "gravity",
        kind: "range",
        label: "重力加速度 g",
        description: "m/s²；完整重算运动",
        min: PROJECTILE_LIMITS.gravity.min,
        max: PROJECTILE_LIMITS.gravity.max,
        step: 0.1,
        resetPlayback: false,
      },
    ],
  },
  poster: {
    url: "/template-previews/projectile/poster.webp",
    alt: "抛体运动最高点画面，同时显示水平速度、向下重力与完整轨迹",
    frame: 600,
  },
  buildPublicPlaybook: buildProjectileMotionPlaybook,
  buildFollowups: buildProjectileMotionFollowups,
});
