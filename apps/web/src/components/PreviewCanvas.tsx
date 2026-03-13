import {
  Arrow,
  Circle,
  Create,
  DOWN,
  FadeIn,
  FadeOut,
  Group,
  Line,
  MathTex,
  Rectangle,
  RIGHT,
  Scene,
  Text,
  UP,
  VGroup,
  Write,
} from "manim-web";
import { ManimScene } from "manim-web/react";

import type { CirDocument, CirStep, VisualToken } from "../types";

interface PreviewCanvasProps {
  cir: CirDocument | null;
  sceneKey: string;
  skillLabel: string;
  sourceImageName?: string | null;
}

const previewWidth = 960;
const previewHeight = 560;

function tokenText(token: VisualToken) {
  return `${token.label}: ${token.value ?? token.label}`;
}

function tokenColor(emphasis: string) {
  if (emphasis === "primary") {
    return "#14b8a6";
  }
  if (emphasis === "accent") {
    return "#fb923c";
  }
  return "#94a3b8";
}

function buildTokenPill(token: VisualToken) {
  const content = tokenText(token);
  const width = Math.max(1.9, Math.min(3.6, content.length * 0.22));
  const background = new Rectangle({
    width,
    height: 0.7,
    color: tokenColor(token.emphasis),
    fillOpacity: 0.18,
    strokeWidth: 2,
  });
  const label = new Text({
    text: content,
    fontSize: 16,
    color: "#e2e8f0",
  }).moveTo(background);
  return new VGroup(background, label);
}

async function buildFormulaVisual(step: CirStep) {
  const latex = step.tokens
    .map((token) => token.value ?? token.label)
    .filter(Boolean)
    .join("\\quad");

  try {
    const formula = new MathTex({
      latex: latex || "\\text{No formula}",
      fontSize: 34,
      color: "#f8fafc",
      renderer: "auto",
    });
    await formula.waitForRender();
    return formula;
  } catch {
    return new Text({
      text: step.tokens.map(tokenText).join("   "),
      fontSize: 22,
      color: "#cbd5e1",
    });
  }
}

function buildArrayVisual(step: CirStep) {
  const pills = step.tokens.map(buildTokenPill);
  return new VGroup(...pills).arrange(RIGHT, 0.28, true);
}

function buildFlowVisual(step: CirStep) {
  const labels = step.tokens.slice(0, 3).map((token) => token.value ?? token.label);
  const nodes = labels.map((label, index) => {
    const box = new Rectangle({
      width: 2.2,
      height: 0.9,
      color: index === 1 ? "#fb923c" : "#38bdf8",
      fillOpacity: 0.15,
      strokeWidth: 2,
    });
    const text = new Text({
      text: label,
      fontSize: 20,
      color: "#f8fafc",
    }).moveTo(box);
    return new VGroup(box, text);
  });

  const group = new VGroup(...nodes).arrange(RIGHT, 0.7, true);
  const arrows = [
    new Arrow({ start: [-1.8, 0, 0], end: [-0.7, 0, 0], color: "#94a3b8" }),
    new Arrow({ start: [0.7, 0, 0], end: [1.8, 0, 0], color: "#94a3b8" }),
  ];
  return new Group(group, ...arrows);
}

function buildGraphVisual(step: CirStep) {
  const labels = step.tokens.slice(0, 3).map((token) => token.value ?? token.label);
  const positions: [number, number, number][] = [
    [-1.8, 0.2, 0],
    [0, 1.1, 0],
    [1.8, -0.3, 0],
  ];

  const lines = [
    new Line({ start: positions[0], end: positions[1], color: "#475569" }),
    new Line({ start: positions[1], end: positions[2], color: "#475569" }),
    new Line({ start: positions[0], end: positions[2], color: "#334155" }),
  ];

  const nodes = positions.flatMap((position, index) => {
    const node = new Circle({
      radius: 0.42,
      color: index === 1 ? "#14b8a6" : "#38bdf8",
      fillOpacity: 0.18,
      strokeWidth: 3,
    }).moveTo(position);
    const label = new Text({
      text: labels[index] ?? `v${index + 1}`,
      fontSize: 18,
      color: "#f8fafc",
    }).moveTo(position);
    return [node, label];
  });

  return new Group(...lines, ...nodes);
}

