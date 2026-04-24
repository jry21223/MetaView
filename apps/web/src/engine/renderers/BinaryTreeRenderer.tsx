import React, { useMemo } from "react";
import { spring, useCurrentFrame } from "remotion";
import { hierarchy, tree } from "d3-hierarchy";
import type { AlgorithmTreeSnapshot } from "../types";
import type { RendererProps } from "./types";

const PALETTE = {
  dark: {
    bg: "#0a0c10",
    nodeFill: "#1a1e27",
    nodeBorder: "rgba(255,255,255,0.12)",
    nodeText: "#e8ecf4",
    edge: "rgba(255,255,255,0.15)",
    active: "#4de8b0",
    visited: "rgba(255,255,255,0.25)",
    path: "#c8a8f8",
    narration: "rgba(232,236,244,0.6)",
    title: "#e8ecf4",
  },
  light: {
    bg: "#f5f7fa",
    nodeFill: "#ffffff",
    nodeBorder: "rgba(0,0,0,0.1)",
    nodeText: "#141820",
    edge: "rgba(0,0,0,0.15)",
    active: "#00896e",
    visited: "rgba(0,0,0,0.25)",
    path: "#6030c0",
    narration: "rgba(20,24,32,0.6)",
    title: "#141820",
  },
} as const;

const SVG_W = 880;
const SVG_H = 380;
const NODE_R = 22;

interface TreeNode {
  id: string;
  label: string;
  children: TreeNode[];
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

  const layout = useMemo(() => {
    const root = buildTree(snap);
    if (!root) return null;
    const h = hierarchy(root);
    const t = tree<TreeNode>().size([SVG_W - 80, SVG_H - 80]);
    const laid = t(h);
    return laid;
  }, [snap]);

  const titleOpacity = spring({ frame: elapsed, fps: 30, config: { stiffness: 80, damping: 20 } });

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
        <g transform="translate(40,40)">
          {/* Edges */}
          {links.map((link, i) => {
            const edgeId = `${link.source.data.id}-${link.target.data.id}`;
            const isPath = snap.path_edge_ids.includes(edgeId);
            const edgeOpacity = spring({
              frame: Math.max(0, elapsed - i * 3),
              fps: 30,
              config: { stiffness: 100, damping: 20 },
            });
            return (
              <line
                key={edgeId}
                x1={link.source.x}
                y1={link.source.y}
                x2={link.target.x}
                y2={link.target.y}
                stroke={isPath ? colors.path : colors.edge}
                strokeWidth={isPath ? 2.5 : 1.5}
                opacity={edgeOpacity}
              />
            );
          })}

          {/* Nodes */}
          {nodes.map((node, i) => {
            const isActive = snap.active_node_ids.includes(node.data.id);
            const isVisited = snap.visited_node_ids.includes(node.data.id);
            const nodeOpacity = spring({
              frame: Math.max(0, elapsed - i * 4),
              fps: 30,
              config: { stiffness: 110, damping: 18 },
            });
            let fill: string = colors.nodeFill;
            let stroke: string = colors.nodeBorder;
            let textFill: string = colors.nodeText;
            if (isActive) { fill = `${colors.active}22`; stroke = colors.active; textFill = colors.active; }
            else if (isVisited) { stroke = colors.visited; }

            return (
              <g key={node.data.id} transform={`translate(${node.x},${node.y})`} opacity={nodeOpacity}>
                <circle r={NODE_R} fill={fill} stroke={stroke} strokeWidth={1.5} />
                <text
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill={textFill}
                  fontSize={Math.min(14, Math.floor(NODE_R * 0.9))}
                  fontWeight={isActive ? 700 : 400}
                >
                  {node.data.label}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      <p
        style={{
          color: colors.narration,
          fontSize: 14,
          maxWidth: 720,
          textAlign: "center",
          lineHeight: 1.6,
          margin: 0,
          opacity: spring({ frame: Math.max(0, elapsed - 10), fps: 30, config: { stiffness: 60, damping: 20 } }),
        }}
      >
        {step.voiceover_text}
      </p>
    </div>
  );
};
