import React, { useMemo } from "react";
import { interpolate, spring, useVideoConfig } from "remotion";
import { hierarchy, tree } from "d3-hierarchy";
import type { AlgorithmTreeSnapshot } from "../types";
import type { RendererProps } from "./types";
import { THEME_PALETTE } from "../../../../shared/config/themePalette";

function soft(color: string, strength: number): string {
  return `color-mix(in srgb, ${color} ${strength}%, transparent)`;
}

function buildPalette(theme: "dark" | "light") {
  const palette = THEME_PALETTE[theme];
  const surface = theme === "dark" ? "#111715" : "#ffffff";
  const primary = `var(--canvas-primary, ${palette.canvasPrimary})`;
  const secondary = `var(--canvas-secondary, ${palette.canvasSecondary})`;
  const focus = `var(--canvas-focus, ${palette.canvasFocus})`;
  return {
    bg: `var(--surface-2, ${palette.surface2})`,
    nodeFill: `var(--surface, ${surface})`,
    nodeBorder: `var(--line, ${palette.line})`,
    nodeText: `var(--ink, ${palette.ink})`,
    edge: `var(--canvas-axis, ${palette.canvasAxis})`,
    active: focus,
    activePulse: soft(focus, 18),
    visited: secondary,
    path: primary,
    pathGlow: soft(primary, 38),
    narration: `var(--ink-2, ${palette.ink2})`,
    title: `var(--ink, ${palette.ink})`,
  } as const;
}

const PALETTE = {
  dark: buildPalette("dark"),
  light: buildPalette("light"),
} as const;

const SVG_W = 880;
const SVG_H = 380;
const NODE_R = 22;
const EDGE_STAGGER = 3; // frames between edge reveals
const NODE_STAGGER = 4; // frames between node reveals
const PULSE_PERIOD = 50; // frames per pulse cycle

interface TreeNode {
  id: string;
  label: string;
  children: TreeNode[];
  depth?: number;
}

function buildTree(snap: AlgorithmTreeSnapshot): TreeNode | null {
  if (!snap.nodes.length) return null;
  const nodeMap = new Map<string, TreeNode>(
    snap.nodes.map((n) => [n.id, { id: n.id, label: n.label, children: [] }])
  );
  const childIds = new Set<string>();
  for (const e of snap.edges) {
    const parent = nodeMap.get(e.from_id);
    const child = nodeMap.get(e.to_id);
    if (parent && child) {
      parent.children.push(child);
      childIds.add(e.to_id);
    }
  }
  const roots = snap.nodes.filter((n) => !childIds.has(n.id));
  if (!roots.length) return nodeMap.get(snap.nodes[0].id) ?? null;
  return nodeMap.get(roots[0].id) ?? null;
}

