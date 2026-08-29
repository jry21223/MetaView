import type {
  MathFormulaSnapshot,
  MathPlotSnapshot,
  MetaStep,
  PhysicsForceSceneSnapshot,
  PlaybookScript,
} from "../../../../features/playbook/engine/types";
import type { TemplatePreviewParams } from "../../templatePreviewCases";
import type { GoldTemplateManifest } from "../manifest";
import {
  fixed,
  playbook,
  sceneStep,
  standaloneCase,
} from "../standaloneCaseHelpers";
import {
  PROJECTILE_DEFAULTS,
  PROJECTILE_LIMITS,
  projectileAtFraction,
  projectileSceneBaseline,
  projectileScenePoint,
  projectileSceneTrajectory,
  PROJECTILE_SCENE_WIDTH,
  solveProjectile,
  type ProjectileState,
} from "./projectileMotionDomain";

/**
 * 抛体运动 · 两颗子弹与一条抛物线。
 *
 * The MythBusters "fired vs. dropped bullet" episode (2009) provides the
 * data-first opening: both bullets hit the ground within 39 ms of each other.
 * The lesson decomposes the flight into two independent one-dimensional
 * motions, reassembles the trajectory through the shared clock, and closes on
 * Galileo's 1638 parabola proof and the Apollo 14 moon boundary.
 */

function expressionNumber(value: number): string {
  return Number(value.toPrecision(12)).toString();
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
      ? "竖直发射时 vₓ=0，水平位置始终不变。"
      : `直线斜率恒为 vₓ=${fixed(state.vx)} m/s；g 不在这条方程里。`,
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
      ? "当前边界没有正的腾空时间；公式仍给出随后向下的速度趋势。"
      : `斜率恒为 −g；在 t=${fixed(state.apexTime)} s 穿过 vᵧ=0。`,
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
      : `开口向下；顶点 H=${fixed(state.maxHeight)} m，两个零点是 0 与 ${fixed(state.flightTime)} s。`,
  };
}

const SCENE_GROUND_Y = 78;

interface PhysicsSnapshotOptions {
  showResultant?: boolean;
  showComponents?: boolean;
  showGravity?: boolean;
  /** Equal-time strobe dots along the trajectory (the shared-clock visual). */
  showTimeSamples?: boolean;
  /** Apex and landing marks with their measured values. */
  showKeyMarks?: boolean;
  /** Hide the generic body label when key marks already carry the numbers. */
  hideBodyLabel?: boolean;
}

function timeSamplePoints(state: ProjectileState): NonNullable<PhysicsForceSceneSnapshot["points"]> {
  if (state.flightTime <= 0) return [];
  return Array.from({ length: 7 }, (_, index) => {
    const [x, y] = projectileScenePoint(state, (index + 1) / 8);
    return { x, y, emphasis: "secondary", semantic_role: "time_sample" };
  });
}

function keyMarkPoints(state: ProjectileState): NonNullable<PhysicsForceSceneSnapshot["points"]> {
  if (state.flightTime <= 0) return [];
  const [apexX, apexY] = projectileScenePoint(state, 0.5);
  const [landX, landY] = projectileScenePoint(state, 1);
  return [
    { x: apexX, y: apexY, label: `H=${fixed(state.maxHeight)} m`, emphasis: "secondary", semantic_role: "apex_mark" },
    // The range number lives below the ground line (see keyMarkAnnotations):
    // the landing corner is already busy with the velocity vectors.
    { x: landX, y: landY, emphasis: "accent", semantic_role: "landing_mark" },
  ];
}

function keyMarkAnnotations(state: ProjectileState): NonNullable<PhysicsForceSceneSnapshot["annotations"]> {
  if (state.flightTime <= 0) return [];
  const [landX] = projectileScenePoint(state, 1);
  // Nudged left of the landing point so the descending velocity arrows
  // don't run through the number.
  return [{
    x: Math.min(landX - 6.5, PROJECTILE_SCENE_WIDTH - 16),
    y: projectileSceneBaseline(state) + 5.4,
    text: `R=${fixed(state.range)} m`,
    semantic_role: "range_note",
  }];
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
      // With both components on screen their magnitudes already tell the
      // story; a third number at almost the same tip only collides.
      magnitude: options.showComponents ? null : `${fixed(point.speed)} m/s`,
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
      label: options.hideBodyLabel ? null : "质点",
      x,
      y,
      radius: 2.8,
    }],
    vectors,
    scene_width: PROJECTILE_SCENE_WIDTH,
    trajectory: projectileSceneTrajectory(state),
    // The scene trajectory is sampled uniformly in time, so the cruising
    // tracer replays the real motion: constant horizontal pace, accelerating
    // vertical drop.
    flow_tracer: true,
    points: [
      ...(options.showTimeSamples ? timeSamplePoints(state) : []),
      ...(options.showKeyMarks ? keyMarkPoints(state) : []),
    ],
    annotations: options.showKeyMarks ? keyMarkAnnotations(state) : [],
    ground_y: projectileSceneBaseline(state),
    formula_latex: formulaLatex,
    caption,
  };
}

