import React from "react";
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

export const BrandLogoLoop: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const state = getBrandLogoLoopState(frame, fps);
  const yellow = "#f7d65c";

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
            <stop offset="0" stopColor="#4de8b0" />
            <stop offset="0.72" stopColor="#4de8b0" />
            <stop offset="0.9" stopColor="#8ff5cf" />
            <stop offset="1" stopColor={yellow} />
          </linearGradient>
          <filter id="mv-brand-loop-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="8" result="blur" />
            <feColorMatrix
              in="blur"
              type="matrix"
              values="0 0 0 0 0.968 0 0 0 0 0.839 0 0 0 0 0.361 0 0 0 0.72 0"
            />
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <rect x="48" y="48" width="544" height="544" rx="72" fill="#0a1110" />
        <path
          d={BORDER_PATH}
          fill="none"
          stroke="#12b886"
          strokeOpacity={state.guideOpacity}
          strokeWidth="12"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d={BORDER_PATH}
          fill="none"
          stroke={yellow}
          strokeOpacity={0.62 * state.logoOpacity}
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
          stroke="#083f32"
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
          stroke={yellow}
          strokeOpacity={0.26 * state.logoOpacity}
          strokeWidth="84"
          strokeLinecap="round"
        />
        <path
          d="M492 384L530 300"
          fill="none"
          stroke="#fff2a5"
          strokeOpacity={0.55 * state.logoOpacity}
          strokeWidth="18"
          strokeLinecap="round"
        />

        <circle
          cx={BRAND_LOGO_LOOP_FINAL_DOT.x}
          cy={BRAND_LOGO_LOOP_FINAL_DOT.y}
          r={76 * state.ringScale}
          fill="none"
          stroke={yellow}
          strokeOpacity={0.22 * state.ringOpacity}
          strokeWidth="10"
          strokeDasharray="38 22"
        />
        <circle
          cx={state.dot.x}
          cy={state.dot.y}
          r={42 * state.dotScale}
          fill={yellow}
          opacity={0.26}
          filter="url(#mv-brand-loop-glow)"
        />
        <circle
          cx={state.dot.x}
          cy={state.dot.y}
          r={28 * state.dotScale}
          fill={yellow}
        />
      </svg>
    </AbsoluteFill>
  );
};
