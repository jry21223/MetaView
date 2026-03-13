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

export function PreviewCanvas({ cir, sceneKey }: PreviewCanvasProps) {
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
          <span>WebGPU: {gpuStatus}</span>
          <span>Steps: {cir.steps.length}</span>
        </div>
      </ManimScene>
    </div>
  );
}

export default PreviewCanvas;
