/**
 * L2 pedagogical templates.
 *
 * Templates create editable drafts and never commit them. All numeric geometry
 * is derived by the deterministic safe-math kernel instead of being narrated
 * without a corresponding visible object.
 */

import { Type } from "@earendil-works/pi-ai";
import type { AgentTool } from "@earendil-works/pi-agent-core";

import type { PlaybookEmitter } from "../state/playbookEmitter.js";
import {
  derivativeAt,
  evaluateExpression,
  formatNumber,
  sampleParametric,
} from "../state/safeMath.js";
import { defineTool, toolResult } from "./common.js";

export interface TemplateToolDeps {
  emitter: PlaybookEmitter;
}

function stash(emitter: PlaybookEmitter): { draft_id: string; step_index: number } {
  return emitter.stashCurrentDraft();
}

function makeStepRange(startIndex: number, count: number): number[] {
  return Array.from({ length: count }, (_, index) => startIndex + index);
}

export function makeTemplateTools(deps: TemplateToolDeps): AgentTool[] {
  const { emitter } = deps;
  const tools: AgentTool[] = [];

  tools.push(
    defineTool(
      "template_array_swap",
      "Template: array swap",
      "Create three editable drafts: compare two array items, perform the swap, and show the result.",
      Type.Object({
        values: Type.Array(Type.String(), { minItems: 2 }),
        i: Type.Integer({ minimum: 0 }),
        j: Type.Integer({ minimum: 0 }),
        start_step_index: Type.Integer({ minimum: 1 }),
      }),
      async (args) => {
        if (args.i >= args.values.length || args.j >= args.values.length) {
          throw new Error("swap indices must be inside values");
        }
        const indices = makeStepRange(args.start_step_index, 3);
        const before = [...args.values];
        const after = [...before];
        [after[args.i], after[args.j]] = [after[args.j], after[args.i]];
        const highlight = { [args.i]: "primary", [args.j]: "primary" } as const;
        const drafts = [];

        emitter.beginStep(indices[0], `比较 a[${args.i}] 和 a[${args.j}]`);
        emitter.addArrayTokens(before, highlight);
        emitter.setNarration([
          `先同时观察 a[${args.i}] = ${before[args.i]} 和 a[${args.j}] = ${before[args.j]}。`,
          "这一步只比较两个位置，不提前改变数组。",
          "比较结果决定下一步是否执行交换。",
        ]);
        drafts.push(stash(emitter));

        emitter.beginStep(indices[1], "执行交换");
        emitter.addArrayTokens(before, highlight);
        emitter.setNarration([
          `现在交换索引 ${args.i} 和 ${args.j} 的值。`,
          "高亮保持不变，让交换前后的对应位置可以直接比较。",
          "数组其他位置不参与本次状态变化。",
        ]);
        drafts.push(stash(emitter));

        emitter.beginStep(indices[2], "交换完成");
        emitter.addArrayTokens(after, { [args.i]: "accent", [args.j]: "accent" });
        emitter.setNarration([
          `交换后两个位置变成 ${after[args.i]} 和 ${after[args.j]}。`,
          "只有目标索引发生变化，其余元素保持原顺序。",
          "这就是排序算法中一次可验证的局部状态转移。",
        ]);
        drafts.push(stash(emitter));
        return toolResult({ draft_ids: drafts.map((draft) => draft.draft_id), step_indices: indices });
      },
    ) as AgentTool,
  );

  tools.push(
    defineTool(
      "template_array_compare",
      "Template: array compare",
      "Create two editable drafts for a read-only comparison and its verdict.",
      Type.Object({
        values: Type.Array(Type.String(), { minItems: 2 }),
        i: Type.Integer({ minimum: 0 }),
        j: Type.Integer({ minimum: 0 }),
        result: Type.Union([Type.Literal("lt"), Type.Literal("gt"), Type.Literal("eq")]),
        start_step_index: Type.Integer({ minimum: 1 }),
      }),
      async (args) => {
        if (args.i >= args.values.length || args.j >= args.values.length) {
          throw new Error("comparison indices must be inside values");
        }
        const indices = makeStepRange(args.start_step_index, 2);
        const emphasis = { [args.i]: "primary", [args.j]: "primary" } as const;
        const drafts = [];
        emitter.beginStep(indices[0], `比较 a[${args.i}] 与 a[${args.j}]`);
        emitter.addArrayTokens(args.values, emphasis);
        emitter.setNarration([
          `比较 a[${args.i}] = ${args.values[args.i]} 与 a[${args.j}] = ${args.values[args.j]}。`,
          "当前步骤只读取数据，因此数组状态保持不变。",
          "下一步根据比较关系给出操作判断。",
        ]);
        drafts.push(stash(emitter));
        const verdict =
          args.result === "lt"
            ? `a[${args.i}] < a[${args.j}]`
            : args.result === "gt"
              ? `a[${args.i}] > a[${args.j}]`
              : `a[${args.i}] = a[${args.j}]`;
        emitter.beginStep(indices[1], "比较结果");
        emitter.addArrayTokens(args.values, emphasis);
        emitter.setNarration([
          `${verdict}。`,
          "这个关系是后续分支或交换操作的直接依据。",
          "因为这一步仍未写入数据，画面中的数组值不发生变化。",
        ]);
        drafts.push(stash(emitter));
        return toolResult({ draft_ids: drafts.map((draft) => draft.draft_id), step_indices: indices });
      },
    ) as AgentTool,
  );

  tools.push(
    defineTool(
      "template_pointer_step",
      "Template: pointer step",
      "Create one editable draft showing a pointer moving to the next array index.",
      Type.Object({
        values: Type.Array(Type.String(), { minItems: 1 }),
        prev_index: Type.Integer({ minimum: -1 }),
        next_index: Type.Integer({ minimum: 0 }),
        label: Type.Optional(Type.String()),
        start_step_index: Type.Integer({ minimum: 1 }),
      }),
      async (args) => {
        if (args.next_index >= args.values.length) throw new Error("next_index is outside values");
        emitter.beginStep(args.start_step_index, args.label ?? `指针移动到 ${args.next_index}`);
        const emphasis: Record<number, "primary" | "secondary"> = {
          [args.next_index]: "primary",
        };
        if (args.prev_index >= 0 && args.prev_index < args.values.length) {
          emphasis[args.prev_index] = "secondary";
        }
        emitter.addArrayTokens(args.values, emphasis);
        emitter.setNarration([
          `指针从 ${args.prev_index} 移动到 ${args.next_index}。`,
          `当前读取 a[${args.next_index}] = ${args.values[args.next_index]}。`,
          "高亮位置就是下一次状态判断的输入。",
        ]);
        const draft = stash(emitter);
        return toolResult({ draft_ids: [draft.draft_id], step_indices: [args.start_step_index] });
      },
    ) as AgentTool,
  );

  tools.push(
    defineTool(
      "template_tangent_at",
      "Template: verified tangent",
      "Create a curve, verified target point, and numerical tangent line at x0.",
      Type.Object({
        base_expression: Type.String({ minLength: 1 }),
        x0: Type.Number(),
        x_min: Type.Number(),
        x_max: Type.Number(),
        start_step_index: Type.Integer({ minimum: 1 }),
      }),
      async (args) => {
        const y0 = evaluateExpression(args.base_expression, { x: args.x0 });
        const slope = derivativeAt(args.base_expression, args.x0);
        const yText = formatNumber(y0);
        const slopeText = formatNumber(slope);
        const tangentExpression = `${slopeText}*(x-(${formatNumber(args.x0)}))+(${yText})`;
        emitter.beginStep(args.start_step_index, `x = ${args.x0} 处的切线`);
        emitter.setAxes(args.x_min, args.x_max);
        emitter.addCurve1D(
          args.base_expression,
          "f(x)",
          "primary",
          args.x_min,
          args.x_max,
          "curve",
        );
        emitter.addCurve1D(
          tangentExpression,
          "切线",
          "accent",
          args.x_min,
          args.x_max,
          "tangent",
        );
        emitter.addPoint(args.x0, y0, `(${formatNumber(args.x0)}, ${yText})`, "accent", "target_point");
        emitter.addFormula(`f'(${formatNumber(args.x0)})\\approx ${slopeText}`);
        emitter.setNarration([
          `先在曲线 f(x) = ${args.base_expression} 上定位 x = ${args.x0} 对应的点。`,
          `安全数值核得到该点纵坐标 ${yText}，并估计导数为 ${slopeText}。`,
          "画面中的第二条直线穿过目标点，其斜率与导数一致，因此它是该点的切线。",
        ]);
        const draft = stash(emitter);
        return toolResult({
          draft_ids: [draft.draft_id],
          step_indices: [args.start_step_index],
          verified: { x: args.x0, y: y0, slope, tangent_expression: tangentExpression },
        });
      },
    ) as AgentTool,
  );

  tools.push(
    defineTool(
      "template_function_transform",
      "Template: function transform",
      "Create a base/transformed function comparison and a parameter control.",
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
        emitter.addCurve1D(args.base_expression, "原函数", "secondary", args.x_min, args.x_max, "reference_curve");
        emitter.addCurve1D(
          args.transformed_expression,
          "变换后",
          "primary",
          args.x_min,
          args.x_max,
          "transformed_curve",
        );
        emitter.addParameterControl({
          id: args.param_id,
          label: args.param_label,
          value: String(args.param_initial),
          description: `调整 ${args.param_id} 并确定性重放函数变换`,
        });
        emitter.setNarration([
          `保留原函数 ${args.base_expression} 作为参照。`,
          `变换后曲线 ${args.transformed_expression} 由参数 ${args.param_id} 控制。`,
          "同时观察两条曲线，才能把参数变化和几何位移对应起来。",
        ]);
        const draft = stash(emitter);
        return toolResult({ draft_ids: [draft.draft_id], step_indices: [args.start_step_index] });
      },
    ) as AgentTool,
  );

  tools.push(
    defineTool(
      "template_riemann_sum",
      "Template: verified Riemann sum",
      "Create n=2,4,8 left-endpoint Riemann rectangles with heights evaluated from f(x).",
      Type.Object({
        expression: Type.String({ minLength: 1 }),
        a: Type.Number(),
        b: Type.Number(),
        start_step_index: Type.Integer({ minimum: 1 }),
      }),
      async (args) => {
        if (!(args.b > args.a)) throw new Error("Riemann interval requires b > a");
        const counts = [2, 4, 8];
        const indices = makeStepRange(args.start_step_index, counts.length);
        const drafts = [];
        for (let stage = 0; stage < counts.length; stage += 1) {
          const n = counts[stage];
          const width = (args.b - args.a) / n;
          emitter.beginStep(indices[stage], `n = ${n} 个左端点矩形`);
          emitter.setAxes(args.a - 0.5, args.b + 0.5);
          emitter.addCurve1D(args.expression, "f(x)", "primary", args.a - 0.5, args.b + 0.5, "integrand");
          let sum = 0;
          for (let index = 0; index < n; index += 1) {
            const x0 = args.a + index * width;
            const x1 = x0 + width;
            const height = evaluateExpression(args.expression, { x: x0 });
            sum += width * height;
            emitter.addRegion(
              [
                [x0, 0],
                [x1, 0],
                [x1, height],
                [x0, height],
              ],
              `R${index + 1}`,
              "secondary",
              "riemann_rectangle",
            );
          }
          emitter.addFormula(`S_${n}\\approx ${formatNumber(sum)}`);
          emitter.setNarration([
            `把区间 [${args.a}, ${args.b}] 分成 ${n} 段，每段宽 ${formatNumber(width)}。`,
            "每个矩形的高度由该小区间左端点的真实函数值计算，不使用固定占位高度。",
            `这些矩形面积之和约为 ${formatNumber(sum)}；分段增多时会更接近定积分。`,
          ]);
          drafts.push(stash(emitter));
        }
        return toolResult({ draft_ids: drafts.map((draft) => draft.draft_id), step_indices: indices });
      },
    ) as AgentTool,
  );

  tools.push(
    defineTool(
      "template_parametric_trace",
      "Template: verified parametric trace",
      "Create a parametric curve and real sampled marker points on that curve.",
      Type.Object({
        expression_x: Type.String({ minLength: 1 }),
        expression_y: Type.String({ minLength: 1 }),
        t_min: Type.Number(),
        t_max: Type.Number(),
        n_markers: Type.Integer({ minimum: 2, maximum: 12 }),
        start_step_index: Type.Integer({ minimum: 1 }),
      }),
      async (args) => {
        const samples = sampleParametric(
          args.expression_x,
          args.expression_y,
          args.t_min,
          args.t_max,
          args.n_markers,
        );
        const xs = samples.map((sample) => sample.x);
        const ys = samples.map((sample) => sample.y);
        const margin = 0.5;
        emitter.beginStep(args.start_step_index, "参数曲线与时间标记");
        emitter.setAxes(
          Math.min(...xs) - margin,
          Math.max(...xs) + margin,
          Math.min(...ys) - margin,
          Math.max(...ys) + margin,
        );
        emitter.addCurveParametric(
          args.expression_x,
          args.expression_y,
          args.t_min,
          args.t_max,
          "轨迹",
          "primary",
          "trajectory",
        );
        samples.forEach((sample, index) => {
          emitter.addPoint(
            sample.x,
            sample.y,
            `t${index + 1}`,
            index === 0 || index === samples.length - 1 ? "accent" : "secondary",
            "time_marker",
          );
        });
        emitter.setNarration([
          `画出参数曲线 (${args.expression_x}, ${args.expression_y})。`,
          `沿真实轨迹计算并放置 ${samples.length} 个等时间标记，每个标记都满足同一参数方程。`,
          "标记的先后顺序展示运动方向，不再用旁白声称存在但画面中缺失的点。",
        ]);
        const draft = stash(emitter);
        return toolResult({
          draft_ids: [draft.draft_id],
          step_indices: [args.start_step_index],
          sampled_markers: samples,
        });
      },
    ) as AgentTool,
  );

  tools.push(
    defineTool(
      "template_force_diagram",
      "Template: force diagram",
      "Create a verified free-body diagram draft with one arrow per declared force.",
      Type.Object({
        forces: Type.Array(
          Type.Object({
            name: Type.String(),
            magnitude: Type.Number({ minimum: 0 }),
            angle_deg: Type.Number(),
          }),
          { minItems: 1, maxItems: 6 },
        ),
        start_step_index: Type.Integer({ minimum: 1 }),
      }),
      async (args) => {
        emitter.beginStep(args.start_step_index, "受力分析");
        emitter.setAxes(-5, 5, -5, 5, "x", "y");
        for (const force of args.forces) {
          const radians = (force.angle_deg * Math.PI) / 180;
          emitter.addArrow(
            0,
            0,
            force.magnitude * Math.cos(radians),
            force.magnitude * Math.sin(radians),
            `${force.name} = ${force.magnitude}N`,
            "force_vector",
          );
        }
        emitter.setNarration([
          "把所有作用力统一画在受力对象的参考点上。",
          "每根箭头的方向由输入角度确定，长度按力的大小缩放。",
          "下一步可以在同一坐标系中分解分量并检查合力。",
        ]);
        const draft = stash(emitter);
        return toolResult({ draft_ids: [draft.draft_id], step_indices: [args.start_step_index] });
      },
    ) as AgentTool,
  );

  tools.push(
    defineTool(
      "template_projectile_trajectory",
      "Template: projectile",
      "Create launch, mid-flight, apex, and landing drafts from one deterministic projectile model.",
      Type.Object({
        v0: Type.Number({ minimum: 0 }),
        angle_deg: Type.Number(),
        g: Type.Optional(Type.Number({ exclusiveMinimum: 0 })),
        start_step_index: Type.Integer({ minimum: 1 }),
      }),
      async (args) => {
        const g = args.g ?? 9.8;
        const radians = (args.angle_deg * Math.PI) / 180;
        const vx = args.v0 * Math.cos(radians);
        const vy = args.v0 * Math.sin(radians);
        const flightTime = (2 * vy) / g;
        const range = vx * flightTime;
        const apex = (vy * vy) / (2 * g);
        const times = [0, flightTime / 2, vy / g, flightTime];
        const titles = ["发射时刻", "飞行中", "最高点", "落地"];
        const indices = makeStepRange(args.start_step_index, 4);
        const drafts = [];
        for (let index = 0; index < times.length; index += 1) {
          const time = times[index];
          const x = vx * time;
          const y = vy * time - 0.5 * g * time * time;
          const currentVy = vy - g * time;
          emitter.beginStep(indices[index], titles[index]);
          emitter.setAxes(-1, Math.max(1, range + 1), -1, Math.max(1, apex + 1), "x", "y");
          emitter.addCurveParametric(
            `${formatNumber(vx)}*t`,
            `${formatNumber(vy)}*t-0.5*${formatNumber(g)}*t^2`,
            0,
            flightTime,
            "轨迹",
            "secondary",
            "trajectory",
          );
          emitter.addPoint(x, y, titles[index], "accent", "projectile");
          emitter.addArrow(x, y, vx, 0, "v_x", "horizontal_velocity");
          emitter.addArrow(x, y, 0, currentVy, "v_y", "vertical_velocity");
          emitter.addArrow(x, y, 0, -g, "g", "gravity");
          emitter.setNarration([
            `当前时刻 t = ${formatNumber(time)}，物体坐标为 (${formatNumber(x)}, ${formatNumber(y)})。`,
            `水平速度保持 ${formatNumber(vx)}，竖直速度变为 ${formatNumber(currentVy)}。`,
            "轨迹、速度分量和向下重力同时可见，避免只讲公式不展示状态。",
          ]);
          drafts.push(stash(emitter));
        }
        return toolResult({ draft_ids: drafts.map((draft) => draft.draft_id), step_indices: indices });
      },
    ) as AgentTool,
  );

  tools.push(
    defineTool(
      "template_shm",
      "Template: simple harmonic motion",
      "Create position, velocity, and constant total-energy drafts from one validated SHM parameter set.",
      Type.Object({
        amplitude: Type.Number({ minimum: 0 }),
        omega: Type.Number({ exclusiveMinimum: 0 }),
        phase: Type.Optional(Type.Number()),
        start_step_index: Type.Integer({ minimum: 1 }),
      }),
      async (args) => {
        const phase = args.phase ?? 0;
        const a = args.amplitude;
        const w = args.omega;
        const energy = 0.5 * a * a * w * w;
        const period = (2 * Math.PI) / w;
        const entries = [
          {
            title: "位移随时间",
            expression: `${formatNumber(a)}*cos(${formatNumber(w)}*x+${formatNumber(phase)})`,
            label: "x(t)",
            role: "position",
          },
          {
            title: "速度随时间",
            expression: `-${formatNumber(a * w)}*sin(${formatNumber(w)}*x+${formatNumber(phase)})`,
            label: "v(t)",
            role: "velocity",
          },
          {
            title: "总能量守恒",
            expression: formatNumber(energy),
            label: "E(t)",
            role: "total_energy",
          },
        ];
        const indices = makeStepRange(args.start_step_index, entries.length);
        const drafts = [];
        for (let index = 0; index < entries.length; index += 1) {
          const entry = entries[index];
          emitter.beginStep(indices[index], entry.title);
          emitter.setAxes(0, period * 2, undefined, undefined, "t", entry.label);
          emitter.addCurve1D(entry.expression, entry.label, "primary", 0, period * 2, entry.role);
          emitter.addFormula(
            index === 2
              ? `E=\\frac12 A^2\\omega^2=${formatNumber(energy)}`
              : `${entry.label}=${entry.expression}`,
          );
          emitter.setNarration([
            index === 0
              ? `位移由 A cos(ωt+φ) 决定，振幅为 ${a}。`
              : index === 1
                ? `速度是位移的时间变化率，振幅为 Aω = ${formatNumber(a * w)}。`
                : `总能量为 1/2·A²·ω² = ${formatNumber(energy)}，因此画面是一条常量线。`,
            "该步骤只强调一个物理量，避免把三条曲线混在一起。",
            "三步共享同一组 A、ω、φ，因此相位和能量结论可相互核对。",
          ]);
          drafts.push(stash(emitter));
        }
        return toolResult({ draft_ids: drafts.map((draft) => draft.draft_id), step_indices: indices });
      },
    ) as AgentTool,
  );

  tools.push(
    defineTool(
      "template_code_step",
      "Template: code execution step",
      "Create a real code_trace_scene and parallel Code Sync state for one source line.",
      Type.Object({
        source: Type.String({ minLength: 1 }),
        language: Type.Optional(Type.String({ minLength: 1 })),
        line_index: Type.Integer({ minimum: 0 }),
        variables: Type.Record(Type.String(), Type.String()),
        start_step_index: Type.Integer({ minimum: 1 }),
      }),
      async (args) => {
        const lines = args.source.split("\n");
        if (args.line_index >= lines.length) throw new Error("line_index is outside source");
        emitter.beginStep(args.start_step_index, `执行第 ${args.line_index + 1} 行`);
        emitter.setCodeHighlight(
          {
            language: args.language ?? "text",
            lines,
            active_lines: [args.line_index],
            active_line: args.line_index,
            variables: args.variables,
            operation_label: lines[args.line_index].trim(),
          },
          true,
        );
        const variableText = Object.entries(args.variables)
          .map(([name, value]) => `${name} = ${value}`)
          .join("，");
        emitter.setNarration([
          `当前执行：${lines[args.line_index].trim()}。`,
          `运行时变量为：${variableText || "无显式变量变化"}。`,
          "代码行、变量和主画面使用同一结构化状态，因此 Code Sync 不再只是旁白描述。",
        ]);
        const draft = stash(emitter);
        return toolResult({ draft_ids: [draft.draft_id], step_indices: [args.start_step_index] });
      },
    ) as AgentTool,
  );

  return tools;
}
