import React from "react";
import "katex/dist/katex.min.css";
import { Coordinates, LaTeX, Line, Mafs, Plot, Point, Polygon, Theme, Vector } from "mafs";
import type {
  MathSceneAnnotation,
  MathSceneCurve,
  MathScenePoint,
  MathSceneRegion,
  MathSceneSegment,
  MathSceneSnapshot,
  MathSceneVectorField,
} from "../types";
import type { RendererProps } from "./types";
import { compileExpr, type CompiledExpr } from "../../../../shared/lib/mathExpr";
import { sanitizeKatex } from "../../../../shared/lib/sanitizeKatex";
import { clamp01 } from "../foundation";
import { planCameraViewBox } from "../math-scene-plan/cameraPlanner";
import {
  buildMathSceneRenderPlan,
  type MathSceneRenderPlan,
  type PlannedObject,
} from "../math-scene-plan/plan";
import { revealRegionVertices } from "./regionReveal";

type Emphasis = "primary" | "secondary" | "accent";

const EMPHASIS_COLORS: Record<"dark" | "light", Record<Emphasis, string>> = {
  dark: {
    primary: Theme.blue,
    secondary: Theme.violet,
    accent: Theme.orange,
  },
  light: {
    primary: Theme.indigo,
    secondary: Theme.violet,
    accent: Theme.red,
  },
};

function emphasisColor(theme: "dark" | "light", emphasis: string | undefined): string {
  const e = (emphasis ?? "primary") as Emphasis;
  return EMPHASIS_COLORS[theme][e] ?? EMPHASIS_COLORS[theme].primary;
}

function safeCompile(source: string): CompiledExpr | null {
  try {
    return compileExpr(source);
  } catch {
    return null;
  }
}

function annotationTex(text: string): string {
  const trimmed = text.trim();
  const inline = trimmed.match(/^\$(.+)\$$/s);
  if (inline) return inline[1];
  if (trimmed.includes("$")) {
    // Strip stray dollar signs; let mafs/KaTeX render the rest.
    return trimmed.replace(/\$/g, "");
  }
  return `\\text{${trimmed.replace(/[{}\\]/g, "")}}`;
}

interface CurveProgressDomain {
  kind: "explicit" | "parametric";
  current: [number, number];
}

function curveDomain(
  curve: MathSceneCurve,
  xMin: number,
  xMax: number,
  progress: number,
): CurveProgressDomain {
  if (curve.expression_x != null && curve.t_min != null && curve.t_max != null) {
    const lo = Math.min(curve.t_min, curve.t_max);
    const hi = Math.max(curve.t_min, curve.t_max);
    const span = hi - lo;
    return { kind: "parametric", current: [lo, lo + span * progress] };
  }
  const span = xMax - xMin;
  return { kind: "explicit", current: [xMin, xMin + span * progress] };
}

function evalSegmentTip(s: MathSceneSegment, progress: number): [number, number] {
  return [s.x0 + (s.x1 - s.x0) * progress, s.y0 + (s.y1 - s.y0) * progress];
}