function buildMotionVisual(step: CirStep) {
  const labels = step.tokens.slice(0, 3).map((token) => token.value ?? token.label);
  const points: [number, number, number][] = [
    [-2.2, -0.8, 0],
    [-0.6, 0.5, 0],
    [1.3, -0.2, 0],
  ];
  const path = [
    new Line({ start: points[0], end: points[1], color: "#38bdf8" }),
    new Line({ start: points[1], end: points[2], color: "#38bdf8" }),
  ];
  const bodies = points.flatMap((point, index) => {
    const body = new Circle({
      radius: 0.28,
      color: index === 1 ? "#14b8a6" : "#f8fafc",
      fillOpacity: 0.22,
      strokeWidth: 3,
    }).moveTo(point);
    const label = new Text({
      text: labels[index] ?? `t${index}`,
      fontSize: 16,
      color: "#f8fafc",
    }).moveTo([point[0], point[1] - 0.5, 0]);
    return [body, label];
  });

  const forceArrow = new Arrow({
    start: [-1.8, 1.2, 0],
    end: [-0.8, 0.35, 0],
    color: "#fb923c",
  });
  return new Group(...path, ...bodies, forceArrow);
}

function buildCircuitVisual(step: CirStep) {
  const labels = step.tokens.slice(0, 3).map((token) => token.value ?? token.label);
  const wires = [
    new Line({ start: [-2.8, 1, 0], end: [2.8, 1, 0], color: "#94a3b8" }),
    new Line({ start: [2.8, 1, 0], end: [2.8, -1, 0], color: "#94a3b8" }),
    new Line({ start: [2.8, -1, 0], end: [-2.8, -1, 0], color: "#94a3b8" }),
    new Line({ start: [-2.8, -1, 0], end: [-2.8, 1, 0], color: "#94a3b8" }),
  ];
  const source = new Circle({
    radius: 0.42,
    color: "#14b8a6",
    fillOpacity: 0.18,
    strokeWidth: 3,
  }).moveTo([-2.8, 0, 0]);
  const resistor = new Rectangle({
    width: 1.5,
    height: 0.6,
    color: "#fb923c",
    fillOpacity: 0.16,
    strokeWidth: 3,
  }).moveTo([0.3, 1, 0]);
  const meter = new Circle({
    radius: 0.34,
    color: "#38bdf8",
    fillOpacity: 0.18,
    strokeWidth: 3,
  }).moveTo([1.7, -1, 0]);
  const text = [
    new Text({ text: labels[0] ?? "source", fontSize: 16, color: "#f8fafc" }).moveTo([-2.8, -0.7, 0]),
    new Text({ text: labels[1] ?? "current", fontSize: 16, color: "#f8fafc" }).moveTo([0.3, 0.3, 0]),
    new Text({ text: labels[2] ?? "voltage", fontSize: 16, color: "#f8fafc" }).moveTo([1.7, -1.7, 0]),
  ];
  const arrow = new Arrow({ start: [-1.5, 1.4, 0], end: [1.2, 1.4, 0], color: "#e2e8f0" });
  return new Group(...wires, source, resistor, meter, arrow, ...text);
}