export const BinaryTreeRenderer: React.FC<RendererProps> = ({
  step,
  frame,
  stepStartFrame,
  theme,
}) => {
  const snap = step.snapshot as AlgorithmTreeSnapshot;
  const colors = PALETTE[theme];
  const elapsed = Math.max(0, frame - stepStartFrame);
  const { fps } = useVideoConfig();

  const layout = useMemo(() => {
    const root = buildTree(snap);
    if (!root) return null;
    const h = hierarchy(root);
    const t = tree<TreeNode>().size([SVG_W - 80, SVG_H - 80]);
    return t(h);
  }, [snap]);

  const titleOpacity = spring({ frame: elapsed, fps, config: { stiffness: 80, damping: 20 } });

  if (!layout) {
    return (
      <div style={{ background: colors.bg, width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: colors.narration, fontFamily: "system-ui", fontSize: 16 }}>{step.voiceover_text}</p>
      </div>
    );
  }

  const nodes = layout.descendants();
  const links = layout.links();

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: colors.bg,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui, sans-serif",
        gap: 16,
        padding: "16px 40px",
      }}
    >
      <h2 style={{ color: colors.title, fontSize: 20, fontWeight: 700, margin: 0, opacity: titleOpacity }}>
        {step.title}
      </h2>

      <svg width={SVG_W} height={SVG_H} viewBox={`0 0 ${SVG_W} ${SVG_H}`}>
        <defs>
          {/* Glow filter for path edges */}
          <filter id="edge-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {/* Pulse filter for active nodes */}
          <filter id="node-glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <g transform="translate(40,40)">
          {/* Edges — drawn with stroke-dasharray animation */}
          {links.map((link, i) => {
            const edgeId = `${link.source.data.id}-${link.target.data.id}`;
            const isPath = snap.path_edge_ids.includes(edgeId);
            const edgeElapsed = Math.max(0, elapsed - i * EDGE_STAGGER);

            const dx = link.target.x - link.source.x;
            const dy = link.target.y - link.source.y;
            const edgeLen = Math.sqrt(dx * dx + dy * dy);

            const drawProgress = spring({
              frame: edgeElapsed,
              fps,
              config: { stiffness: 120, damping: 20 },
            });
            const drawnLen = drawProgress * edgeLen;

            return (
              <line
                key={edgeId}
                x1={link.source.x}
                y1={link.source.y}
                x2={link.target.x}
                y2={link.target.y}
                stroke={isPath ? colors.path : colors.edge}
                strokeWidth={isPath ? 2.5 : 1.5}
                strokeDasharray={`${edgeLen}`}
                strokeDashoffset={edgeLen - drawnLen}
                filter={isPath ? "url(#edge-glow)" : undefined}
                opacity={isPath ? 1 : drawProgress}
              />
            );
          })}

          {/* Nodes — grow from parent position */}
          {nodes.map((node, i) => {
            const isActive = snap.active_node_ids.includes(node.data.id);
            const isVisited = snap.visited_node_ids.includes(node.data.id);
            const nodeElapsed = Math.max(0, elapsed - i * NODE_STAGGER);
            const nodeProgress = spring({
              frame: nodeElapsed,
              fps,
              config: { stiffness: 110, damping: 18 },
            });

            // Grow from parent position for non-root nodes
            let cx = node.x;
            let cy = node.y;
            if (node.depth > 0 && node.parent) {
              cx = interpolate(nodeProgress, [0, 1], [node.parent.x, node.x]);
              cy = interpolate(nodeProgress, [0, 1], [node.parent.y, node.y]);
            }

            const nodeScale = interpolate(nodeProgress, [0, 1], [0, 1]);
            const nodeOpacity = nodeProgress;

            let fill: string = colors.nodeFill;
            let stroke: string = colors.nodeBorder;
            let textFill: string = colors.nodeText;
            if (isActive) {
              fill = soft(colors.active, 13);
              stroke = colors.active;
              textFill = colors.active;
            } else if (isVisited) {
              stroke = colors.visited;
            }

            // Pulse ring for active nodes
            const pulsePhase = elapsed % PULSE_PERIOD;
            const pulseScale = isActive
              ? 1 + 0.35 * interpolate(pulsePhase, [0, PULSE_PERIOD / 2, PULSE_PERIOD], [0, 1, 0])
              : 1;
            const pulseOpacity = isActive
              ? interpolate(pulsePhase, [0, PULSE_PERIOD / 2, PULSE_PERIOD], [0.6, 0, 0.6])
              : 0;

            return (
              <g
                key={node.data.id}
                transform={`translate(${cx},${cy})`}
                opacity={nodeOpacity}
                filter={isActive ? "url(#node-glow)" : undefined}
              >
                {/* Pulse ring */}
                {isActive && (
                  <circle
                    r={NODE_R * pulseScale}
                    fill={colors.activePulse}
                    stroke={colors.active}
                    strokeWidth={1}
                    opacity={pulseOpacity}
                  />
                )}
                {/* Node circle */}
                <circle
                  r={NODE_R}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={isActive ? 2 : 1.5}
                  transform={`scale(${nodeScale})`}
                />
                <text
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill={textFill}
                  fontSize={Math.min(14, Math.floor(NODE_R * 0.9))}
                  fontWeight={isActive ? 700 : 400}
                  transform={`scale(${nodeScale})`}
                >
                  {node.data.label}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

    </div>
  );
};