const COMPACT_LABEL_RE = /^[A-Za-z0-9._\-+=\s,:'"]+$/;

function plannedObjectData(
  kind: string,
  key: string,
  progress: number,
): Record<string, string> {
  return {
    "data-math-scene-kind": kind,
    "data-math-scene-key": key,
    "data-math-scene-progress": progress.toFixed(3),
  };
}

function RegionsLayer({
  regions,
  theme,
}: {
  regions: PlannedObject<MathSceneRegion>[];
  theme: "dark" | "light";
}) {
  return (
    <>
      {regions.map(({ key, object: region, progress }) => {
        if (region.vertices.length < 3) return null;
        const color = emphasisColor(theme, region.emphasis);
        const points = revealRegionVertices(
          region.vertices as ReadonlyArray<readonly [number, number]>,
          progress,
        );
        return (
          <g key={key} {...plannedObjectData("region", key, progress)}>
            <Polygon
              points={points}
              color={color}
              fillOpacity={0.18}
              strokeOpacity={0.9}
            />
          </g>
        );
      })}
    </>
  );
}

function VectorFieldLayer({
  field,
  theme,
  progress,
  scope,
  fallbackStep,
}: {
  field: MathSceneVectorField;
  theme: "dark" | "light";
  progress: number;
  scope?: Record<string, number>;
  fallbackStep: number;
}) {
  const fnPx = React.useMemo(() => safeCompile(field.expression_px), [field.expression_px]);
  const fnPy = React.useMemo(() => safeCompile(field.expression_py), [field.expression_py]);
  if (!fnPx || !fnPy) return null;
  const step = field.step && field.step > 0 ? field.step : fallbackStep;
  const fadeIn = clamp01(progress * 1.5);
  return (
    <Plot.VectorField
      xy={(point) => {
        const [x, y] = point;
        try {
          const px = fnPx({ ...scope, x, y });
          const py = fnPy({ ...scope, x, y });
          if (!Number.isFinite(px) || !Number.isFinite(py)) return [0, 0];
          return [px, py];
        } catch {
          return [0, 0];
        }
      }}
      step={step}
      color={emphasisColor(theme, "secondary")}
      opacityStep={0.5 * fadeIn}
    />
  );
}

function CurveLayer({
  curve,
  theme,
  progress,
  scope,
  xMin,
  xMax,
}: {
  curve: MathSceneCurve;
  theme: "dark" | "light";
  progress: number;
  scope?: Record<string, number>;
  xMin: number;
  xMax: number;
}) {
  const fnY = React.useMemo(() => safeCompile(curve.expression_y), [curve.expression_y]);
  const fnX = React.useMemo(
    () => (curve.expression_x ? safeCompile(curve.expression_x) : null),
    [curve.expression_x],
  );
  if (!fnY) return null;
  const domain = curveDomain(curve, xMin, xMax, progress);
  const color = emphasisColor(theme, curve.emphasis);
  if (domain.kind === "parametric" && fnX) {
    return (
      <Plot.Parametric
        xy={(t) => {
          try {
            const x = fnX({ ...scope, t });
            const y = fnY({ ...scope, t });
            if (!Number.isFinite(x) || !Number.isFinite(y)) return [NaN, NaN];
            return [x, y];
          } catch {
            return [NaN, NaN];
          }
        }}
        t={domain.current}
        color={color}
      />
    );
  }
  return (
    <Plot.OfX
      y={(x) => {
        try {
          const y = fnY({ ...scope, x });
          return Number.isFinite(y) ? y : NaN;
        } catch {
          return NaN;
        }
      }}
      domain={domain.current}
      color={color}
    />
  );
}

function SegmentLayer({
  segment,
  theme,
  progress,
}: {
  segment: MathSceneSegment;
  theme: "dark" | "light";
  progress: number;
}) {
  const color = emphasisColor(theme, segment.emphasis);
  const tip = evalSegmentTip(segment, progress);
  if (segment.arrow) {
    return <Vector tail={[segment.x0, segment.y0]} tip={tip} color={color} />;
  }
  return (
    <Line.Segment
      point1={[segment.x0, segment.y0]}
      point2={tip}
      color={color}
    />
  );
}

function PointsLayer({
  points,
  theme,
}: {
  points: PlannedObject<MathScenePoint>[];
  theme: "dark" | "light";
}) {
  return (
    <>
      {points.map(({ key, object: p, progress }) => {
        const fadeIn = clamp01(progress * 1.5);
        const color = emphasisColor(theme, p.emphasis);
        return (
          <g
            key={key}
            opacity={fadeIn}
            {...plannedObjectData("point", key, progress)}
          >
            <Point x={p.x} y={p.y} color={color} />
            {p.label && p.label.trim() && (
              <LaTeX at={[p.x, p.y]} tex={annotationTex(p.label)} color={color} />
            )}
          </g>
        );
      })}
    </>
  );
}

function AnnotationsLayer({
  annotations,
}: {
  annotations: PlannedObject<MathSceneAnnotation>[];
}) {
  return (
    <>
      {annotations.map(({ key, object: a, progress }) => (
        <g
          key={key}
          opacity={clamp01(progress * 1.5)}
          {...plannedObjectData("annotation", key, progress)}
        >
          <LaTeX
            at={[a.x, a.y]}
            tex={annotationTex(a.text)}
            color={Theme.foreground}
          />
        </g>
      ))}
    </>
  );
}

function FormulaCorner({ latex }: { latex: string }) {
  const html = React.useMemo(() => {
    const rendered = sanitizeKatex(latex);
    return rendered || null;
  }, [latex]);
  if (!html) return null;
  return (
    <div
      className="math-scene-renderer__formula"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function mathScenePlanDebugEnabled(): boolean {
  if (!import.meta.env.DEV || typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).has("debugMathScenePlan");
}

function plannedObjects(plan: MathSceneRenderPlan): PlannedObject<unknown>[] {
  return [
    ...plan.points,
    ...plan.segments,
    ...plan.regions,
    ...plan.curves,
    ...plan.annotations,
    ...(plan.vectorField ? [plan.vectorField] : []),
  ];
}

function planObjectCounts(plan: MathSceneRenderPlan): {
  added: number;
  persisted: number;
} {
  return plannedObjects(plan).reduce(
    (counts, object) => ({
      added: counts.added + (object.added ? 1 : 0),
      persisted: counts.persisted + (object.persisted ? 1 : 0),
    }),
    { added: 0, persisted: 0 },
  );
}

function formatCameraValue(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  const rounded = Math.abs(value) < 0.005 ? 0 : value;
  return rounded.toFixed(2);
}

function DebugMathScenePlanOverlay({ plan }: { plan: MathSceneRenderPlan }) {
  const counts = planObjectCounts(plan);
  const [x0, x1] = plan.camera.x;
  const [y0, y1] = plan.camera.y;
  const viewBox = `viewBox x[${formatCameraValue(x0)}, ${formatCameraValue(x1)}] y[${formatCameraValue(y0)}, ${formatCameraValue(y1)}]`;

  return (
    <div className="math-scene-renderer__debug-plan" aria-hidden="true">
      <span>added {counts.added}</span>
      <span>persisted {counts.persisted}</span>
      <span>{viewBox}</span>
    </div>
  );
}

export const MathSceneRenderer: React.FC<RendererProps> = ({
  step,
  prevStep,
  frame,
  stepStartFrame,
  progress,
  theme,
  renderMode = "standalone",
}) => {
  const snap = step.snapshot as MathSceneSnapshot;
  const isOverlayMode = renderMode === "stage-overlay";
  const plan = React.useMemo(
    () => {
      const basePlan = buildMathSceneRenderPlan({
        previousStep: prevStep,
        currentSnapshot: snap,
        stepProgress: progress,
      });
      return {
        ...basePlan,
        camera: planCameraViewBox({
          plan: basePlan,
          fallback: basePlan.camera,
          progress,
        }),
      };
    },
    [prevStep, snap, progress],
  );
  const elapsed = Math.max(0, frame - stepStartFrame);
  const titleOpacity = clamp01(elapsed / 8);

  const xMin = snap.x_min;
  const xMax = snap.x_max;
  const yMin = snap.y_min;
  const yMax = snap.y_max;
  const fallbackVectorStep = Math.max((xMax - xMin) / 8, (yMax - yMin) / 8, 0.25);

  const points = snap.points ?? [];
  const scope = snap.params;

  const labelTokens = points
    .map((p) => p.label)
    .filter((label): label is string => !!label && label.trim().length > 0 && COMPACT_LABEL_RE.test(label));

  return (
    <div
      className={`math-scene-renderer${isOverlayMode ? " math-scene-renderer--overlay" : ""}`}
      data-theme={theme}
    >
      {!isOverlayMode && (
        <div className="math-scene-renderer__title" style={{ opacity: titleOpacity }}>
          {step.title}
        </div>
      )}

      <div className="math-scene-renderer__stage">
        <Mafs
          viewBox={plan.camera}
          preserveAspectRatio="contain"
          pan={false}
          zoom={false}
        >
          {!isOverlayMode && <Coordinates.Cartesian />}
          <RegionsLayer regions={plan.regions} theme={theme} />
          {plan.vectorField && (
            <g
              key={plan.vectorField.key}
              {...plannedObjectData(
                "vector_field",
                plan.vectorField.key,
                plan.vectorField.progress,
              )}
            >
              <VectorFieldLayer
                field={plan.vectorField.object}
                theme={theme}
                progress={plan.vectorField.progress}
                scope={scope}
                fallbackStep={fallbackVectorStep}
              />
            </g>
          )}
          {plan.curves.map(({ key, object: curve, progress: curveProgress }) => (
            <g key={key} {...plannedObjectData("curve", key, curveProgress)}>
              <CurveLayer
                curve={curve}
                theme={theme}
                progress={curveProgress}
                scope={scope}
                xMin={xMin}
                xMax={xMax}
              />
            </g>
          ))}
          {plan.segments.map(({ key, object: segment, progress: segmentProgress }) => (
            <g key={key} {...plannedObjectData("segment", key, segmentProgress)}>
              <SegmentLayer
                segment={segment}
                theme={theme}
                progress={segmentProgress}
              />
            </g>
          ))}
          <PointsLayer points={plan.points} theme={theme} />
          <AnnotationsLayer annotations={plan.annotations} />
        </Mafs>
      </div>

      {!isOverlayMode && snap.formula_latex && snap.formula_latex.trim() && (
        <FormulaCorner latex={snap.formula_latex} />
      )}

      {!isOverlayMode && snap.caption && snap.caption.trim() && (
        <div className="math-scene-renderer__caption">{snap.caption}</div>
      )}

      {!isOverlayMode && labelTokens.length > 0 && (
        <div className="math-scene-renderer__legend" aria-hidden="true">
          {labelTokens.join("  ·  ")}
        </div>
      )}

      {!isOverlayMode && mathScenePlanDebugEnabled() && <DebugMathScenePlanOverlay plan={plan} />}
    </div>
  );
};