/**
 * The pinned two-bullet experiment: one bullet fired horizontally, one dropped
 * at the same instant from the same height, strobed at equal time intervals.
 * Parameter-independent — this picture IS the opening hook, not the current
 * launch; heights agree pairwise because y(t) never sees the horizontal speed.
 */
function twinBulletScene(): PhysicsForceSceneSnapshot {
  const startX = 34;
  const topY = 30;
  const drop = SCENE_GROUND_Y - topY;
  const horizontalReach = 112;
  const fraction = (index: number) => index / 6;
  const shotPoints: Array<[number, number]> = Array.from({ length: 25 }, (_, index) => {
    const f = index / 24;
    return [startX + horizontalReach * f, topY + drop * f * f];
  });
  // Same time sampling as the shot so the shared-clock tracers fall in sync:
  // equal index = equal t, and both dots sit at the same height every frame.
  const dropPoints: Array<[number, number]> = Array.from({ length: 25 }, (_, index) => {
    const f = index / 24;
    return [startX, topY + drop * f * f];
  });
  const strobe: NonNullable<PhysicsForceSceneSnapshot["points"]> = [];
  for (let index = 1; index <= 5; index += 1) {
    const f = fraction(index);
    const y = topY + drop * f * f;
    const paired = index === 4;
    strobe.push(
      { x: startX, y, emphasis: paired ? "accent" : "secondary", semantic_role: "time_sample_twin" },
      { x: startX + horizontalReach * f, y, emphasis: paired ? "accent" : "primary", semantic_role: "time_sample" },
    );
  }
  const linkedY = topY + drop * fraction(4) ** 2;
  // Bodies ride the second strobe instant so their labels separate cleanly.
  const bodyF = fraction(2);
  const bodyY = topY + drop * bodyF * bodyF;
  return {
    kind: "physics_force_scene",
    pack_id: "physics-basic",
    objects: [
      { id: "dropped-bullet", label: "自由落下", x: startX, y: bodyY, radius: 2.2 },
      { id: "fired-bullet", label: "水平射出", x: startX + horizontalReach * bodyF, y: bodyY, radius: 2.2 },
    ],
    vectors: [
      { id: "muzzle-velocity", target: "fired-bullet", semantic_role: "velocity", dx: 12, dy: 0, label: "v₀" },
      { id: "shared-gravity", target: "dropped-bullet", semantic_role: "acceleration", dx: 0, dy: 9, label: "g" },
    ],
    trajectories: [
      { id: "fired-path", points: shotPoints, emphasis: "primary", semantic_role: "fired_trajectory", flow: true },
      { id: "dropped-path", points: dropPoints, emphasis: "secondary", semantic_role: "drop_line", flow: true },
      {
        id: "equal-height-link",
        points: [[startX, linkedY], [startX + horizontalReach * fraction(4), linkedY]],
        emphasis: "accent",
        semantic_role: "equal_height_link",
      },
    ],
    points: strobe,
    annotations: [
      { x: startX + 40, y: linkedY - 2.8, text: "同一时刻 · 同一高度", semantic_role: "equal_height_note" },
    ],
    ground_y: SCENE_GROUND_Y,
    scene_width: PROJECTILE_SCENE_WIDTH,
    // The physics formula card renders plain text, not KaTeX — keep it unicode.
    formula_latex: "t落 = √(2h/g)",
    caption: "等时刻频闪：两条轨迹的下落进度每一刻都相同——落地时间里没有水平速度的位置。",
  };
}

/**
 * Space-domain overlay of the current launch and its complementary angle,
 * drawn to one shared scale so the equal range is visually honest.
 */
