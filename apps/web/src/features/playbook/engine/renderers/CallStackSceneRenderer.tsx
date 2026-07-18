import React from "react";
import type { CallStackFrame, CallStackSceneSnapshot } from "../types";
import type { RendererProps } from "./types";

const SVG_W = 900;
const SVG_H = 506;

const COLORS = {
  dark: {
    bg: "#0a0c10",
    panel: "#141922",
    ink: "#e8ecf4",
    muted: "#9aa4b2",
    line: "#303846",
    accent: "#58a6ff",
  },
  light: {
    bg: "#f5f7fa",
    panel: "#ffffff",
    ink: "#172033",
    muted: "#60708a",
    line: "#d7dde6",
    accent: "#0f76a8",
  },
} as const;

function shortLine(line: string): string {
  return line.length > 58 ? `${line.slice(0, 55)}...` : line;
}

function frameLayout(frame: CallStackFrame, index: number) {
  const frameX = 74;
  const frameY = 92;
  const frameW = 250;
  const frameH = 64;
  const frameGap = 18;
  const x = frameX + Math.min(3, Math.max(0, frame.depth)) * 22;
  const y = frameY + 38 + index * (frameH + frameGap);
  return { x, y, width: frameW, height: frameH };
}

function frameTransitionKey(from: CallStackFrame, to: CallStackFrame): string {
  return `${from.id}-to-${to.id}`;
}

export const CallStackSceneRenderer: React.FC<RendererProps> = ({ step, theme }) => {
  const snap = step.snapshot as CallStackSceneSnapshot;
  const colors = COLORS[theme];
  const packId = snap.pack_id ?? "algorithm-code-basic";
  const frames = snap.frames ?? [];
  const codeTrace = snap.code_trace;
  const activeLines = new Set(codeTrace?.active_lines ?? []);
  const codeX = 410;
  const codeY = 88;
  const codeW = 420;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: colors.bg,
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <svg
        className="call-stack-scene"
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        width="100%"
        height="100%"
        data-pack-id={packId}
        data-stack-asset-id={snap.asset_id ?? undefined}
      >
        <defs>
          <marker id="stack-flow-arrow" markerWidth="7" markerHeight="7" refX="5.5" refY="3.5" orient="auto">
            <path d="M0,0 L6,3.5 L0,7 Z" fill={colors.muted} />
          </marker>
        </defs>
        <rect x="0" y="0" width={SVG_W} height={SVG_H} fill={colors.bg} />
        <text x="44" y="50" fill={colors.ink} fontSize="28" fontWeight="760">
          {step.title}
        </text>
        <text x="44" y="474" fill={colors.muted} fontSize="17">
          {snap.caption}
        </text>

        <rect x="46" y="70" width="326" height="354" rx="10" fill={colors.panel} stroke={colors.line} />
        <text x="72" y="112" fill={colors.muted} fontSize="14" fontWeight="700">
          call stack
        </text>
        {frames.slice(0, -1).map((frame, index) => {
          const nextFrame = frames[index + 1];
          const fromLayout = frameLayout(frame, index);
          const toLayout = frameLayout(nextFrame, index + 1);
          const midX = (fromLayout.x + toLayout.x) / 2 + 30;
          const midY = (fromLayout.y + fromLayout.height + toLayout.y) / 2;
          return (
            <g
              key={frameTransitionKey(frame, nextFrame)}
              data-frame-transition={frameTransitionKey(frame, nextFrame)}
            >
              <line
                x1={midX}
                y1={midY - 12}
                x2={midX}
                y2={midY + 12}
                stroke={colors.muted}
                strokeWidth="1.6"
                markerEnd="url(#stack-flow-arrow)"
              />
            </g>
          );
        })}
        {frames.map((frame, index) => {
          const { x, y, width, height } = frameLayout(frame, index);
          const state = frame.id === snap.current_frame_id ? "active" : frame.state ?? "waiting";
          const active = state === "active";
          return (
            <g key={frame.id} data-frame-id={frame.id} data-frame-state={state}>
              <rect
                x={x}
                y={y}
                width={width}
                height={height}
                rx="8"
                fill={active ? `${colors.accent}18` : colors.panel}
                stroke={active ? colors.accent : colors.line}
                strokeWidth={active ? 2 : 1}
              />
              <text x={x + 22} y={y + 29} fill={colors.ink} fontSize="18" fontWeight="740">
                {frame.label}
              </text>
              <text x={x + 22} y={y + 49} fill={colors.muted} fontSize="12">
                depth {frame.depth}
              </text>
              {frame.variables
                ? Object.entries(frame.variables).slice(0, 2).map(([name, value], varIndex) => (
                    <text
                      key={`${frame.id}-${name}`}
                      x={x + 136}
                      y={y + 35 + varIndex * 16}
                      fill={colors.muted}
                      fontSize="12"
                    >
                      {name} = {value}
                    </text>
                  ))
                : null}
            </g>
          );
        })}

        <rect x={codeX - 24} y={70} width="468" height="354" rx="10" fill={colors.panel} stroke={colors.line} />
        <text x={codeX} y="112" fill={colors.muted} fontSize="14" fontWeight="700">
          {codeTrace?.language ?? "code"} trace
        </text>
        {(codeTrace?.lines ?? []).map((line, index) => {
          const y = codeY + 50 + index * 34;
          const active = activeLines.has(index) || codeTrace?.active_line === index;
          return (
            <g key={`${index}-${line}`} data-code-line={index} data-code-line-state={active ? "active" : "idle"}>
              {active ? (
                <rect
                  x={codeX - 10}
                  y={y - 23}
                  width={codeW}
                  height={30}
                  rx="5"
                  fill={`${colors.accent}16`}
                  stroke={colors.accent}
                  strokeWidth="1"
                />
              ) : null}
              <text x={codeX} y={y} fill={active ? colors.accent : colors.muted} fontSize="14" fontFamily="monospace">
                {String(index + 1).padStart(2, " ")}
              </text>
              <text x={codeX + 40} y={y} fill={colors.ink} fontSize="14" fontFamily="monospace">
                {shortLine(line)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};
