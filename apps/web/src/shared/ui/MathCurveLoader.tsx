import React, { useMemo } from 'react';

export type MathCurveLoaderVariant = 'rose' | 'lissajous' | 'orbit';

export interface MathCurveLoaderProps {
  variant?: MathCurveLoaderVariant;
  particles?: number;
  speed?: number;
  size?: number;
  color?: string;
  label?: string;
  className?: string;
  decorative?: boolean;
  showLabel?: boolean;
}

interface Point {
  x: number;
  y: number;
}

const VIEWBOX_SIZE = 100;
const CENTER = VIEWBOX_SIZE / 2;
const DEFAULT_LABEL = '正在生成';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function polarToPoint(radius: number, theta: number): Point {
  return {
    x: CENTER + radius * Math.cos(theta),
    y: CENTER + radius * Math.sin(theta),
  };
}

function pointForVariant(variant: MathCurveLoaderVariant, t: number): Point {
  switch (variant) {
    case 'lissajous':
      return {
        x: CENTER + 34 * Math.sin(3 * t + Math.PI / 2),
        y: CENTER + 34 * Math.sin(4 * t),
      };
    case 'orbit': {
      const radius = 23 + 8 * Math.cos(5 * t);
      return {
        x: CENTER + radius * Math.cos(t) + 9 * Math.cos(3 * t),
        y: CENTER + radius * Math.sin(t) - 9 * Math.sin(2 * t),
      };
    }
    case 'rose':
    default: {
      const radius = 33 * Math.cos(4 * t);
      return polarToPoint(radius, t);
    }
  }
}

function buildCurvePath(variant: MathCurveLoaderVariant): string {
  const samples = 144;
  const points = Array.from({ length: samples + 1 }, (_, index) =>
    pointForVariant(variant, (index / samples) * Math.PI * 2),
  );
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ');
}

function particlePoints(variant: MathCurveLoaderVariant, count: number): Point[] {
  return Array.from({ length: count }, (_, index) =>
    pointForVariant(variant, (index / count) * Math.PI * 2),
  );
}

export function MathCurveLoader({
  variant = 'rose',
  particles = 14,
  speed = 1.6,
  size = 96,
  color = 'var(--accent)',
  label = DEFAULT_LABEL,
  className,
  decorative = false,
  showLabel = true,
}: MathCurveLoaderProps) {
  const safeSize = clamp(Math.round(size), 24, 220);
  const safeParticles = clamp(Math.round(particles), 4, 36);
  const safeSpeed = clamp(speed, 0.6, 4);
  const path = useMemo(() => buildCurvePath(variant), [variant]);
  const dots = useMemo(() => particlePoints(variant, safeParticles), [variant, safeParticles]);
  const classes = ['mv-math-curve-loader', `mv-math-curve-loader--${variant}`, className ?? '']
    .filter(Boolean)
    .join(' ');

  const accessibilityProps = decorative
    ? { 'aria-hidden': true }
    : {
        role: 'status',
        'aria-live': 'polite' as const,
        'aria-label': label,
      };

  return (
    <div
      className={classes}
      style={{
        '--mv-loader-color': color,
        '--mv-loader-size': `${safeSize}px`,
        '--mv-loader-speed': `${safeSpeed}s`,
      } as React.CSSProperties}
      {...accessibilityProps}
    >
      <svg
        className="mv-math-curve-loader__svg"
        viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`}
        aria-hidden="true"
        focusable="false"
      >
        <path className="mv-math-curve-loader__ghost" d={path} pathLength={1} />
        <path className="mv-math-curve-loader__draw" d={path} pathLength={1} />
        <g className="mv-math-curve-loader__particles">
          {dots.map((point, index) => (
            <circle
              key={`${point.x}-${point.y}-${index}`}
              className="mv-math-curve-loader__particle"
              cx={point.x.toFixed(2)}
              cy={point.y.toFixed(2)}
              r={index % 3 === 0 ? 1.55 : 1.15}
              style={{ animationDelay: `${(index / safeParticles) * safeSpeed}s` }}
            />
          ))}
        </g>
      </svg>
      {showLabel && !decorative && <span className="mv-math-curve-loader__label">{label}</span>}
    </div>
  );
}