function complementaryScene(state: ProjectileState): PhysicsForceSceneSnapshot {
  const complementary = solveProjectile({
    speed: state.speed,
    angle: 90 - state.angle,
    gravity: state.gravity,
  });
  const sameAngle = Math.abs(state.angle - 45) < 0.5;
  const maxHeight = Math.max(state.maxHeight, complementary.maxHeight);
  // Same usable band as the single-launch layout, sized to the taller twin.
  const scale = Math.min(
    (PROJECTILE_SCENE_WIDTH - 20) / Math.max(1e-9, state.range),
    54 / Math.max(1e-9, maxHeight),
  );
  const groundY = 80 - (54 - maxHeight * scale) / 2;
  const startX = PROJECTILE_SCENE_WIDTH / 2 - (state.range * scale) / 2;
  const mapTrajectory = (which: ProjectileState): Array<[number, number]> =>
    Array.from({ length: 33 }, (_, index) => {
      const t = which.flightTime * (index / 32);
      const x = which.vx * t;
      const y = Math.max(0, which.vy0 * t - 0.5 * which.gravity * t ** 2);
      return [startX + x * scale, groundY - y * scale];
    });
  const trajectories: NonNullable<PhysicsForceSceneSnapshot["trajectories"]> = [
    {
      id: "current-angle",
      points: mapTrajectory(state),
      label: `θ=${fixed(state.angle)}°`,
      emphasis: "primary",
      semantic_role: "current_trajectory",
    },
  ];
  if (!sameAngle) {
    trajectories.push({
      id: "complementary-angle",
      points: mapTrajectory(complementary),
      label: `${fixed(90 - state.angle)}°`,
      emphasis: "secondary",
      semantic_role: "complementary_trajectory",
    });
  }
  return {
    kind: "physics_force_scene",
    pack_id: "physics-basic",
    objects: [],
    vectors: [],
    trajectories,
    scene_width: PROJECTILE_SCENE_WIDTH,
    points: [{
      x: startX + state.range * scale,
      y: groundY,
      emphasis: "accent",
      semantic_role: "landing_mark",
    }],
    annotations: [{
      x: Math.min(startX + state.range * scale, PROJECTILE_SCENE_WIDTH - 12),
      y: groundY + 5.4,
      text: sameAngle ? `R=${fixed(state.range)} m` : "同一落点",
      semantic_role: "range_note",
    }],
    ground_y: groundY,
    formula_latex: "y = x·tanθ − gx²/(2vₓ²)",
    caption: sameAngle
      ? "θ=45° 是互补对称轴：这条抛物线就是同一 v₀ 能达到的最远弹道。"
      : "同一坐标系、同一比例：两条不同的抛物线，落在同一个点上。",
  };
}

function summaryFormula(state: ProjectileState): MathFormulaSnapshot {
  const formula = state.vx === 0
    ? String.raw`\begin{aligned}x(t)&=0\\y(t)&=${fixed(state.vy0)}t-\frac12(${fixed(state.gravity)})t^2\\\text{轨迹}&:\ x=0\end{aligned}`
    : String.raw`\begin{aligned}x(t)&=${fixed(state.vx)}t\\y(t)&=${fixed(state.vy0)}t-\frac12(${fixed(state.gravity)})t^2\\y(x)&=x\tan ${fixed(state.angle)}^\circ-\frac{${fixed(state.gravity)}}{2(${fixed(state.vx)})^2}x^2\end{aligned}`;
  return {
    kind: "math_formula",
    formula_latex: formula,
    caption: "同一个时间 t 连接两条分运动；消去 t 后，轨迹显形为抛物线。",
    highlights: ["y(x)"],
    annotations: [
      `飞行时间 T=${fixed(state.flightTime)} s`,
      `最高点 H=${fixed(state.maxHeight)} m`,
      `水平射程 R=${fixed(state.range)} m`,
    ],
  };
}

const BOUNDARY_EXPLANATION: Record<ProjectileState["boundaryCase"], string> = {
  regular: "当前参数是常规斜抛：T、H、R 都由同一组分量算出。",
  stationary: "v₀=0 时质点不离开原点，T=H=R=0。",
  "ground-tangent": "θ=0° 且从地面发射时，理想模型没有正的腾空时间，T=H=R=0。",
  "vertical-launch": "θ=90° 时 vₓ=0，因此 R=0；竖直上抛过程仍完整存在。",
};