function buildMoleculeVisual(step: CirStep) {
  const labels = step.tokens.slice(0, 3).map((token) => token.value ?? token.label);
  const positions: [number, number, number][] = [
    [-1.4, 0.4, 0],
    [0, 0, 0],
    [1.5, 0.45, 0],
  ];
  const bonds = [
    new Line({ start: positions[0], end: positions[1], color: "#94a3b8" }),
    new Line({ start: positions[1], end: positions[2], color: "#94a3b8" }),
  ];
  const atoms = positions.flatMap((position, index) => {
    const atom = new Circle({
      radius: index === 1 ? 0.46 : 0.36,
      color: index === 1 ? "#14b8a6" : "#38bdf8",
      fillOpacity: 0.18,
      strokeWidth: 3,
    }).moveTo(position);
    const label = new Text({
      text: labels[index] ?? `a${index + 1}`,
      fontSize: 16,
      color: "#f8fafc",
    }).moveTo(position);
    return [atom, label];
  });
  const transformArrow = new Arrow({ start: [0, -1.6, 0], end: [1.8, -1.6, 0], color: "#fb923c" });
  return new Group(...bonds, ...atoms, transformArrow);
}

function buildMapVisual(step: CirStep) {
  const labels = step.tokens.slice(0, 3).map((token) => token.value ?? token.label);
  const regions = [
    new Rectangle({
      width: 2.4,
      height: 1.4,
      color: "#38bdf8",
      fillOpacity: 0.12,
      strokeWidth: 3,
    }).moveTo([-1.7, 0.4, 0]),
    new Rectangle({
      width: 1.9,
      height: 1.2,
      color: "#14b8a6",
      fillOpacity: 0.12,
      strokeWidth: 3,
    }).moveTo([0.4, 0.9, 0]),
    new Rectangle({
      width: 2.2,
      height: 1.5,
      color: "#fb923c",
      fillOpacity: 0.12,
      strokeWidth: 3,
    }).moveTo([1.9, -0.4, 0]),
  ];
  const arrows = [
    new Arrow({ start: [-1.1, 0.2, 0], end: [0.3, 0.7, 0], color: "#e2e8f0" }),
    new Arrow({ start: [0.9, 0.3, 0], end: [1.5, -0.1, 0], color: "#e2e8f0" }),
  ];
  const text = labels.map(
    (label, index) =>
      new Text({
        text: label,
        fontSize: 15,
        color: "#f8fafc",
      }).moveTo(index === 0 ? [-1.7, -0.75, 0] : index === 1 ? [0.4, 0.1, 0] : [1.9, -1.25, 0]),
  );
  return new Group(...regions, ...arrows, ...text);
}

function buildCellVisual(step: CirStep) {
  const labels = step.tokens.slice(0, 3).map((token) => token.value ?? token.label);
  const membrane = new Circle({
    radius: 1.2,
    color: "#38bdf8",
    fillOpacity: 0.08,
    strokeWidth: 3,
  });
  const nucleus = new Circle({
    radius: 0.48,
    color: "#14b8a6",
    fillOpacity: 0.18,
    strokeWidth: 3,
  }).moveTo([0.2, 0.2, 0]);
  const organelle = new Circle({
    radius: 0.22,
    color: "#fb923c",
    fillOpacity: 0.24,
    strokeWidth: 3,
  }).moveTo([-0.5, -0.2, 0]);
  const labelsGroup = new VGroup(
    new Text({ text: labels[0] ?? "cell", fontSize: 16, color: "#f8fafc" }).moveTo([0, -1.55, 0]),
    new Text({ text: labels[1] ?? "phase", fontSize: 16, color: "#f8fafc" }).moveTo([1.7, 0.65, 0]),
    new Text({ text: labels[2] ?? "signal", fontSize: 16, color: "#f8fafc" }).moveTo([-1.8, -0.6, 0]),
  );
  const arrow = new Arrow({ start: [1.2, 0.5, 0], end: [0.6, 0.3, 0], color: "#94a3b8" });
  return new Group(membrane, nucleus, organelle, labelsGroup, arrow);
}

function buildTextVisual(step: CirStep) {
  const lines = step.tokens.map((token) =>
    new Text({
      text: tokenText(token),
      fontSize: 22,
      color: token.emphasis === "primary" ? "#f8fafc" : "#cbd5e1",
    }),
  );
  return new VGroup(...lines).arrange(DOWN, 0.28, true);
}

