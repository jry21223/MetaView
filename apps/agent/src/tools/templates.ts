/**
 * L2 templates — pedagogical macros that compose L1 primitives into typical
 * teaching sequences. The LLM is encouraged to prefer these because they
 * already encode "what to show + suggested narration cadence" for known
 * patterns. None of them emit a vector_field; that's the whole point.
 *
 * Each template takes its semantic arguments, internally calls the same
 * emitter methods L1 tools use, and emits 1+ committed steps. The LLM is
 * still free to call ``set_narration`` after a template returns to refine
 * the wording for the specific lesson it's teaching.
 */

import { Type, type Static, type TSchema } from "@earendil-works/pi-ai";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";

import type { PlaybookEmitter } from "../state/playbookEmitter.js";

export interface TemplateToolDeps {
  emitter: PlaybookEmitter;
}

function toolResult<T>(details: T): AgentToolResult<T> {
  return {
    content: [{ type: "text", text: JSON.stringify(details) }],
    details,
  };
}

function defineTool<S extends TSchema, D>(
  name: string,
  label: string,
  description: string,
  parameters: S,
  execute: (params: Static<S>) => Promise<AgentToolResult<D>>,
): AgentTool<S, D> {
  return {
    name,
    label,
    description,
    parameters,
    execute: async (_toolCallId, params) => execute(params),
  };
}

function makeStepRange(startIndex: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => startIndex + i);
}