export function buildProjectileMotionPlaybook(params: TemplatePreviewParams): PlaybookScript {
  const state = solveProjectile({
    speed: params.speed,
    angle: params.angle,
    gravity: params.gravity,
  });
  const grounded = state.flightTime === 0;
  const moonScale = state.gravity / 1.62;
  const midPoint = projectileAtFraction(state, 0.35);
  const boundaryNote = state.boundaryCase === "regular" ? "" : `注意：${BOUNDARY_EXPLANATION[state.boundaryCase]}`;
  const steps: MetaStep[] = [
    sceneStep(0, "projectile-two-bullets", "两颗子弹：一个反直觉的实验", `2009 年，《流言终结者》搭起一间长棚：同一高度上，一颗子弹水平射出，另一颗同时松手自由落下。实测两者落地只差 0.039 秒——在测量误差内同时着地。图上把两颗子弹按相等的时间间隔打点：请沿任何一条水平虚线看过去，每一个时刻，它们都在同一高度。几百米每秒的水平速度，对“何时落地”寸功未立。这门课要解释为什么，并把它推广到任意角度的抛射。当前发射设定：v₀=${fixed(state.speed)} m/s，θ=${fixed(state.angle)}°。${boundaryNote}`, twinBulletScene()),
    sceneStep(1, "projectile-decompose", "分解：重力只碰竖直方向", `把初速度按两个方向拆开：vₓ=v₀cosθ=${fixed(state.vx)} m/s，vᵧ₀=v₀sinθ=${fixed(state.vy0)} m/s。忽略空气阻力后，唯一的力是竖直向下的重力——水平方向没有任何力来改变 vₓ；竖直方向独自做匀变速。两个方向唯一共享的东西，是同一只时钟 t。子弹之谜的机关就在这里：水平速度再大，也进不了竖直方向的方程。`, physicsSnapshot(
      state,
      0,
      "水平与竖直各自守各自的规律，只共享时间。",
      "vₓ=v₀cosθ  vᵧ₀=v₀sinθ",
      { showComponents: true, showGravity: true },
    )),
    sceneStep(2, "projectile-horizontal", "水平方向：一条不弯的直线", state.vx === 0
      ? "竖直发射使水平分量为零，x(t) 恒等于零：直线退化成横轴，这正是 θ=90° 的边界情形。"
      : `水平方向没有加速度，vₓ=${fixed(state.vx)} m/s 从头到尾不变，位移 x(t)=${fixed(state.vx)}t 是一条过原点的直线，斜率就是 vₓ。注意方程里没有 g——把重力加速度拖大拖小，这条线纹丝不动，“独立”二字的直接证据。`, horizontalPositionPlot(state)),
    sceneStep(3, "projectile-vertical-velocity", "竖直方向：速度匀速流失", grounded
      ? "当前边界没有正的腾空区间；但 vᵧ(t)=vᵧ₀−gt 仍然成立：重力让竖直速度以恒定速率减小。"
      : `竖直速度 vᵧ(t)=vᵧ₀−gt：每过一秒减少 ${fixed(state.gravity)} m/s，在 t=${fixed(state.apexTime)} s 穿过零，随后转为向下。子弹之谜在这里解开一半：这条方程里只有 vᵧ₀ 和 g，水平速度从未出场。`, verticalVelocityPlot(state)),
    sceneStep(4, "projectile-vertical-position", "竖直位移：开口向下的抛物线", grounded
      ? "从地面水平擦出或静止时，y(t) 没有位于地面上方的正时间区间；模型如实给出 T=H=0。"
      : `对 vᵧ(t) 累积——上一门数学课刚讲过：速度曲线下的面积就是位移——得 y(t)=vᵧ₀t−gt²/2，开口向下的二次曲线，在 t=${fixed(state.apexTime)} s 到达最高点 H=${fixed(state.maxHeight)} m。谜底揭晓：两颗子弹的 y(t) 是同一条方程，里面没有水平速度，它们必然同时落地。`, verticalPositionPlot(state)),
    sceneStep(5, "projectile-compose", "合成：同一只时钟配出轨迹", grounded
      ? "常规情形下，把同一时刻的 x(t) 与 y(t) 配成平面上的点，点的连线才是真实轨迹；当前边界没有空中段可合成。"
      : `把同一个 t 的 x(t) 与 y(t) 配成平面上的一个点，让 t 流动，这串点连成的才是真实轨迹。图上的小圆点是等时间隔的采样：水平间距处处相等（匀速），竖直间距先疏后密再变疏（匀变速）——一串点同时说出两条定律。此刻 t=${fixed(state.flightTime * 0.35)} s，质点在 (${fixed(midPoint.x)}, ${fixed(midPoint.y)}) m 处；速度方向恰沿轨迹切线。`, physicsSnapshot(
      state,
      0.35,
      "等时采样点：水平等距、竖直变距；速度沿轨迹切线。",
      "P(t) = (x(t), y(t))",
      { showResultant: true, showComponents: true, showGravity: true, showTimeSamples: true, hideBodyLabel: true },
    )),
    sceneStep(6, "projectile-apex", "最高点：速度并不为零", grounded
      ? "当前边界没有离地后的最高点；最大高度为零。"
      : `t=${fixed(state.apexTime)} s 到达最高点。这里 vᵧ=0，但速度不为零——vₓ=${fixed(state.vx)} m/s 还在。“最高点速度为零”是抛体最常见的误区：真正归零的只是竖直分量，总速度此刻取全程最小值 |vₓ|。`, physicsSnapshot(
      state,
      0.5,
      `最高点只是竖直方向的转折：H=${fixed(state.maxHeight)} m，水平速度仍在。`,
      `vᵧ=0 · H=${fixed(state.maxHeight)} m`,
      { showComponents: true, showGravity: true },
    )),
    sceneStep(7, "projectile-landing", "落地与射程：sin2θ 说了算", grounded
      ? "T=0 表示这组同高起落参数没有形成空中飞行段；把 θ 或 v₀ 拖离边界即可恢复常规斜抛。"
      : `令 y(T)=0 取非零根：T=2vᵧ₀/g=${fixed(state.flightTime)} s；代回 x(T) 得射程 R=vₓT=v₀²sin2θ/g=${fixed(state.range)} m——图上顶点与落点都标出了实测值。sin2θ 一次说出两件事：θ=45° 时 sin2θ=1，同一 v₀ 的射程封顶；θ 与 90°−θ 的 sin2θ 相同，30° 与 60° 打到同一个落点。把 θ 拖过 45°，看 R 先涨后跌。落地时 vᵧ=−vᵧ₀=${fixed(-state.vy0)} m/s，与出发时大小相等、方向相反。`, physicsSnapshot(
      state,
      1,
      "同高起落的对称性：落地竖直速度与初始竖直速度互为镜像。",
      `T=${fixed(state.flightTime)} s · R=${fixed(state.range)} m`,
      { showResultant: true, showComponents: true, showGravity: true, showKeyMarks: true, hideBodyLabel: true },
    )),
    sceneStep(8, "projectile-parabola", "消去时钟：轨迹是抛物线", state.vx === 0 || grounded
      ? "vₓ=0 或没有腾空段时不能用 t=x/vₓ 消元——除数为零；轨迹退化为竖直线或一个点，必须单独讨论。这正是代数边界与物理边界互相印证的地方。"
      : `时间是两条分运动方程的暗线。用 t=x/vₓ 把它抹掉：y=x·tanθ−g·x²/(2vₓ²)——关于 x 的二次函数，开口向下。1638 年，伽利略在《两门新科学》“第四天”里第一次证明了这一点。${Math.abs(state.angle - 45) < 0.5
        ? "当前 θ=45° 恰好是互补对称轴：它与自己的互补角是同一条曲线，也是同一 v₀ 所能触及的最远弹道。"
        : `图上同时画出 θ=${fixed(state.angle)}° 与互补角 ${fixed(90 - state.angle)}°：两条高矮不同的抛物线，落在同一个点上——这就是 sin2θ 相等的几何证词。`}`, state.vx === 0 || grounded
      ? summaryFormula(state)
      : complementaryScene(state)),
    sceneStep(9, "projectile-moon", "边界与月球：模型的适用范围", `以上全部依赖三个前提：同一水平面起落、g 恒定、忽略空气阻力。羽毛球杀球的下落段明显更陡——空气阻力让真实轨迹偏离抛物线；而在没有大气的月球上，模型反而更准。${moonScale > 1.05
      ? `月球 g=1.62 m/s²，约为当前 g 的 1/${fixed(moonScale, 1)}：T、H、R 同倍放大 ${fixed(moonScale, 1)} 倍。1971 年阿波罗 14 号的谢泼德在月面打出的那颗高尔夫球，就是这条公式的实景演示。把 g 拖到 1.62 亲自试试；`
      : `当前 g=${fixed(state.gravity)} m/s²——你已经站在月球弹道附近：同一组 v₀、θ 下，T、H、R 都是地球值的约 6 倍。1971 年阿波罗 14 号的谢泼德在月面打出的那颗高尔夫球，就是这条公式的实景演示。`}沙盘里 v₀、θ、g 都归你。${boundaryNote}`, physicsSnapshot(
      state,
      grounded ? 0 : 0.65,
      `${BOUNDARY_EXPLANATION[state.boundaryCase]}模型前提：同高起落、g 恒定、无空气阻力。`,
      `T=${fixed(state.flightTime)} s · H=${fixed(state.maxHeight)} m · R=${fixed(state.range)} m`,
      { showResultant: true, showGravity: true },
    )),
  ];

  return playbook(
    "physics",
    "抛体运动 · 两颗子弹与一条抛物线",
    "从同落实验出发拆解两条独立分运动，用同一只时钟合成轨迹，验证最高点、射程与模型边界。",
    "projectile_motion_teacher_case",
    steps,
    [
      { id: "speed", label: "初速度 v₀", value: fixed(state.speed), description: "单位 m/s；允许 0 检查静止边界" },
      { id: "angle", label: "抛射角 θ", value: fixed(state.angle), description: "45° 射程封顶；互补角同射程" },
      { id: "gravity", label: "重力加速度 g", value: fixed(state.gravity), description: "拖到 1.62 进入月球弹道" },
    ],
    {
      speed: [fixed(state.speed)],
      angle: [fixed(state.angle)],
      gravity: [fixed(state.gravity)],
      boundary_case: [state.boundaryCase],
    },
  );
}