async function buildStepVisual(step: CirStep) {
  if (step.visual_kind === "formula") {
    return buildFormulaVisual(step);
  }
  if (step.visual_kind === "flow") {
    return buildFlowVisual(step);
  }
  if (step.visual_kind === "graph") {
    return buildGraphVisual(step);
  }
  if (step.visual_kind === "motion") {
    return buildMotionVisual(step);
  }
  if (step.visual_kind === "circuit") {
    return buildCircuitVisual(step);
  }
  if (step.visual_kind === "molecule") {
    return buildMoleculeVisual(step);
  }
  if (step.visual_kind === "map") {
    return buildMapVisual(step);
  }
  if (step.visual_kind === "cell") {
    return buildCellVisual(step);
  }
  if (step.visual_kind === "text") {
    return buildTextVisual(step);
  }
  return buildArrayVisual(step);
}

async function constructScene(scene: Scene, cir: CirDocument) {
  scene.clear({ render: false });

  const title = new Text({
    text: cir.title,
    fontSize: 30,
    color: "#f8fafc",
    fontWeight: 600,
  }).toEdge(UP, 0.65);
  const summary = new Text({
    text: cir.summary,
    fontSize: 16,
    color: "#cbd5e1",
  }).nextTo(title, DOWN, 0.24);

  scene.add(title, summary);
  await scene.play(new FadeIn(title), new Write(summary));

  for (let index = 0; index < cir.steps.length; index += 1) {
    const step = cir.steps[index];
    const card = new Rectangle({
      width: 11.4,
      height: 4.6,
      color: "#93c5fd",
      fillOpacity: 0.06,
      strokeWidth: 2,
    }).moveTo([0, -0.2, 0]);
    const heading = new Text({
      text: `${index + 1}. ${step.title}`,
      fontSize: 24,
      color: "#e2e8f0",
      fontWeight: 600,
    }).moveTo([0, 1.35, 0]);
    const narration = new Text({
      text: step.narration,
      fontSize: 17,
      color: "#cbd5e1",
    }).moveTo([0, 0.88, 0]);
    const visual = await buildStepVisual(step);
    visual.moveTo([0, -0.15, 0]);

    const annotation = new Text({
      text: step.annotations[0] ?? "当前镜头由 CIR 自动驱动。",
      fontSize: 15,
      color: "#94a3b8",
    }).moveTo([0, -1.72, 0]);

    scene.add(card, heading, narration, visual, annotation);
    await scene.play(
      new Create(card),
      new Write(heading),
      new FadeIn(narration),
      new FadeIn(visual),
      new FadeIn(annotation),
    );
    await scene.wait(0.55);
    await scene.play(
      new FadeOut(card),
      new FadeOut(heading),
      new FadeOut(narration),
      new FadeOut(visual),
      new FadeOut(annotation),
    );
  }
}

export function PreviewCanvas({
  cir,
  sceneKey,
  skillLabel,
  sourceImageName,
}: PreviewCanvasProps) {
  const gpuStatus =
    typeof navigator !== "undefined" && "gpu" in navigator ? "ready" : "unavailable";

  if (!cir) {
    return (
      <div className="preview-empty">
        <strong>等待生成 CIR 草案</strong>
        <span>提交题目后，这里会用 manim-web 播放正式预览，而不是静态 Canvas 示意图。</span>
      </div>
    );
  }

  return (
    <div className="preview-shell">
      <ManimScene
        key={sceneKey}
        width={previewWidth}
        height={previewHeight}
        backgroundColor="#0f172a"
        className="preview-canvas"
        style={{ width: "100%", height: "100%" }}
        onSceneReady={(scene) => {
          void constructScene(scene, cir);
        }}
      >
        <div className="preview-runtime-badges">
          <span>Renderer: manim-web / three.js</span>
          <span>Skill: {skillLabel}</span>
          <span>WebGPU: {gpuStatus}</span>
          <span>Steps: {cir.steps.length}</span>
          {sourceImageName ? <span>Image: {sourceImageName}</span> : null}
        </div>
      </ManimScene>
    </div>
  );
}

export default PreviewCanvas;
