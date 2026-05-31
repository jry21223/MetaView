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
import {
  mathSceneAnnotationKey,
  mathSceneCurveKey,
  mathScenePointKey,
  mathSceneRegionKey,
  mathSceneSegmentKey,
  previousMathSceneIdentitySets,
  progressForIdentity,
} from "./mathSceneIdentity";
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

function RegionsLayer({
  regions,
  theme,
  progress,
  previousKeys,
}: {
  regions: MathSceneRegion[];
  theme: "dark" | "light";
  progress: number;
  previousKeys: Set<string>;
}) {
  return (
    <>
      {regions.map((region) => {
        if (region.vertices.length < 3) return null;
        const key = mathSceneRegionKey(region);
        const color = emphasisColor(theme, region.emphasis);
        const regionProgress = progressForIdentity(key, previousKeys, progress);
        const points = revealRegionVertices(
          region.vertices as ReadonlyArray<readonly [number, number]>,
          regionProgress,
        );
        return (
          <Polygon
            key={key}
            points={points}
            color={color}
            fillOpacity={0.18}
            strokeOpacity={0.9}
          />
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
  progress,
  previousKeys,
}: {
  points: MathScenePoint[];
  theme: "dark" | "light";
  progress: number;
  previousKeys: Set<string>;
}) {
  return (
    <>
      {points.map((p) => {
        const key = mathScenePointKey(p);
        const pointProgress = progressForIdentity(key, previousKeys, progress);
        const fadeIn = clamp01(pointProgress * 1.5);
        const color = emphasisColor(theme, p.emphasis);
        return (
          <React.Fragment key={key}>
            <Point x={p.x} y={p.y} color={color} opacity={fadeIn} />
            {p.label && p.label.trim() && (
              <LaTeX at={[p.x, p.y]} tex={annotationTex(p.label)} color={color} />
            )}
          </React.Fragment>
        );
      })}
    </>
  );
}

function AnnotationsLayer({ annotations }: { annotations: MathSceneAnnotation[] }) {
  return (
    <>
      {annotations.map((a) => {
        const key = mathSceneAnnotationKey(a);
        return (
          <LaTeX
            key={key}
            at={[a.x, a.y]}
            tex={annotationTex(a.text)}
            color={Theme.foreground}
          />
        );
      })}
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

export const MathSceneRenderer: React.FC<RendererProps> = ({
  step,
  prevStep,
  frame,
  stepStartFrame,
  progress,
  theme,
}) => {
  const snap = step.snapshot as MathSceneSnapshot;
  const previousIdentities = React.useMemo(
    () => previousMathSceneIdentitySets(prevStep),
    [prevStep],
  );
  const elapsed = Math.max(0, frame - stepStartFrame);
  const titleOpacity = clamp01(elapsed / 8);

  const xMin = snap.x_min;
  const xMax = snap.x_max;
  const yMin = snap.y_min;
  const yMax = snap.y_max;
  const fallbackVectorStep = Math.max((xMax - xMin) / 8, (yMax - yMin) / 8, 0.25);

  const regions = snap.regions ?? [];
  const curves = snap.curves ?? [];
  const segments = snap.segments ?? [];
  const points = snap.points ?? [];
  const annotations = snap.annotations ?? [];
  const scope = snap.params;

  const labelTokens = points
    .map((p) => p.label)
    .filter((label): label is string => !!label && label.trim().length > 0 && COMPACT_LABEL_RE.test(label));

  return (
    <div className="math-scene-renderer" data-theme={theme}>
      <div className="math-scene-renderer__title" style={{ opacity: titleOpacity }}>
        {step.title}
      </div>

      <div className="math-scene-renderer__stage">
        <Mafs
          viewBox={{ x: [xMin, xMax], y: [yMin, yMax] }}
          preserveAspectRatio="contain"
          pan={false}
          zoom={false}
        >
          <Coordinates.Cartesian />
          <RegionsLayer
            regions={regions}
            theme={theme}
            progress={progress}
            previousKeys={previousIdentities.regions}
          />
          {snap.vector_field && (
            <VectorFieldLayer
              field={snap.vector_field}
              theme={theme}
              progress={progress}
              scope={scope}
              fallbackStep={fallbackVectorStep}
            />
          )}
          {curves.map((curve) => {
            const key = mathSceneCurveKey(curve);
            return (
              <CurveLayer
                key={key}
                curve={curve}
                theme={theme}
                progress={progressForIdentity(key, previousIdentities.curves, progress)}
                scope={scope}
                xMin={xMin}
                xMax={xMax}
              />
            );
          })}
          {segments.map((segment) => {
            const key = mathSceneSegmentKey(segment);
            return (
              <SegmentLayer
                key={key}
                segment={segment}
                theme={theme}
                progress={progressForIdentity(key, previousIdentities.segments, progress)}
              />
            );
          })}
          <PointsLayer
            points={points}
            theme={theme}
            progress={progress}
            previousKeys={previousIdentities.points}
          />
          <AnnotationsLayer annotations={annotations} />
        </Mafs>
      </div>

      {snap.formula_latex && snap.formula_latex.trim() && (
        <FormulaCorner latex={snap.formula_latex} />
      )}

      {snap.caption && snap.caption.trim() && (
        <div className="math-scene-renderer__caption">{snap.caption}</div>
      )}

      {labelTokens.length > 0 && (
        <div className="math-scene-renderer__legend" aria-hidden="true">
          {labelTokens.join("  ·  ")}
        </div>
      )}
    </div>
  );
};