export const PROJECTILE_MOTION_GOLD_TEMPLATE: GoldTemplateManifest = standaloneCase({
  caseId: "projectile",
  archetypeId: "physics.projectile.motion-decomposition",
  subject: "high_school_physics",
  domain: "projectile_motion",
  topic: "抛体运动",
  title: "抛体运动 · 两颗子弹与一条抛物线",
  description: "同落实验、分运动独立性、sin2θ 射程、伽利略 1638 与月球弹道边界",
  prompt: "从“水平射出与自由落下的子弹同时落地”的实验出发讲解抛体运动：分解初速度并说明独立性，分别建立 x(t)、vᵧ(t)、y(t)，用同一时钟合成轨迹，检查最高点误区、T 与 R=v₀²sin2θ/g、θ=45° 最大射程与互补角，消去时间得到抛物线，并讨论空气阻力与月球 g=1.62 的模型边界。",
  defaults: { ...PROJECTILE_DEFAULTS },
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
      description: "拖过 45° 看射程先涨后跌",
      min: PROJECTILE_LIMITS.angle.min,
      max: PROJECTILE_LIMITS.angle.max,
      step: 1,
      resetPlayback: false,
    },
    {
      id: "gravity",
      kind: "range",
      label: "重力加速度 g",
      description: "m/s²；1.62 即月球",
      min: PROJECTILE_LIMITS.gravity.min,
      max: PROJECTILE_LIMITS.gravity.max,
      step: 0.1,
      resetPlayback: false,
    },
  ],
  requiredCapabilities: [
    "physics_force_scene",
    "velocity_decomposition",
    "math_plot",
    "trajectory_composition",
    "multi_trajectory_overlay",
    "equal_time_strobe",
    "boundary_verification",
  ],
  handsOn: ["projectile-landing", "projectile-moon"],
  expectedFacts: [
    {
      id: "projectile.horizontal-constant",
      description: "水平速度恒定，水平位移随时间线性增长",
      anyOf: ["v_x=v_0 cos(theta)", "x(t)=v_x t", "vₓ 从头到尾不变"],
      tolerance: 0.01,
    },
    {
      id: "projectile.vertical-kinematics",
      description: "竖直速度与位移由同一个向下的 g 决定",
      anyOf: ["v_y(t)=v_y0-g t", "y(t)=v_y0 t-1/2 g t^2", "vᵧ(t)=vᵧ₀−gt"],
      tolerance: 0.01,
    },
    {
      id: "projectile.key-moments",
      description: "最高点与同高落地由竖直方程推出",
      anyOf: ["v_y(t_apex)=0", "y(T)=0", "R=v_x T"],
      tolerance: 0.01,
    },
    {
      id: "projectile.range-angle",
      description: "R=v₀²sin2θ/g 在 45° 封顶，互补角射程相同",
      anyOf: ["sin2θ", "45°", "90°−θ"],
    },
    {
      id: "projectile.independence",
      description: "水平速度不进入竖直方程，两颗子弹同时落地",
      anyOf: ["同时着地", "0.039", "互不打扰"],
    },
    {
      id: "projectile.boundaries",
      description: "静止、贴地、竖直发射的退化边界得到显式处理",
      anyOf: ["v0=0 => T=H=R=0", "θ=90° 时 vₓ=0", "T=H=R=0"],
    },
  ],
  visualInvariants: [{
    id: "projectile.causal-visual-chain",
    description: "速度分量、重力、双弹频闪、等时采样、落点标注与轨迹在整节课中保持语义身份",
    requiredSemanticRoles: [
      "velocity",
      "acceleration",
      "horizontal_position",
      "vertical_velocity",
      "vertical_position",
      "drop_line",
      "time_sample",
      "landing_mark",
    ],
    requiredStateFields: ["objects", "vectors", "trajectory", "trajectories", "points", "ground_y", "curves", "formula_latex"],
  }],
  objective: "把一次飞行分解为共享时钟的两条一维运动，合成轨迹并验证最高点、射程规律与模型边界。",
  minimumSteps: 10,
  builder: buildProjectileMotionPlaybook,
  mechanism: "牛顿第二定律按分量独立成立：水平方向无力故匀速，竖直方向恒受 g 故匀变速；两个方向只共享时间。",
  mechanismByStep: {
    "projectile-two-bullets": "频闪打点是证明的骨架：两颗子弹的 y(t)=h−gt²/2 完全相同，所以每一对同时刻的点都落在同一条水平线上。竖直方程里没有 vₓ 的位置；实测的 0.039 s 差来自枪管微小上仰与空气阻力，不是原理偏差。",
    "projectile-decompose": "矢量方程 F=ma 逐分量读：Fₓ=0 ⇒ aₓ=0；Fᵧ=−mg ⇒ aᵧ=−g。分解不是技巧，是分量语言的直译。",
    "projectile-horizontal": "aₓ=0 使 vₓ 成为常数，x(t)=vₓt 因而线性；图线斜率里没有 g，所以改 g 不动它。",
    "projectile-vertical-velocity": "aᵧ=−g 恒定 ⇒ vᵧ 线性递减；令 vᵧ=0 得 t=vᵧ₀/g，这是上升与下降的分水岭。",
    "projectile-vertical-position": "位移是速度的累积：对线性的 vᵧ(t) 积分得到二次的 y(t)；顶点出现在导数为零处。",
    "projectile-compose": "运动的本体是位置矢量 r(t)=(x(t), y(t))；轨迹是把 t 隐藏后的影子，而速度 v=r′(t) 天然指向轨迹切线。",
    "projectile-apex": "vᵧ=0 只是竖直分量的转折；|v|=√(vₓ²+vᵧ²) 在此取最小值 |vₓ|，只有 θ=90° 时才真正为零。",
    "projectile-landing": "y(T)=0 的两根中 t=0 是出发时刻，非零根 T=2vᵧ₀/g；R=vₓT=2v₀²sinθcosθ/g=v₀²sin2θ/g，二倍角公式把“45° 封顶”与“互补角同程”一次说完。",
    "projectile-parabola": "把 t=x/vₓ 代入 y(t)：一次代入、二次落地；系数 −g/(2vₓ²)<0 保证开口向下。互补角把 sinθ 与 cosθ 对调，vₓ 与 vᵧ₀ 互换：曲线更高更慢或更低更快，但乘积 vₓ·T 不变，落点因此相同。vₓ=0 时消元除零，边界必须单列。",
    "projectile-moon": "T=2vᵧ₀/g、H=vᵧ₀²/(2g)、R=v₀²sin2θ/g 都反比于 g：g 缩小到约 1/6，三者同倍放大。月球没有大气，反而消掉了模型最大的误差源。",
  },
  transfer: "把 θ 分别停在 30° 与 60°，验证两次射程相同；把 g 拖到 1.62 看月球弹道同倍放大；最后把 θ 拖到 90°，检查 R=0 的退化边界。",
  posterStepIndex: 7,
});
