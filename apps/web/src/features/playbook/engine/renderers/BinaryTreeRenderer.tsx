import { useMemo } from "react";
import { interpolate, spring } from "remotion";
import { hierarchy, tree, type HierarchyPointNode } from "d3-hierarchy";
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
const NODE_STAGGER = 4;
const EDGE_STAGGER = 3;

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

export function BinaryTreeRenderer({
  step,
  frame,
  stepStartFrame,
  theme,
}: RendererProps) {
  const snap = step.snapshot as AlgorithmTreeSnapshot;
  const colors = PALETTE[theme];
  const elapsed = Math.max(0, frame - stepStartFrame);

  const layout = useMemo(() => {
    const root = buildTree(snap);
    if (!root) return null;
    const h = hierarchy(root);
    const t = tree<TreeNode>().size([SVG_W - 80, SVG_H - 80]);
    return t(h);
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

  // pre-order traversal: parent appears before children, ensuring grow-from-parent timing
  const nodeIndexById = new Map<string, number>();
  nodes.forEach((n, i) => nodeIndexById.set(n.data.id, i));

  // pulse cycle (0..1..0) every 30 frames; phase-shifted so it starts at 0 to avoid initial flash
  const pulseRaw = (Math.sin((elapsed / 30) * Math.PI * 2 - Math.PI / 2) + 1) / 2;
  // gate by a short fade-in so the halo is invisible during the first few frames
  const pulseGate = Math.min(1, elapsed / 15);
  const pulse = pulseRaw * pulseGate;

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
          <filter id="bt-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <g transform="translate(40,40)">
          {/* Edges — stroke-dasharray draw animation, parent index controls timing */}
          {links.map((link) => {
            const edgeId = `${link.source.data.id}-${link.target.data.id}`;
            const isPath = snap.path_edge_ids.includes(edgeId);
            const targetIdx = nodeIndexById.get(link.target.data.id) ?? 0;
            // edge appears alongside its child node
            const drawProgress = spring({
              frame: Math.max(0, elapsed - targetIdx * EDGE_STAGGER),
              fps: 30,
              config: { stiffness: 100, damping: 22 },
            });
            const dx = link.target.x - link.source.x;
            const dy = link.target.y - link.source.y;
            const length = Math.sqrt(dx * dx + dy * dy);
            const dashOffset = interpolate(drawProgress, [0, 1], [length, 0], {
              extrapolateRight: "clamp",
            });
            return (
              <line
                key={edgeId}
                x1={link.source.x}
                y1={link.source.y}
                x2={link.target.x}
                y2={link.target.y}
                stroke={isPath ? colors.path : colors.edge}
                strokeWidth={isPath ? 3 : 1.5}
                strokeDasharray={length}
                strokeDashoffset={dashOffset}
                filter={isPath ? "url(#bt-glow)" : undefined}
                opacity={drawProgress}
              />
            );
          })}

          {/* Nodes — grow from parent position with scale + position interpolation */}
          {nodes.map((node: HierarchyPointNode<TreeNode>, i) => {
            const isActive = snap.active_node_ids.includes(node.data.id);
            const isVisited = snap.visited_node_ids.includes(node.data.id);

            const localFrame = Math.max(0, elapsed - i * NODE_STAGGER);
            const progress = spring({
              frame: localFrame,
              fps: 30,
              config: { stiffness: 110, damping: 18 },
            });

            const startX = node.parent ? node.parent.x : node.x;
            const startY = node.parent ? node.parent.y : node.y;
            const cx = interpolate(progress, [0, 1], [startX, node.x]);
            const cy = interpolate(progress, [0, 1], [startY, node.y]);
            const scale = node.parent ? progress : interpolate(progress, [0, 1], [0.4, 1]);

            let fill: string = colors.nodeFill;
            let stroke: string = colors.nodeBorder;
            let textFill: string = colors.nodeText;
            if (isActive) {
              fill = `${colors.active}22`;
              stroke = colors.active;
              textFill = colors.active;
            } else if (isVisited) {
              stroke = colors.visited;
            }

            return (
              <g key={node.data.id} transform={`translate(${cx},${cy}) scale(${scale})`} opacity={progress}>
                {isActive && (
                  <circle
                    r={NODE_R + 6 + pulse * 6}
                    fill="none"
                    stroke={colors.active}
                    strokeWidth={2}
                    opacity={0.5 - pulse * 0.35}
                  />
                )}
                <circle
                  r={NODE_R}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={isActive ? 2 : 1.5}
                  filter={isActive ? "url(#bt-glow)" : undefined}
                />
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
}
