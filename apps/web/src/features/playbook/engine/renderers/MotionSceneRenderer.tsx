import React from "react";
import type { MotionObject, MotionSceneSnapshot, MotionStyle, ResolvedMotionObjectState } from "../motion/types";
import { clamp01 } from "../motion/easing";
import { evaluateCamera, resolveObjectState } from "../motion/evaluate";
import type { RendererProps } from "./types";
import "./MotionSceneRenderer.css";

interface Point {
  x: number;
  y: number;
}

function cameraTransform(
  camera: { x: number; y: number; zoom: number },
  width: number,
  height: number,
): string {
  return `translate(${width / 2}, ${height / 2}) scale(${camera.zoom}) translate(${-camera.x}, ${-camera.y})`;
}

function objectTransform(state: ResolvedMotionObjectState): string {
  return `translate(${state.x}, ${state.y}) rotate(${state.rotate}) scale(${state.scale})`;
}

function classFor(base: string, style: MotionStyle | undefined): string {
  return `${base} ${base}--${style ?? "primary"}`;
}

function interpolateLine(x1: number, y1: number, x2: number, y2: number, progress: number): Point {
  const p = clamp01(progress);
  return {
    x: x1 + (x2 - x1) * p,
    y: y1 + (y2 - y1) * p,
  };
}

function polygonCentroid(points: Array<[number, number]>): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  const sum = points.reduce(
    (acc, [x, y]) => ({ x: acc.x + x, y: acc.y + y }),
    { x: 0, y: 0 },
  );
  return { x: sum.x / points.length, y: sum.y / points.length };
}

function renderLabel(label: string | undefined, at: Point, key = "label") {
  if (!label || !label.trim()) return null;
  return (
    <text key={key} x={at.x} y={at.y} textAnchor="middle" dominantBaseline="middle" className="motion-label">
      {label}
    </text>
  );
}

function renderObject(object: MotionObject, state: ResolvedMotionObjectState): React.ReactNode {
  switch (object.type) {
    case "polygon": {
      const centroid = polygonCentroid(object.points);
      return (
        <>
          <polygon
            points={object.points.map(([x, y]) => `${x},${y}`).join(" ")}
            className={classFor("motion-shape", object.style)}
          />
          {renderLabel(object.label, centroid)}
        </>
      );
    }
    case "segment": {
      const tip = interpolateLine(object.x1, object.y1, object.x2, object.y2, state.drawProgress);
      const labelPoint = {
        x: (object.x1 + tip.x) / 2,
        y: (object.y1 + tip.y) / 2 - 16,
      };
      return (
        <>
          <line
            x1={object.x1}
            y1={object.y1}
            x2={tip.x}
            y2={tip.y}
            markerEnd={object.arrow && state.drawProgress > 0.02 ? `url(#motion-arrow-${object.style ?? "primary"})` : undefined}
            className={classFor("motion-line", object.style)}
          />
          {renderLabel(object.label, labelPoint)}
        </>
      );
    }
    case "point":
      return (
        <>
          <circle
            cx={object.x}
            cy={object.y}
            r={object.r ?? 5}
            className={classFor("motion-point", object.style)}
          />
          {renderLabel(object.label, { x: object.x + 18, y: object.y - 14 })}
        </>
      );
    case "text":
      return (
        <text
          x={object.x}
          y={object.y}
          className={`motion-text motion-text--${object.style ?? "label"}`}
        >
          {object.text}
        </text>
      );
  }
}

function ArrowDefs() {
  return (
    <defs>
      {(["primary", "secondary", "accent", "muted"] as const).map((style) => (
        <marker
          key={style}
          id={`motion-arrow-${style}`}
          markerWidth="10"
          markerHeight="10"
          refX="8"
          refY="5"
          orient="auto"
          markerUnits="strokeWidth"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" className={classFor("motion-shape", style)} />
        </marker>
      ))}
    </defs>
  );
}

export const MotionSceneRenderer: React.FC<RendererProps> = ({
  step,
  progress,
  theme,
}) => {
  const snap = step.snapshot as MotionSceneSnapshot;
  const { width, height } = snap.viewport;
  const camera = evaluateCamera(snap.camera, progress, {
    x: width / 2,
    y: height / 2,
    zoom: 1,
  });

  return (
    <div className="motion-scene-renderer" data-theme={theme}>
      <svg
        className="motion-scene-renderer__svg"
        width="100%"
        height="100%"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={step.title}
      >
        <ArrowDefs />
        <rect width={width} height={height} className="motion-scene-renderer__bg" />
        <path
          d={`M 0 ${height / 2} H ${width} M ${width / 2} 0 V ${height}`}
          className="motion-scene-renderer__grid"
        />
        <g className="motion-scene-renderer__camera" transform={cameraTransform(camera, width, height)}>
          {snap.objects.map((object) => {
            const state = resolveObjectState(object.id, snap.tracks, progress);
            return (
              <g
                key={object.id}
                className="motion-object"
                data-object-id={object.id}
                data-highlight={state.highlight.toFixed(3)}
                opacity={state.opacity}
                transform={objectTransform(state)}
                style={{
                  filter: state.highlight > 0 ? `drop-shadow(0 0 ${8 + state.highlight * 10}px currentColor)` : undefined,
                }}
              >
                {renderObject(object, state)}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
};
