import React, { useEffect, useState } from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  BRAND_LOGO_LOOP_FINAL_DOT,
  BRAND_LOGO_LOOP_SIZE,
  getBrandLogoLoopState,
} from "./brandLogoLoopModel";

const MARK_PATH = "M150 430V210L255 345L360 210L470 430L530 300";
const BORDER_PATH =
  "M108 54H532A54 54 0 0 1 586 108V532A54 54 0 0 1 532 586H108A54 54 0 0 1 54 532V108A54 54 0 0 1 108 54";

const LOOP_COLORS = {
  accent: "#35c494",
  accentSoft: "#7be0bb",
  highlight: "#e3c35a",
  highlightSoft: "#fff0a5",
  guide: "#1c6d58",
  markGuide: "#174f40",
};

function usePrefersReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");

    const handleChange = (event: MediaQueryListEvent) => {
      setPrefersReducedMotion(event.matches);
    };
    query.addEventListener?.("change", handleChange);
    return () => query.removeEventListener?.("change", handleChange);
  }, []);

  return prefersReducedMotion;
}

export const BrandLogoLoop: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const prefersReducedMotion = usePrefersReducedMotion();
  const state = getBrandLogoLoopState(
    prefersReducedMotion ? Math.round(fps * 3.2) : frame,
    fps,
  );

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        background: "transparent",
      }}
    >
      <svg
        aria-hidden="true"
        viewBox={`0 0 ${BRAND_LOGO_LOOP_SIZE} ${BRAND_LOGO_LOOP_SIZE}`}
        width="100%"
        height="100%"
      >
        <defs>
          <linearGradient
            id="mv-brand-loop-mark"
            x1="145"
            y1="430"
            x2="535"
            y2="286"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0" stopColor={LOOP_COLORS.accent} />
            <stop offset="0.72" stopColor={LOOP_COLORS.accent} />
            <stop offset="0.9" stopColor={LOOP_COLORS.accentSoft} />
            <stop offset="1" stopColor={LOOP_COLORS.highlight} />
          </linearGradient>
          <filter id="mv-brand-loop-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="3.5" result="blur" />
            <feColorMatrix
              in="blur"
              type="matrix"
              values="0 0 0 0 0.89 0 0 0 0 0.76 0 0 0 0 0.35 0 0 0 0.34 0"
            />
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <path
          d={BORDER_PATH}
          fill="none"
          stroke={LOOP_COLORS.guide}
          strokeOpacity={state.guideOpacity}
          strokeWidth="12"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d={BORDER_PATH}
          fill="none"
          stroke={LOOP_COLORS.highlight}
          strokeOpacity={0.44 * state.logoOpacity}
          strokeWidth="8"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={1 - state.borderProgress}
          filter="url(#mv-brand-loop-glow)"
        />

        <path
          d={MARK_PATH}
          fill="none"
          stroke={LOOP_COLORS.markGuide}
          strokeOpacity={0.3 + state.guideOpacity}
          strokeWidth="88"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d={MARK_PATH}
          fill="none"
          stroke="url(#mv-brand-loop-mark)"
          strokeOpacity={state.logoOpacity}
          strokeWidth="46"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={1 - state.markProgress}
        />
        <path
          d="M470 430L530 300"
          fill="none"
          stroke={LOOP_COLORS.highlight}
          strokeOpacity={0.18 * state.logoOpacity}
          strokeWidth="84"
          strokeLinecap="round"
        />
        <path
          d="M492 384L530 300"
          fill="none"
          stroke={LOOP_COLORS.highlightSoft}
          strokeOpacity={0.42 * state.logoOpacity}
          strokeWidth="18"
          strokeLinecap="round"
        />

        <circle
          cx={BRAND_LOGO_LOOP_FINAL_DOT.x}
          cy={BRAND_LOGO_LOOP_FINAL_DOT.y}
          r={76 * state.ringScale}
          fill="none"
          stroke={LOOP_COLORS.highlight}
          strokeOpacity={0.16 * state.ringOpacity}
          strokeWidth="10"
          strokeDasharray="38 22"
        />
        <circle
          cx={state.dot.x}
          cy={state.dot.y}
          r={42 * state.dotScale}
          fill={LOOP_COLORS.highlight}
          opacity={0.16}
          filter="url(#mv-brand-loop-glow)"
        />
        <circle
          cx={state.dot.x}
          cy={state.dot.y}
          r={28 * state.dotScale}
          fill={LOOP_COLORS.highlight}
        />
      </svg>
    </AbsoluteFill>
  );
};
