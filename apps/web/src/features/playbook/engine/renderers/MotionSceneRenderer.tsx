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

interface SceneBounds {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

interface CoordinateMapper {
  bounds: SceneBounds;
  width: number;
  height: number;
  mapPoint(point: Point): Point;
  mapDelta(delta: Point): Point;
}

function isPixelWorld(snap: MotionSceneSnapshot, bounds: SceneBounds): boolean {
  return (
    bounds.xMin === 0 &&
    bounds.yMin === 0 &&
    bounds.xMax === snap.viewport.width &&
    bounds.yMax === snap.viewport.height
  );
}

function resolveWorldBounds(snap: MotionSceneSnapshot): SceneBounds {
  const world = snap.viewport.world;
  if (
    world &&
    Number.isFinite(world.xMin) &&
    Number.isFinite(world.xMax) &&
    Number.isFinite(world.yMin) &&
    Number.isFinite(world.yMax) &&
    world.xMax > world.xMin &&
    world.yMax > world.yMin
  ) {
    return world;
  }
  return {
    xMin: 0,
    xMax: snap.viewport.width,
    yMin: 0,
    yMax: snap.viewport.height,
  };
}

function createCoordinateMapper(snap: MotionSceneSnapshot): CoordinateMapper {
  const bounds = resolveWorldBounds(snap);
  const width = snap.viewport.width;
  const height = snap.viewport.height;
  if (isPixelWorld(snap, bounds)) {
    return {
      bounds,
      width,
      height,
      mapPoint: (point) => point,
      mapDelta: (delta) => delta,
    };
  }
  const xScale = width / (bounds.xMax - bounds.xMin);
  const yScale = height / (bounds.yMax - bounds.yMin);
  return {
    bounds,
    width,
    height,
    mapPoint: (point) => ({
      x: (point.x - bounds.xMin) * xScale,
      y: (bounds.yMax - point.y) * yScale,
    }),
    mapDelta: (delta) => ({
      x: delta.x * xScale,
      y: -delta.y * yScale,
    }),
  };
}

function cameraTransform(
  camera: { x: number; y: number; zoom: number },
  mapper: CoordinateMapper,
): string {
  const cameraPoint = mapper.mapPoint({ x: camera.x, y: camera.y });
  return `translate(${mapper.width / 2}, ${mapper.height / 2}) scale(${camera.zoom}) translate(${-cameraPoint.x}, ${-cameraPoint.y})`;
}

function objectTransform(state: ResolvedMotionObjectState, mapper: CoordinateMapper): string {
  const delta = mapper.mapDelta({ x: state.x, y: state.y });
  return `translate(${delta.x}, ${delta.y}) rotate(${state.rotate}) scale(${state.scale})`;
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

function renderObject(
  object: MotionObject,
  state: ResolvedMotionObjectState,
  mapper: CoordinateMapper,
): React.ReactNode {
  switch (object.type) {
    case "polygon": {
      const points = object.points.map(([x, y]) => mapper.mapPoint({ x, y }));
      const centroid = polygonCentroid(points.map((point) => [point.x, point.y]));
      return (
        <>
          <polygon
            points={points.map(({ x, y }) => `${x},${y}`).join(" ")}
            className={classFor("motion-shape", object.style)}
          />
          {renderLabel(object.label, centroid)}
        </>
      );
    }
    case "segment": {
      const start = mapper.mapPoint({ x: object.x1, y: object.y1 });
      const end = mapper.mapPoint({ x: object.x2, y: object.y2 });
      const tip = interpolateLine(start.x, start.y, end.x, end.y, state.drawProgress);
      const labelPoint = {
        x: (start.x + tip.x) / 2,
        y: (start.y + tip.y) / 2 - 16,
      };
      return (
        <>
          <line
            x1={start.x}
            y1={start.y}
            x2={tip.x}
            y2={tip.y}
            markerEnd={object.arrow && state.drawProgress > 0.02 ? `url(#motion-arrow-${object.style ?? "primary"})` : undefined}
            className={classFor("motion-line", object.style)}
          />
          {renderLabel(object.label, labelPoint)}
        </>
      );
    }
    case "point": {
      const point = mapper.mapPoint({ x: object.x, y: object.y });
      return (
        <>
          <circle
            cx={point.x}
            cy={point.y}
            r={object.r ?? 5}
            className={classFor("motion-point", object.style)}
          />
          {renderLabel(object.label, { x: point.x + 18, y: point.y - 14 })}
        </>
      );
    }
    case "text": {
      const point = mapper.mapPoint({ x: object.x, y: object.y });
      return (
        <text
          x={point.x}
          y={point.y}
          className={`motion-text motion-text--${object.style ?? "label"}`}
        >
          {object.text}
        </text>
      );
    }
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
  const mapper = createCoordinateMapper(snap);
  const worldCenterX = (mapper.bounds.xMin + mapper.bounds.xMax) / 2;
  const worldCenterY = (mapper.bounds.yMin + mapper.bounds.yMax) / 2;
  const camera = evaluateCamera(snap.camera, progress, {
    x: worldCenterX,
    y: worldCenterY,
    zoom: 1,
  });

  return (
    <div className="motion-scene-renderer" data-theme={theme}>
      <svg
        className="motion-scene-renderer__svg"
        width="100%"
        height="100%"
        viewBox={`0 0 ${mapper.width} ${mapper.height}`}
        role="img"
        aria-label={step.title}
      >
        <ArrowDefs />
        <rect width={mapper.width} height={mapper.height} className="motion-scene-renderer__bg" />
        <path
          d={`M 0 ${mapper.height / 2} H ${mapper.width} M ${mapper.width / 2} 0 V ${mapper.height}`}
          className="motion-scene-renderer__grid"
        />
        <g className="motion-scene-renderer__camera" transform={cameraTransform(camera, mapper)}>
          {snap.objects.map((object) => {
            const state = resolveObjectState(object.id, snap.tracks, progress);
            return (
              <g
                key={object.id}
                className="motion-object"
                data-object-id={object.id}
                data-highlight={state.highlight.toFixed(3)}
                opacity={state.opacity}
                transform={objectTransform(state, mapper)}
                style={{
                  filter: state.highlight > 0 ? `drop-shadow(0 0 ${8 + state.highlight * 10}px currentColor)` : undefined,
                }}
              >
                {renderObject(object, state, mapper)}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
};