export function makeTemplateTools(deps: TemplateToolDeps): AgentTool[] {
  const { emitter } = deps;
  const tools: AgentTool[] = [];

  // ── Algorithm domain ──────────────────────────────────────────────────
  tools.push(
    defineTool(
      "template_array_swap",
      "Template: array swap",
      "Emit a 3-step sequence visualizing an array element swap: " +
        "(1) highlight a[i] and a[j], (2) execute the swap, (3) show the " +
        "result. Use for sorting demos.",
      Type.Object({
        values: Type.Array(Type.String(), { minItems: 2 }),
        i: Type.Integer({ minimum: 0 }),
        j: Type.Integer({ minimum: 0 }),
        start_step_index: Type.Integer({ minimum: 1 }),
      }),
      async (args) => {
        const indices = makeStepRange(args.start_step_index, 3);
        const before = args.values;
        const after = [...before];
        [after[args.i], after[args.j]] = [after[args.j], after[args.i]];

        const highlight: Record<number, "primary" | "secondary" | "accent"> = {
          [args.i]: "primary", [args.j]: "primary",
        };

        emitter.beginStep(indices[0], `比较 a[${args.i}] 和 a[${args.j}]`);
        emitter.addArrayTokens(before, highlight);
        emitter.setNarration([
          `先看 a[${args.i}] = ${before[args.i]} 和 a[${args.j}] = ${before[args.j]}。`,
          `如果它们的顺序不满足排序要求，下一步就要交换。`,
        ]);
        emitter.commitStep();

        emitter.beginStep(indices[1], `执行交换`);
        emitter.addArrayTokens(before, highlight);
        emitter.setNarration([
          `把 a[${args.i}] 和 a[${args.j}] 交换位置。`,
          `这是 sorted-by-bubble/insertion 类算法的核心动作。`,
        ]);
        emitter.commitStep();

        emitter.beginStep(indices[2], `交换之后`);
        emitter.addArrayTokens(after, {
          [args.i]: "accent", [args.j]: "accent",
        });
        emitter.setNarration([
          `交换完成后，数组在这两个位置上的值翻转了。`,
          `数组其它部分保持不变，便于和上一步直观对比。`,
        ]);
        emitter.commitStep();

        return toolResult({ step_indices: indices });
      },
    ) as AgentTool,
  );

  tools.push(
    defineTool(
      "template_array_compare",
      "Template: array compare",
      "Emit a 2-step compare sequence: highlight a[i] and a[j], then state " +
        "the comparison result (lt/gt/eq).",
      Type.Object({
        values: Type.Array(Type.String(), { minItems: 2 }),
        i: Type.Integer({ minimum: 0 }),
        j: Type.Integer({ minimum: 0 }),
        result: Type.Union([
          Type.Literal("lt"),
          Type.Literal("gt"),
          Type.Literal("eq"),
        ]),
        start_step_index: Type.Integer({ minimum: 1 }),
      }),
      async (args) => {
        const indices = makeStepRange(args.start_step_index, 2);
        const high: Record<number, "primary"> = {
          [args.i]: "primary", [args.j]: "primary",
        };
        emitter.beginStep(indices[0], `比较 a[${args.i}] 与 a[${args.j}]`);
        emitter.addArrayTokens(args.values, high);
        emitter.setNarration([
          `我们要确定 a[${args.i}] 和 a[${args.j}] 的相对大小。`,
          `这一步只读不写——下一步再决定要不要动数组。`,
        ]);
        emitter.commitStep();

        const verdictText =
          args.result === "lt" ? `a[${args.i}] < a[${args.j}]，无需交换` :
          args.result === "gt" ? `a[${args.i}] > a[${args.j}]，需要交换` :
          `a[${args.i}] = a[${args.j}]，无需交换`;

        emitter.beginStep(indices[1], `比较结果`);
        emitter.addArrayTokens(args.values, high);
        emitter.setNarration([
          `${verdictText}。`,
          `这告诉我们下一步对数组要不要做改动。`,
          `保持其它索引不变，方便顺着流程往下看。`,
        ]);
        emitter.commitStep();
        return toolResult({ step_indices: indices });
      },
    ) as AgentTool,
  );

  tools.push(
    defineTool(
      "template_pointer_step",
      "Template: pointer step",
      "Single step showing a pointer / index moving from prev_index to " +
        "next_index along an array.",
      Type.Object({
        values: Type.Array(Type.String(), { minItems: 1 }),
        prev_index: Type.Integer({ minimum: -1 }),
        next_index: Type.Integer({ minimum: 0 }),
        label: Type.Optional(Type.String()),
        start_step_index: Type.Integer({ minimum: 1 }),
      }),
      async (args) => {
        emitter.beginStep(args.start_step_index, args.label ?? `指针走到 ${args.next_index}`);
        const emph: Record<number, "primary" | "secondary"> = {
          [args.next_index]: "primary",
        };
        if (args.prev_index >= 0) emph[args.prev_index] = "secondary";
        emitter.addArrayTokens(args.values, emph);
        emitter.setNarration([
          `指针从 ${args.prev_index} 移动到 ${args.next_index}。`,
          `当前关心的位置 a[${args.next_index}] = ${args.values[args.next_index]}。`,
          `这是循环 / 双指针类算法的状态推进。`,
        ]);
        emitter.commitStep();
        return toolResult({ step_indices: [args.start_step_index] });
      },
    ) as AgentTool,
  );

  // ── Math domain ───────────────────────────────────────────────────────
  tools.push(
    defineTool(
      "template_tangent_at",
      "Template: tangent line",
      "One step showing the tangent line of ``y = f(x)`` at ``x = x0`` " +
        "alongside the curve. Internally adds the curve plus a formula.",
      Type.Object({
        base_expression: Type.String({ minLength: 1, description: "f(x) string" }),
        derivative_expression: Type.String({
          minLength: 1,
          description: "f'(x) string — the agent supplies the derivative explicitly",
        }),
        x0: Type.Number(),
        x_min: Type.Number(),
        x_max: Type.Number(),
        start_step_index: Type.Integer({ minimum: 1 }),
      }),
      async (args) => {
        emitter.beginStep(args.start_step_index, `f(x) 在 x = ${args.x0} 的切线`);
        emitter.setAxes(args.x_min, args.x_max);
        emitter.addCurve1D(args.base_expression, "f(x)", "primary", args.x_min, args.x_max);
        emitter.addFormula(
          `f'(${args.x0}) = ${args.derivative_expression}|_{x=${args.x0}}`,
        );
        emitter.setNarration([
          `先画出 f(x) = ${args.base_expression} 的整条曲线。`,
          `在 x = ${args.x0} 处的导数告诉我们这一点的切线斜率。`,
          `切线沿着导数方向延伸，可以看到它在该点和曲线"擦肩而过"。`,
        ]);
        emitter.commitStep();
        return toolResult({ step_indices: [args.start_step_index] });
      },
    ) as AgentTool,
  );

  tools.push(
    defineTool(
      "template_function_transform",
      "Template: function transform",
      "Single step showing a function ``f(x)`` and its transformed version " +
        "(shift / scale on x or y). Exposes the transform parameter as a slider.",
      Type.Object({
        base_expression: Type.String({ minLength: 1 }),
        transformed_expression: Type.String({ minLength: 1 }),
        transform_kind: Type.Union([
          Type.Literal("shift_x"),
          Type.Literal("shift_y"),
          Type.Literal("scale_x"),
          Type.Literal("scale_y"),
        ]),
        param_id: Type.String({ minLength: 1 }),
        param_initial: Type.Number(),
        param_label: Type.String(),
        x_min: Type.Number(),
        x_max: Type.Number(),
        start_step_index: Type.Integer({ minimum: 1 }),
      }),
      async (args) => {
        emitter.beginStep(args.start_step_index, `${args.transform_kind} 变换`);
        emitter.setAxes(args.x_min, args.x_max);
        emitter.addCurve1D(args.base_expression, "原函数", "secondary", args.x_min, args.x_max);
        emitter.addCurve1D(args.transformed_expression, "变换后", "primary", args.x_min, args.x_max);
        emitter.addParameterControl({
          id: args.param_id,
          label: args.param_label,
          value: String(args.param_initial),
          description: `拖动看 ${args.param_id} 改变时曲线如何变化`,
        });
        emitter.setNarration([
          `蓝色虚线是原函数 ${args.base_expression}，作为参考保留。`,
          `紫色实线是 ${args.transformed_expression}，由参数 ${args.param_id} 控制。`,
          `拖动下方的 ${args.param_label} 滑杆看效果。`,
        ]);
        emitter.commitStep();
        return toolResult({ step_indices: [args.start_step_index] });
      },
    ) as AgentTool,
  );

  tools.push(
    defineTool(
      "template_riemann_sum",
      "Template: Riemann sum",
      "Three-step Riemann sum approximation: n=2, n=4, n=8 rectangles under " +
        "y=f(x) on [a, b]. Use to motivate definite integrals.",
      Type.Object({
        expression: Type.String({ minLength: 1 }),
        a: Type.Number(),
        b: Type.Number(),
        start_step_index: Type.Integer({ minimum: 1 }),
      }),
      async (args) => {
        const indices = makeStepRange(args.start_step_index, 3);
        for (let stage = 0; stage < 3; stage++) {
          const n = [2, 4, 8][stage];
          emitter.beginStep(indices[stage], `n = ${n} 个矩形逼近`);
          emitter.setAxes(args.a - 0.5, args.b + 0.5);
          emitter.addCurve1D(args.expression, "f(x)", "primary", args.a - 0.5, args.b + 0.5);
          const step = (args.b - args.a) / n;
          for (let i = 0; i < n; i++) {
            const x0 = args.a + i * step;
            const x1 = x0 + step;
            emitter.addRegion(
              [
                [x0, 0],
                [x1, 0],
                [x1, 0.5],
                [x0, 0.5],
              ],
              `R${i}`,
              "secondary",
            );
          }
          emitter.setNarration([
            stage === 0
              ? `用 ${n} 个矩形粗略覆盖曲线下面积，明显有缺口和溢出。`
              : `把分段数加到 ${n}，每个矩形更窄，逼近也更准。`,
            `每个矩形宽 ${step.toFixed(3)}，高用区间左端点的函数值。`,
            `当 n → ∞，所有矩形面积之和就是定积分。`,
          ]);
          emitter.commitStep();
        }
        return toolResult({ step_indices: indices });
      },
    ) as AgentTool,
  );

  tools.push(
    defineTool(
      "template_parametric_trace",
      "Template: parametric trace",
      "Single step drawing a parametric curve plus several marker points " +
        "at evenly spaced t values along [t_min, t_max]. Useful for showing " +
        "the direction of motion without a vector field.",
      Type.Object({
        expression_x: Type.String({ minLength: 1 }),
        expression_y: Type.String({ minLength: 1 }),
        t_min: Type.Number(),
        t_max: Type.Number(),
        n_markers: Type.Integer({ minimum: 2, maximum: 12 }),
        start_step_index: Type.Integer({ minimum: 1 }),
      }),
      async (args) => {
        emitter.beginStep(args.start_step_index, "参数曲线 + 时间标记");
        emitter.setAxes(-3, 3, -3, 3);
        emitter.addCurveParametric(
          args.expression_x,
          args.expression_y,
          args.t_min,
          args.t_max,
          "轨迹",
          "primary",
        );
        emitter.setNarration([
          `画出 (${args.expression_x}, ${args.expression_y}) 在 t∈[${args.t_min}, ${args.t_max}] 的轨迹。`,
          `沿曲线放 ${args.n_markers} 个间隔相同的时间标记，方向一目了然。`,
          `请用 assert_orientation 校验旋向，然后再决定 narration 用顺/逆时针。`,
        ]);
        emitter.commitStep();
        return toolResult({ step_indices: [args.start_step_index] });
      },
    ) as AgentTool,
  );

  // ── Physics domain ────────────────────────────────────────────────────
  tools.push(
    defineTool(
      "template_force_diagram",
      "Template: force diagram",
      "Single step with a free-body diagram: each force is rendered as a " +
        "labeled arrow from the origin.",
      Type.Object({
        forces: Type.Array(
          Type.Object({
            name: Type.String(),
            magnitude: Type.Number(),
            angle_deg: Type.Number(),
          }),
          { minItems: 1, maxItems: 6 },
        ),
        start_step_index: Type.Integer({ minimum: 1 }),
      }),
      async (args) => {
        emitter.beginStep(args.start_step_index, "受力分析");
        emitter.setAxes(-5, 5, -5, 5, "x", "y");
        for (const f of args.forces) {
          const rad = (f.angle_deg * Math.PI) / 180;
          const dx = f.magnitude * Math.cos(rad);
          const dy = f.magnitude * Math.sin(rad);
          emitter.addArrow(0, 0, dx, dy, `${f.name} = ${f.magnitude}N @ ${f.angle_deg}°`);
        }
        emitter.setNarration([
          `先把所有作用力画到原点，方向由角度决定。`,
          `每根箭头的长度按数值粗略缩放，方便目测合力方向。`,
          `下一步把它们正交分解到 x/y 方向再求合力。`,
        ]);
        emitter.commitStep();
        return toolResult({ step_indices: [args.start_step_index] });
      },
    ) as AgentTool,
  );

  tools.push(
    defineTool(
      "template_projectile_trajectory",
      "Template: projectile",
      "Four-step projectile motion: launch, mid-flight, apex, landing.",
      Type.Object({
        v0: Type.Number({ minimum: 0 }),
        angle_deg: Type.Number(),
        g: Type.Optional(Type.Number({ minimum: 0 })),
        start_step_index: Type.Integer({ minimum: 1 }),
      }),
      async (args) => {
        const indices = makeStepRange(args.start_step_index, 4);
        const g = args.g ?? 9.8;
        const rad = (args.angle_deg * Math.PI) / 180;
        const vx0 = args.v0 * Math.cos(rad);
        const vy0 = args.v0 * Math.sin(rad);
        const range = (2 * vx0 * vy0) / g;
        const apex = (vy0 * vy0) / (2 * g);

        const titles = ["发射时刻", "上升中", "最高点", "落地"];
        const ts = [0, vy0 / g / 2, vy0 / g, (2 * vy0) / g];
        const captions = [
          `初始速度 v0=${args.v0} m/s，仰角 ${args.angle_deg}°；分解成 vx, vy 两个分量。`,
          `重力把 vy 慢慢拉小，水平速度不变。轨迹是抛物线。`,
          `vy = 0 的瞬间到达最高点，高度 ≈ ${apex.toFixed(2)} m。`,
          `再次落到 y = 0 时，水平距离 ≈ ${range.toFixed(2)} m。`,
        ];
        for (let k = 0; k < 4; k++) {
          const t = ts[k];
          const x = vx0 * t;
          const y = vy0 * t - 0.5 * g * t * t;
          emitter.beginStep(indices[k], titles[k]);
          emitter.setAxes(-1, range + 1, -1, apex + 1, "水平距离 (m)", "高度 (m)");
          emitter.addCurveParametric(
            `${vx0}*t`,
            `${vy0}*t - 0.5*${g}*t*t`,
            0,
            (2 * vy0) / g,
            "轨迹",
            "secondary",
          );
          emitter.addPoint(x, y, titles[k], "accent");
          emitter.setNarration([
            captions[k],
            `当前坐标 (${x.toFixed(2)}, ${y.toFixed(2)})。`,
            `下一步看下一时刻的位置和速度。`,
          ]);
          emitter.commitStep();
        }
        return toolResult({ step_indices: indices });
      },
    ) as AgentTool,
  );

  tools.push(
    defineTool(
      "template_shm",
      "Template: simple harmonic motion",
      "Three-step simple harmonic motion: position, velocity, energy curves.",
      Type.Object({
        amplitude: Type.Number({ minimum: 0 }),
        omega: Type.Number({ minimum: 0 }),
        phase: Type.Optional(Type.Number()),
        start_step_index: Type.Integer({ minimum: 1 }),
      }),
      async (args) => {
        const indices = makeStepRange(args.start_step_index, 3);
        const phase = args.phase ?? 0;
        const a = args.amplitude;
        const w = args.omega;
        const exprs = [
          { expr: `${a}*cos(${w}*x + ${phase})`, label: "x(t) 位移", title: "位移随时间" },
          { expr: `-${a * w}*sin(${w}*x + ${phase})`, label: "v(t) 速度", title: "速度随时间" },
          { expr: `0.5*${(a * w) ** 2}*sin(${w}*x + ${phase})^2 + 0.5*${a ** 2}*cos(${w}*x + ${phase})^2`, label: "总能量", title: "动能 + 势能" },
        ];
        for (let i = 0; i < 3; i++) {
          emitter.beginStep(indices[i], exprs[i].title);
          emitter.setAxes(0, (2 * Math.PI) / w * 2, undefined, undefined, "t (s)", exprs[i].label);
          emitter.addCurve1D(exprs[i].expr, exprs[i].label, "primary");
          emitter.setNarration([
            i === 0
              ? `位移 x(t) = A·cos(ωt + φ)，A = ${a}，ω = ${w}。`
              : i === 1
                ? `速度 v(t) = -Aω·sin(ωt + φ)，比位移领先 π/2。`
                : `动能 + 势能在简谐运动中恒等于 ½Aω²，能量守恒。`,
            `这一步只画 ${exprs[i].label}，让你看清楚单一物理量的波形。`,
            `下一步换另一种物理量观察它们的相位关系。`,
          ]);
          emitter.commitStep();
        }
        return toolResult({ step_indices: indices });
      },
    ) as AgentTool,
  );

  // ── Code domain ───────────────────────────────────────────────────────
  tools.push(
    defineTool(
      "template_code_step",
      "Template: code line",
      "Highlight a single source line and the current values of selected " +
        "variables. Use when explaining algorithm execution at line granularity.",
      Type.Object({
        source: Type.String({ minLength: 1 }),
        line_index: Type.Integer({ minimum: 0 }),
        variables: Type.Record(Type.String(), Type.String(), {
          description: "var name -> displayed value",
        }),
        start_step_index: Type.Integer({ minimum: 1 }),
      }),
      async (args) => {
        emitter.beginStep(args.start_step_index, `执行第 ${args.line_index} 行`);
        const lines = args.source.split("\n");
        const focus = lines[args.line_index] ?? "";
        const varList = Object.entries(args.variables)
          .map(([k, v]) => `${k} = ${v}`)
          .join("，");
        emitter.setNarration([
          `这一步执行：${focus.trim()}`,
          `当前变量值：${varList || "（无变化）"}。`,
          `执行后哪些状态会被更新——可以从这一行的赋值或调用判断出来。`,
        ]);
        emitter.commitStep();
        return toolResult({ step_indices: [args.start_step_index] });
      },
    ) as AgentTool,
  );

  return tools;
}
