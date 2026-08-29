import type {
  MathFormulaSnapshot,
  MathPlotSnapshot,
  MetaStep,
  PhasePortraitSceneSnapshot,
  PhysicsForceSceneSnapshot,
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
 * 弹簧简谐振动 · 等时性与能量的椭圆。
 *
 * Hooke sealed his spring law inside the 1676 anagram "ceiiinosssttuv"
 * (Ut tensio, sic vis). The lesson runs guess-and-verify on x(t)=A·cos(ωt),
 * lands the amplitude-free period (the clockmaker's isochronism), converts
 * the motion into the phase-plane energy ellipse, and closes on why every
 * smooth potential well is simple-harmonic near its bottom.
 *
 * All numbers are closed-form: ω=√(k/m), T=2π/ω, v_max=Aω, E=kA²/2.
 */

export interface ShmState {
  amplitude: number;
  stiffness: number;
  mass: number;
  omega: number;
  period: number;
  maxSpeed: number;
  energy: number;
}

export function solveShm(params: TemplatePreviewParams): ShmState {
  const amplitude = boundedNumber(params, "A", 0.5, 0.2, 1.2);
  const stiffness = boundedNumber(params, "k", 4, 1, 16);
  const mass = boundedNumber(params, "m", 1, 0.25, 4);
  const omega = Math.sqrt(stiffness / mass);
  return {
    amplitude,
    stiffness,
    mass,
    omega,
    period: (2 * Math.PI) / omega,
    maxSpeed: amplitude * omega,
    energy: 0.5 * stiffness * amplitude ** 2,
  };
}

function num(value: number): string {
  return Number(value.toPrecision(12)).toString();
}

/**
 * Scene-space (0–100) oscillator: wall, zig-zag spring coil, equilibrium mark,
 * amplitude range, and the displaced mass — a spring you can actually see.
 */
function oscillatorScene(state: ShmState, caption: string, formulaLatex: string): PhysicsForceSceneSnapshot {
  // The oscillator is a horizontal apparatus, so it declares the same wide
  // (16:9) scene space the projectile uses instead of the central square.
  const sceneWidth = 168;
  const metersToScene = 42;
  const equilibriumX = sceneWidth / 2;
  const wallX = 22;
  const massRadius = 4;
  const massX = equilibriumX + state.amplitude * metersToScene;
  const forceScale = 18 / Math.max(1, state.stiffness * state.amplitude);
  return {
    kind: "physics_force_scene",
    pack_id: "physics-basic",
    scene_width: sceneWidth,
    objects: [
      { id: "shm-mass", label: `m=${fixed(state.mass)} kg`, x: massX, y: 55, radius: massRadius },
    ],
    vectors: [{
      id: "restoring-force",
      target: "shm-mass",
      semantic_role: "force",
      dx: -state.stiffness * state.amplitude * forceScale,
      dy: 0,
      label: "F=−kx",
      // The narration carries |F|=kA; a number at the arrow tip would sit on
      // the equilibrium mark in this tight layout.
      magnitude: null,
    }],
    trajectories: [
      {
        id: "shm-wall",
        points: [[wallX, 43], [wallX, 67]],
        emphasis: "primary",
        semantic_role: "wall",
      },
      {
        id: "shm-amplitude-range",
        // One full period sampled uniformly in time, x(t)=A·cos(ωt): the drawn
        // dashed line is unchanged (all points collinear on the ±A ruler), but
        // the flow tracer riding it performs real simple harmonic motion —
        // slowest at the turning points, fastest through the equilibrium mark.
        points: Array.from({ length: 49 }, (_, index): [number, number] => [
          equilibriumX + state.amplitude * metersToScene * Math.cos((2 * Math.PI * index) / 48),
          64,
        ]),
        label: `±A=${fixed(state.amplitude)} m`,
        emphasis: "secondary",
        semantic_role: "amplitude_range",
        flow: true,
      },
    ],
    springs: [{
      id: "shm-spring",
      x0: wallX,
      y0: 55,
      x1: massX - massRadius,
      y1: 55,
      coils: 9,
      label: `k=${fixed(state.stiffness)} N/m`,
      semantic_role: "spring_coil",
    }],
    points: [{
      x: equilibriumX,
      y: 55,
      emphasis: "accent",
      semantic_role: "equilibrium_mark",
    }],
    annotations: [{
      x: equilibriumX,
      y: 68.6,
      text: "平衡点 O",
      semantic_role: "equilibrium_label",
    }],
    formula_latex: formulaLatex,
    caption,
  };
}

function displacementPlot(state: ShmState, args: {
  reference?: { amplitude: number; label: string };
  damped?: boolean;
  periods?: number;
  marker?: number | null;
  caption: string;
  formula: string;
}): MathPlotSnapshot {
  const windowEnd = (args.periods ?? 2) * state.period;
  const curves: MathPlotSnapshot["curves"] = [{
    expression: `${num(state.amplitude)}*cos(${num(state.omega)}*x)`,
    label: `x(t)=${fixed(state.amplitude)}·cos(${fixed(state.omega)}t)`,
    emphasis: "primary",
    semantic_role: "displacement_curve",
  }];
  if (args.reference && Math.abs(args.reference.amplitude - state.amplitude) > 1e-9) {
    curves.push({
      expression: `${num(args.reference.amplitude)}*cos(${num(state.omega)}*x)`,
      label: args.reference.label,
      emphasis: "secondary",
      semantic_role: "displacement_reference",
    });
  }
  if (args.damped) {
    const decay = 1 / (2 * state.period);
    curves.push({
      expression: `${num(state.amplitude)}*exp(-${num(decay)}*x)*cos(${num(state.omega)}*x)`,
      label: "有阻尼对照",
      emphasis: "secondary",
      semantic_role: "damped_reference",
    });
  }
  curves.push(
    { expression: `${num(state.amplitude)}`, label: `+A`, emphasis: "secondary", semantic_role: "amplitude_bound" },
    { expression: `${num(-state.amplitude)}`, label: `−A`, emphasis: "secondary", semantic_role: "amplitude_bound" },
  );
  const extent = Math.max(state.amplitude, args.reference?.amplitude ?? 0) * 1.3;
  return {
    kind: "math_plot",
    pack_id: "math-basic",
    curves,
    x_min: 0,
    x_max: windowEnd,
    y_min: -extent,
    y_max: extent,
    marker_x: args.marker ?? null,
    shade_from: null,
    shade_to: null,
    x_label: "时间 t / s",
    y_label: "位移 x / m",
    formula_latex: args.formula,
    caption: args.caption,
  };
}

function energyPlot(state: ShmState, caption: string): MathPlotSnapshot {
  const half = 0.5 * state.energy;
  const doubledOmega = 2 * state.omega;
  return {
    kind: "math_plot",
    pack_id: "math-basic",
    curves: [
      {
        expression: `${num(half)}*(1+cos(${num(doubledOmega)}*x))`,
        label: "势能 Ep",
        emphasis: "primary",
        semantic_role: "potential_energy",
      },
      {
        expression: `${num(half)}*(1-cos(${num(doubledOmega)}*x))`,
        label: "动能 Ek",
        emphasis: "accent",
        semantic_role: "kinetic_energy",
      },
      {
        expression: `${num(state.energy)}`,
        label: `E=${fixed(state.energy)} J`,
        emphasis: "secondary",
        semantic_role: "total_energy",
      },
    ],
    x_min: 0,
    x_max: 2 * state.period,
    y_min: 0,
    y_max: state.energy * 1.25,
    marker_x: state.period / 4,
    shade_from: null,
    shade_to: null,
    x_label: "时间 t / s",
    y_label: "能量 / J",
    formula_latex: String.raw`E_p+E_k=\tfrac12kA^2=${fixed(state.energy)}\ \text{J}`,
    caption,
  };
}

function phasePortrait(state: ShmState): PhasePortraitSceneSnapshot {
  const samples = 96;
  const orbit: Array<[number, number]> = Array.from({ length: samples + 1 }, (_, index) => {
    const phase = (index / samples) * 2 * Math.PI;
    return [state.amplitude * Math.cos(phase), -state.maxSpeed * Math.sin(phase)];
  });
  return {
    kind: "phase_portrait_scene",
    trajectories: [{ points: orbit, label: "能量椭圆", emphasis: "primary" }],
    equilibria: [{ x: 0, y: 0, label: "平衡点", stable: true }],
    x_min: -state.amplitude * 1.35,
    x_max: state.amplitude * 1.35,
    y_min: -state.maxSpeed * 1.35,
    y_max: state.maxSpeed * 1.35,
    formula_latex: String.raw`\frac{x^2}{A^2}+\frac{v^2}{(A\omega)^2}=1`,
    caption: `横轴位移、纵轴速度：半轴 A=${fixed(state.amplitude)} 与 Aω=${fixed(state.maxSpeed)}，一圈恰是一个周期。`,
  };
}

function potentialWellPlot(state: ShmState, caption: string): MathPlotSnapshot {
  const morseSlope = Math.sqrt(state.stiffness) / 2;
  const parabolaTop = 2.6;
  const reach = Math.sqrt((2 * parabolaTop) / state.stiffness);
  return {
    kind: "math_plot",
    pack_id: "math-basic",
    curves: [
      {
        expression: `0.5*${num(state.stiffness)}*x^2`,
        label: "抛物线 ½kx²",
        emphasis: "primary",
        semantic_role: "potential_energy",
      },
      {
        expression: `2*(1-exp(-${num(morseSlope)}*x))^2`,
        label: "某条真实势能",
        emphasis: "secondary",
        semantic_role: "real_potential",
      },
    ],
    x_min: -Math.max(1.1, reach * 0.9),
    x_max: Math.max(2.6, reach * 1.6),
    y_min: 0,
    y_max: parabolaTop,
    marker_x: 0,
    shade_from: null,
    shade_to: null,
    x_label: "偏离平衡 x",
    y_label: "势能 V(x)",
    formula_latex: String.raw`V(x)\approx V(0)+\tfrac12V''(0)\,x^2`,
    caption,
  };
}

function newtonFormula(state: ShmState): MathFormulaSnapshot {
  return {
    kind: "math_formula",
    formula_latex: String.raw`ma=-kx\ \Longrightarrow\ a=-\frac{k}{m}\,x=-${fixed(state.stiffness / state.mass)}\,x`,
    caption: "加速度与位移成正比、方向相反——不是匀加速，而是每一刻都被位置改写。",
    highlights: [String.raw`-\frac{k}{m}\,x`],
    annotations: [
      `k=${fixed(state.stiffness)} N/m`,
      `m=${fixed(state.mass)} kg`,
      `k/m=${fixed(state.stiffness / state.mass)} s⁻²，这个数马上有名字`,
    ],
  };
}

export function buildSpringShmGoldPlaybook(params: TemplatePreviewParams): PlaybookScript {
  const state = solveShm(params);
  const { amplitude, stiffness, mass, omega, period, maxSpeed, energy } = state;
  const steps: MetaStep[] = [
    sceneStep(0, "shm-hooke", "从一行字谜开始", `1676 年，罗伯特·胡克在书末印了一行乱码：ceiiinosssttuv。两年后他公布谜底——拉丁文 Ut tensio, sic vis，“伸长几分，力便几分”，也就是 F=−kx。那个年代的发现靠字谜抢时间戳，定律本身却简单得出奇。现在把 m=${fixed(mass)} kg 的砝码接上 k=${fixed(stiffness)} N/m 的弹簧，拉开 A=${fixed(amplitude)} m 后松手：它开始一场理想中永不停歇的往返。这门课要回答的问题：为什么位置随时间恰好是一条余弦曲线？`, oscillatorScene(
      state,
      "砝码被拉到最远处；恢复力已指回平衡点。",
      String.raw`F=-kx`,
    )),
    sceneStep(1, "shm-restoring", "恢复力：总想回家，回家又刹不住", `胡克定律的负号是全部剧情：无论砝码在哪一侧，力都指回平衡点，偏得越远拉得越狠——当前在 x=A=${fixed(amplitude)} m 处 |F|=kA=${fixed(stiffness * amplitude)} N。回到中点力归零，速度却在那一刻最大，于是冲过头，再被反向拉回。振动的引擎就是这对矛盾：总想回家，回家又刹不住。`, oscillatorScene(
      state,
      "力随位移线性增长、方向始终相反：负号驱动整场往返。",
      `|F| = kA = ${fixed(stiffness * amplitude)} N`,
    )),
    sceneStep(2, "shm-newton", "牛顿翻译：a=−(k/m)x", `把胡克定律交给牛顿第二定律：ma=−kx，即 a=−(k/m)x=−${fixed(stiffness / mass)}x。注意——这不是匀加速：加速度每一刻都跟着位置变，位置由速度积累，速度又被加速度改写。这种“变化率由自身状态决定”的循环，正是导数语言的主场。当前 k/m=${fixed(stiffness / mass)} s⁻²，这个数马上会有自己的名字。`, newtonFormula(state)),
    sceneStep(3, "shm-cosine", "猜一条曲线来验：余弦严丝合缝", `物理的老办法——猜解并验证。试 x(t)=A·cos(ωt)：求导得 v(t)=−Aω·sin(ωt)，再求导得 a(t)=−Aω²·cos(ωt)=−ω²x。只要 ω²=k/m，方程严丝合缝——当前 ω=√(${fixed(stiffness)}/${fixed(mass)})=${fixed(omega)} rad/s。初始条件同样吻合：从静止释放，x(0)=A=${fixed(amplitude)} m、v(0)=0。微积分问世不过几十年，弹簧就成了它最早的战利品之一。`, displacementPlot(state, {
      marker: 0,
      caption: "余弦曲线在 ±A 两条界线之间往返；起点在最高处。",
      formula: String.raw`x(t)=${fixed(amplitude)}\cos(${fixed(omega)}t)`,
    })),
    sceneStep(4, "shm-isochronism", "等时性：公式里没有 A", `周期 T=2π/ω=2π√(m/k)=${fixed(period)} s。盯着这条公式看——里面没有振幅 A。把右侧的 A 拖大拖小：曲线变高变矮，过零的节拍却一格不动。这就是等时性，机械钟表三百年的命根子：发条渐松、摆幅渐衰，钟却不因此变快变慢。`, displacementPlot(state, {
      reference: { amplitude: 0.5, label: "对照 A=0.5" },
      marker: period,
      caption: `不同振幅的曲线在同一时刻过零；T=${fixed(period)} s 只认 m/k。`,
      formula: String.raw`T=2\pi\sqrt{\tfrac{m}{k}}=${fixed(period)}\ \text{s}`,
    })),
    sceneStep(5, "shm-energy", "能量交换：一格不漏", `换能量的眼睛再看一遍：端点处速度为零，能量全是势能 ½kA²=${fixed(energy)} J；掠过平衡点时势能归零，能量全是动能，速度到达最大 vmax=Aω=${fixed(maxSpeed)} m/s。两条能量曲线此消彼长，每个周期完整交换两次，总和纹丝不动。无摩擦时，这 ${fixed(energy)} J 被永久锁在系统里。`, energyPlot(
      state,
      "势能与动能反相摆动，总能量是一条水平线。",
    )),
    sceneStep(6, "shm-phase", "相图：能量守恒的形状", `把每一刻的状态画成平面上的一个点：横轴是位置 x，纵轴是速度 v。简谐运动画出一个完美的椭圆——半轴恰是 A=${fixed(amplitude)} 与 Aω=${fixed(maxSpeed)}，转满一圈正好一个周期。这不是巧合：能量守恒 ½mv²+½kx²=E 本身就是椭圆的方程，运动被锁死在这条等能量线上。生态课里兔群的混沌轨道永不重复；弹簧的相轨道永远重复——同一种相图语言，两种极端命运。`, phasePortrait(state)),
    sceneStep(7, "shm-universality", "为什么它无处不在", `物理学家痴迷这个模型的真正原因：任何光滑势能的稳定平衡点附近，曲线放大了看都近似一条抛物线 ½k_eff·x²——图中那条弯曲的“真实势能”，在谷底与抛物线几乎不分彼此。所以单摆的小摆动、分子键的振动、桥面的微晃、LC 电路里的电荷振荡，小振幅时全都简谐。SHM 不是某一种装置，而是“稳定平衡附近”的通用近似。`, potentialWellPlot(
      state,
      "谷底附近两条曲线重合：这就是简谐近似的适用区。",
    )),
    sceneStep(8, "shm-boundary", "边界与沙盘", `近似当然有边界：振幅一大，弹簧被拉出线性区、单摆的 sinθ≈θ 失效，周期开始随振幅漂移；加上摩擦，振幅按指数衰减——图中的对照曲线正在把能量一截一截漏掉；再加周期性外力，还会出现共振。沙盘：A、k、m 都归你——把 m 调成四倍验证周期翻倍，把 k 调成四倍验证周期减半；而 A 无论怎么拖，理想模型的节拍纹丝不动。`, displacementPlot(state, {
      damped: true,
      periods: 3,
      marker: period,
      caption: "理想余弦与阻尼衰减对照：边界之外，模型开始失真。",
      formula: String.raw`x(t)=Ae^{-t/\tau}\cos(\omega t)\ \text{（有阻尼）}`,
    })),
  ];
  return playbook(
    "physics",
    "弹簧简谐振动 · 等时性与能量的椭圆",
    "从胡克字谜到相图椭圆：余弦解验证、与振幅无关的周期、能量交换与简谐近似的边界。",
    "physics_spring_shm",
    steps,
    [
      { id: "A", label: "振幅 A", value: fixed(amplitude), description: "0.2 到 1.2 m；周期与它无关" },
      { id: "k", label: "劲度系数 k", value: fixed(stiffness), description: "1 到 16 N/m；k 翻四倍周期减半" },
      { id: "m", label: "质量 m", value: fixed(mass), description: "0.25 到 4 kg；m 翻四倍周期翻倍" },
    ],
  );
}

export const SPRING_SHM_GOLD_TEMPLATE: GoldTemplateManifest = standaloneCase({
  caseId: "spring-shm",
  archetypeId: "physics.oscillation.spring-shm",
  subject: "high_school_physics",
  domain: "oscillation",
  topic: "简谐振动",
  title: "弹簧简谐振动 · 等时性与能量的椭圆",
  description: "胡克字谜、余弦解验证、与振幅无关的周期、能量交换与相图椭圆",
  prompt: "讲解质量 m=1 kg、劲度系数 k=4 N/m 的弹簧振子：从胡克定律 F=−kx 与牛顿第二定律得到 a=−(k/m)x，猜验 x(t)=A·cos(ωt) 并给出 ω²=k/m，说明周期 T=2π√(m/k) 与振幅无关，画出势能与动能的交换、相平面上的能量椭圆，最后讨论小振幅近似的普适性与阻尼边界。",
  defaults: { A: 0.5, k: 4, m: 1 },
  controls: [
    { id: "A", kind: "range", label: "振幅 A", description: "拖动验证周期与 A 无关", min: 0.2, max: 1.2, step: 0.05, resetPlayback: false, steps: ["shm-hooke", "shm-restoring", "shm-cosine", "shm-isochronism", "shm-energy", "shm-phase", "shm-boundary"] },
    { id: "k", kind: "range", label: "劲度系数 k", description: "k 翻四倍，周期减半", min: 1, max: 16, step: 0.5, resetPlayback: false },
    { id: "m", kind: "range", label: "质量 m", description: "m 翻四倍，周期翻倍", min: 0.25, max: 4, step: 0.25, resetPlayback: false, steps: ["shm-newton", "shm-cosine", "shm-isochronism", "shm-energy", "shm-phase", "shm-boundary"] },
  ],
  requiredCapabilities: ["physics_force_scene", "math_plot", "phase_portrait_scene", "expression_curve"],
  handsOn: ["shm-isochronism", "shm-phase"],
  expectedFacts: [
    { id: "shm-hooke-law", description: "胡克定律 F=−kx 与恢复力方向", anyOf: ["F=−kx", "胡克", "Ut tensio"] },
    { id: "shm-ode", description: "牛顿第二定律给出 a=−(k/m)x", anyOf: ["ma=−kx", "k/m", "方向相反"] },
    { id: "shm-cosine-solution", description: "x(t)=A·cos(ωt) 满足方程当且仅当 ω²=k/m", anyOf: ["cos", "ω²=k/m", "严丝合缝"] },
    { id: "shm-isochronism", description: "周期 T=2π√(m/k) 与振幅无关", anyOf: ["2π", "与振幅无关", "没有振幅 A"] },
    { id: "shm-energy-conservation", description: "总能量 ½kA² 守恒，端点全势能、中点全动能", anyOf: ["½kA²", "kA²", "守恒"] },
    { id: "shm-phase-ellipse", description: "相平面轨道是半轴 A 与 Aω 的椭圆", anyOf: ["椭圆", "相图", "Aω"] },
    { id: "shm-universality", description: "光滑势能的稳定平衡附近皆近似简谐", anyOf: ["抛物线", "平衡点附近", "通用近似"] },
  ],
  visualInvariants: [{
    id: "shm-visual",
    description: "弹簧线圈、恢复力向量、位移曲线、两条能量曲线与相图椭圆保持语义身份",
    requiredSemanticRoles: ["spring_coil", "force", "displacement_curve", "potential_energy", "kinetic_energy", "amplitude_bound"],
    requiredStateFields: ["objects", "vectors", "springs", "curves", "trajectories", "equilibria"],
  }],
  objective: "由 F=−kx 与牛顿第二定律验证余弦解，理解与振幅无关的周期、能量交换与相图椭圆，并识别简谐近似的适用边界。",
  minimumSteps: 9,
  builder: buildSpringShmGoldPlaybook,
  mechanism: "a=−(k/m)x 的负反馈没有延迟且线性：解只能是正余弦组合，角频率被 ω²=k/m 唯一锁定。",
  mechanismByStep: {
    "shm-hooke": "在弹性限度内，弹簧微观形变正比于宏观伸长，宏观上便是 F=−kx；负号表示力总与位移反向，这一个符号决定了后面的一切。",
    "shm-restoring": "平衡点处 F=0 但 v 最大，端点处 v=0 但 |F| 最大——力与速度的极值错开半拍，往返因此永不停在中途。",
    "shm-newton": "把 F=−kx 代入 ma=F 得 a=−(k/m)x：状态（位置）直接决定状态变化率（加速度），这是一条二阶微分方程，不是匀加速公式能覆盖的。",
    "shm-cosine": "cos 求导两次回到自身乘上 −ω²，恰好与 a=−(k/m)x 同构；系数配平要求 ω²=k/m，初始条件 x(0)=A、v(0)=0 再把解唯一钉死。",
    "shm-isochronism": "A 在方程 a=−ω²x 两侧同倍出现，约掉了：振幅只放大位移与速度，不改变节拍。线性是等时性的全部来源。",
    "shm-energy": "Ep=½kx²=½kA²cos²(ωt)，Ek=½mv²=½kA²sin²(ωt)，相加得 ½kA²(cos²+sin²)=½kA²——守恒由恒等式保证，与时刻无关。",
    "shm-phase": "把 cos²+sin²=1 用 x/A 与 v/(Aω) 改写，就是椭圆方程 x²/A²+v²/(Aω)²=1：每条等能线是一个椭圆，能量越大椭圆越大。",
    "shm-universality": "在稳定平衡点 V′(0)=0，泰勒展开首个非零项是 ½V″(0)x²：任何光滑势能的谷底都自带一个等效 k=V″(0)，简谐因此成为普适近似。",
    "shm-boundary": "线性化只在小位移内成立：高阶项 x³、x⁵ 随振幅增大浮出水面，周期开始依赖 A；阻尼项 −bv 让能量按指数流失，理想椭圆螺旋向内塌缩。",
  },
  transfer: "先把 A 从 0.2 拖到 1.2，确认过零节拍不动；再把 m 调到 4 kg 验证周期翻倍、把 k 调到 16 N/m 验证周期减半；最后在相图里确认椭圆半轴恰是 A 与 Aω。",
  posterStepIndex: 6,
});
