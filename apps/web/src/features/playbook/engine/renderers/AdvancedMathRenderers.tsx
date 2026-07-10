import React from "react";
import "katex/dist/katex.min.css";
import type {
  ChartPoint,
  ChartSeries,
  ComplexPlaneSceneSnapshot,
  GraphSceneSnapshot,
  IterationTraceSceneSnapshot,
  ManifoldSceneSnapshot,
  MatrixSceneSnapshot,
  ModelingSceneSnapshot,
  OptimizationSceneSnapshot,
  PhasePortraitSceneSnapshot,
  SceneCellValue,
  StatsChartSceneSnapshot,
  TableSceneSnapshot,
} from "../types";
import { clamp01 } from "../foundation";
import { sanitizeKatex } from "../../../../shared/lib/sanitizeKatex";
import { AssetSvg } from "../assets/AssetSvg";
import { resolveAssetById, resolveAssetByRole, resolveAssetForRenderer } from "../assets/assetResolver";
import type { RendererProps } from "./types";

type ThemeName = "dark" | "light";

const SVG_W = 900;
const SVG_H = 520;
const PLOT = { left: 78, right: 34, top: 50, bottom: 58 };

interface Palette {
  bg: string;
  card: string;
  line: string;
  grid: string;
  ink: string;
  muted: string;
  primary: string;
  secondary: string;
  accent: string;
  warn: string;
}

const PALETTE: Record<ThemeName, Palette> = {
  dark: {
    bg: "#10141f",
    card: "rgba(255,255,255,0.055)",
    line: "rgba(255,255,255,0.16)",
    grid: "rgba(255,255,255,0.08)",
    ink: "#f5f7fb",
    muted: "#aab4c8",
    primary: "#72ddf7",
    secondary: "#a78bfa",
    accent: "#fbbf24",
    warn: "#fb7185",
  },
  light: {
    bg: "#f6f8fb",
    card: "rgba(255,255,255,0.9)",
    line: "rgba(20,32,54,0.14)",
    grid: "rgba(20,32,54,0.08)",
    ink: "#182235",
    muted: "#64748b",
    primary: "#0f76a8",
    secondary: "#7c3aed",
    accent: "#c27803",
    warn: "#be123c",
  },
};

function progressOpacity(frame: number, stepStartFrame: number, delay = 0): number {
  return clamp01((Math.max(0, frame - stepStartFrame) - delay) / 14);
}

function Shell({
  title,
  caption,
  formula,
  theme,
  children,
}: {
  title: string;
  caption?: string | null;
  formula?: string | null;
  theme: ThemeName;
  children: React.ReactNode;
}) {
  const colors = PALETTE[theme];
  const formulaHtml = formula ? sanitizeKatex(formula, { displayMode: false }) : "";
  return (
    <div
      className="advanced-math-renderer"
      data-theme={theme}
      style={{
        width: "100%",
        height: "100%",
        padding: 28,
        boxSizing: "border-box",
        background: colors.bg,
        color: colors.ink,
        display: "grid",
        gridTemplateRows: "auto 1fr auto",
        gap: 14,
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 18, alignItems: "center" }}>
        <div style={{ fontSize: 26, fontWeight: 760, letterSpacing: 0 }}>{title}</div>
        {formulaHtml ? (
          <div
            style={{
              border: `1px solid ${colors.line}`,
              borderRadius: 8,
              padding: "8px 12px",
              background: colors.card,
              maxWidth: "46%",
              overflow: "hidden",
              whiteSpace: "nowrap",
            }}
            dangerouslySetInnerHTML={{ __html: formulaHtml }}
          />
        ) : null}
      </div>
      <div style={{ minHeight: 0 }}>{children}</div>
      <div style={{ minHeight: 22, color: colors.muted, fontSize: 16 }}>{caption}</div>
    </div>
  );
}

function valueText(value: SceneCellValue | null | undefined): string {
  if (value == null) return "";
  return String(value);
}

function isActiveCell(
  row: number,
  col: number,
  activeRows: number[] | undefined,
  activeColumns: number[] | undefined,
  activeCells: Array<[number, number]> | undefined,
): boolean {
  return Boolean(
    activeRows?.includes(row) ||
      activeColumns?.includes(col) ||
      activeCells?.some(([r, c]) => r === row && c === col),
  );
}

function GridTable({
  columns,
  rows,
  activeRows,
  activeColumns,
  activeCells,
  theme,
  rowLabels,
}: {
  columns?: string[];
  rows: SceneCellValue[][];
  activeRows?: number[];
  activeColumns?: number[];
  activeCells?: Array<[number, number]>;
  theme: ThemeName;
  rowLabels?: string[];
}) {
  const colors = PALETTE[theme];
  const maxCols = Math.max(columns?.length ?? 0, ...rows.map((row) => row.length), 1);
  const gridTemplateColumns = `${rowLabels?.length ? "minmax(52px, 0.45fr) " : ""}repeat(${maxCols}, minmax(64px, 1fr))`;
  return (
    <div
      style={{
        height: "100%",
        display: "grid",
        alignContent: "center",
        justifyItems: "center",
      }}
    >
      <div style={{ width: "min(92%, 960px)" }}>
        {columns?.length ? (
          <div style={{ display: "grid", gridTemplateColumns, gap: 8, marginBottom: 8 }}>
            {rowLabels?.length ? <div /> : null}
            {Array.from({ length: maxCols }).map((_, col) => (
              <div key={col} style={{ color: colors.muted, fontSize: 14, textAlign: "center" }}>
                {columns[col] ?? ""}
              </div>
            ))}
          </div>
        ) : null}
        <div style={{ display: "grid", gap: 8 }}>
          {rows.length ? rows.map((row, rowIndex) => (
            <div key={rowIndex} style={{ display: "grid", gridTemplateColumns, gap: 8 }}>
              {rowLabels?.length ? (
                <div style={{ color: colors.muted, fontSize: 14, alignSelf: "center", textAlign: "center" }}>
                  {rowLabels[rowIndex] ?? ""}
                </div>
              ) : null}
              {Array.from({ length: maxCols }).map((_, colIndex) => {
                const active = isActiveCell(rowIndex, colIndex, activeRows, activeColumns, activeCells);
                return (
                  <div
                    key={colIndex}
                    style={{
                      minHeight: 58,
                      border: `1px solid ${active ? colors.accent : colors.line}`,
                      borderRadius: 8,
                      background: active ? `${colors.accent}24` : colors.card,
                      display: "grid",
                      placeItems: "center",
                      fontSize: 22,
                      fontWeight: active ? 760 : 620,
                    }}
                  >
                    {valueText(row[colIndex])}
                  </div>
                );
              })}
            </div>
          )) : (
            <div style={{ color: colors.muted, textAlign: "center", padding: 36 }}>No data</div>
          )}
        </div>
      </div>
    </div>
  );
}

export const MatrixSceneRenderer: React.FC<RendererProps> = ({ step, frame, stepStartFrame, theme }) => {
  const snap = step.snapshot as MatrixSceneSnapshot;
  const caption = [snap.operation_label, snap.caption].filter(Boolean).join(" - ");
  return (
    <div style={{ opacity: progressOpacity(frame, stepStartFrame) }}>
      <Shell title={step.title} caption={caption} formula={snap.formula_latex} theme={theme}>
        <GridTable
          rows={snap.matrix ?? []}
          columns={snap.col_labels}
          rowLabels={snap.row_labels}
          activeRows={snap.active_rows}
          activeColumns={snap.active_columns}
          activeCells={snap.active_cells}
          theme={theme}
        />
      </Shell>
    </div>
  );
};

export const TableSceneRenderer: React.FC<RendererProps> = ({ step, frame, stepStartFrame, theme }) => {
  const snap = step.snapshot as TableSceneSnapshot;
  return (
    <div style={{ opacity: progressOpacity(frame, stepStartFrame) }}>
      <Shell title={step.title} caption={snap.caption} theme={theme}>
        <GridTable
          rows={snap.rows ?? []}
          columns={snap.columns}
          activeRows={snap.active_rows}
          activeColumns={snap.active_columns}
          activeCells={snap.active_cells}
          theme={theme}
        />
      </Shell>
    </div>
  );
};

function sx(x: number, xMin: number, xMax: number): number {
  return PLOT.left + ((x - xMin) / (xMax - xMin || 1)) * (SVG_W - PLOT.left - PLOT.right);
}

function sy(y: number, yMin: number, yMax: number): number {
  return PLOT.top + ((yMax - y) / (yMax - yMin || 1)) * (SVG_H - PLOT.top - PLOT.bottom);
}

function AxisFrame({ theme, xMin, xMax, yMin, yMax }: { theme: ThemeName; xMin: number; xMax: number; yMin: number; yMax: number }) {
  const colors = PALETTE[theme];
  const xTicks = [xMin, (xMin + xMax) / 2, xMax];
  const yTicks = [yMin, (yMin + yMax) / 2, yMax];
  return (
    <>
      <rect x={PLOT.left} y={PLOT.top} width={SVG_W - PLOT.left - PLOT.right} height={SVG_H - PLOT.top - PLOT.bottom} fill="transparent" stroke={colors.line} />
      {xTicks.map((tick) => (
        <g key={`x-${tick}`}>
          <line x1={sx(tick, xMin, xMax)} x2={sx(tick, xMin, xMax)} y1={PLOT.top} y2={SVG_H - PLOT.bottom} stroke={colors.grid} />
          <text x={sx(tick, xMin, xMax)} y={SVG_H - 25} fill={colors.muted} fontSize={12} textAnchor="middle">{tick.toFixed(1)}</text>
        </g>
      ))}
      {yTicks.map((tick) => (
        <g key={`y-${tick}`}>
          <line x1={PLOT.left} x2={SVG_W - PLOT.right} y1={sy(tick, yMin, yMax)} y2={sy(tick, yMin, yMax)} stroke={colors.grid} />
          <text x={44} y={sy(tick, yMin, yMax) + 4} fill={colors.muted} fontSize={12} textAnchor="end">{tick.toFixed(1)}</text>
        </g>
      ))}
      {xMin < 0 && xMax > 0 ? <line x1={sx(0, xMin, xMax)} x2={sx(0, xMin, xMax)} y1={PLOT.top} y2={SVG_H - PLOT.bottom} stroke={colors.line} /> : null}
      {yMin < 0 && yMax > 0 ? <line x1={PLOT.left} x2={SVG_W - PLOT.right} y1={sy(0, yMin, yMax)} y2={sy(0, yMin, yMax)} stroke={colors.line} /> : null}
    </>
  );
}

function pointsPath(points: Array<[number, number]>, xMin: number, xMax: number, yMin: number, yMax: number): string {
  return points.map(([x, y]) => `${sx(x, xMin, xMax).toFixed(1)},${sy(y, yMin, yMax).toFixed(1)}`).join(" ");
}

function chartPoints(series: ChartSeries): ChartPoint[] {
  if (series.points?.length) return series.points;
  return (series.values ?? []).map((value, index) => ({ x: index, y: value }));
}

function chartBounds(series: ChartSeries[]): { xMin: number; xMax: number; yMin: number; yMax: number } {
  const points = series.flatMap(chartPoints);
  if (!points.length) return { xMin: 0, xMax: 1, yMin: 0, yMax: 1 };
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(0, Math.min(...ys));
  const yMax = Math.max(1, Math.max(...ys));
  return {
    xMin: xMin === xMax ? xMin - 1 : xMin,
    xMax: xMin === xMax ? xMax + 1 : xMax,
    yMin: yMin === yMax ? yMin - 1 : yMin,
    yMax: yMin === yMax ? yMax + 1 : yMax,
  };
}

export const StatsChartSceneRenderer: React.FC<RendererProps> = ({ step, frame, stepStartFrame, theme }) => {
  const snap = step.snapshot as StatsChartSceneSnapshot;
  const colors = PALETTE[theme];
  const bounds = chartBounds(snap.series ?? []);
  const reveal = progressOpacity(frame, stepStartFrame, 4);
  return (
    <Shell title={step.title} caption={snap.caption} formula={snap.formula_latex} theme={theme}>
      <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} width="100%" height="100%">
        <AxisFrame theme={theme} {...bounds} />
        {(snap.series ?? []).map((series, seriesIndex) => {
          const pts = chartPoints(series);
          const color = series.emphasis === "accent" ? colors.accent : series.emphasis === "secondary" ? colors.secondary : colors.primary;
          if ((snap.chart_type ?? "line") === "bar" || (snap.chart_type ?? "line") === "histogram") {
            const barW = Math.max(8, (SVG_W - PLOT.left - PLOT.right) / Math.max(pts.length * 1.8, 1));
            return pts.map((point, index) => (
              <rect
                key={`${series.label}-${index}`}
                x={sx(point.x, bounds.xMin, bounds.xMax) - barW / 2}
                y={sy(point.y * reveal, bounds.yMin, bounds.yMax)}
                width={barW}
                height={Math.max(0, sy(0, bounds.yMin, bounds.yMax) - sy(point.y * reveal, bounds.yMin, bounds.yMax))}
                fill={color}
                opacity={0.78}
                rx={4}
              />
            ));
          }
          return (
            <polyline
              key={series.label || seriesIndex}
              points={pointsPath(pts.slice(0, Math.max(1, Math.ceil(pts.length * reveal))).map((p) => [p.x, p.y]), bounds.xMin, bounds.xMax, bounds.yMin, bounds.yMax)}
              fill="none"
              stroke={color}
              strokeWidth={4}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        })}
      </svg>
    </Shell>
  );
};

export const IterationTraceSceneRenderer: React.FC<RendererProps> = ({ step, frame, stepStartFrame, theme }) => {
  const snap = step.snapshot as IterationTraceSceneSnapshot;
  const colors = PALETTE[theme];
  const rows = (snap.iterations ?? []).map((item) => [item.index, valueText(item.value), item.error ?? "", item.label ?? ""]);
  const visibleCount = Math.max(1, Math.ceil(rows.length * progressOpacity(frame, stepStartFrame, 4)));
  const series: ChartSeries = {
    label: snap.metric_name ?? "metric",
    points: (snap.iterations ?? [])
      .filter((item) => typeof item.error === "number" && Number.isFinite(item.error))
      .map((item) => ({ x: item.index, y: item.error as number })),
  };
  return (
    <Shell title={step.title} caption={snap.caption} formula={snap.formula_latex} theme={theme}>
      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 18, height: "100%" }}>
        <GridTable
          rows={rows.slice(0, visibleCount)}
          columns={["i", "value", snap.metric_name ?? "metric", "note"]}
          activeRows={snap.current_index != null ? [snap.current_index] : []}
          theme={theme}
        />
        <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} width="100%" height="100%">
          <AxisFrame theme={theme} {...chartBounds([series])} />
          <polyline
            points={pointsPath(chartPoints(series).map((p) => [p.x, p.y]), chartBounds([series]).xMin, chartBounds([series]).xMax, chartBounds([series]).yMin, chartBounds([series]).yMax)}
            fill="none"
            stroke={colors.accent}
            strokeWidth={4}
          />
        </svg>
      </div>
    </Shell>
  );
};

export const GraphSceneRenderer: React.FC<RendererProps> = ({ step, frame, stepStartFrame, theme }) => {
  const snap = step.snapshot as GraphSceneSnapshot;
  return (
    <Shell title={step.title} caption={snap.caption} theme={theme}>
      <GraphSvg graph={snap} theme={theme} opacity={progressOpacity(frame, stepStartFrame)} />
    </Shell>
  );
};

function GraphSvg({ graph, theme, opacity = 1 }: { graph: GraphSceneSnapshot; theme: ThemeName; opacity?: number }) {
  const colors = PALETTE[theme];
  const nodes = graph.nodes ?? [];
  const projectCompactCoords = shouldProjectCompactGraphCoords(nodes);
  const positioned = nodes.map((node, index) => {
    const angle = (index / Math.max(nodes.length, 1)) * Math.PI * 2 - Math.PI / 2;
    const fallback = {
      x: 450 + Math.cos(angle) * 260,
      y: 245 + Math.sin(angle) * 170,
    };
    const hasExplicitPosition = typeof node.x === "number" && typeof node.y === "number";
    const projected = hasExplicitPosition
      ? projectGraphPoint(node.x as number, node.y as number, projectCompactCoords)
      : fallback;
    return {
      ...node,
      x: projected.x,
      y: projected.y,
    };
  });
  const activeNodes = new Set(graph.active_node_ids ?? []);
  const currentNodes = new Set([
    ...activeNodes,
    ...(graph.current_node_id ? [graph.current_node_id] : []),
  ]);
  const visitedNodes = new Set(graph.visited_node_ids ?? []);
  const queueNodes = new Set([
    ...(graph.queue_node_ids ?? []),
    ...(graph.frontier_node_ids ?? []),
  ]);
  const activeEdges = new Set(graph.active_edge_ids ?? []);
  const packId = graph.pack_id ?? "algorithm-code-basic";
  const graphAsset = graph.asset_id ? resolveAssetById(packId, graph.asset_id) : undefined;
  const showStatePanel = shouldRenderGraphAlgorithmStatePanel(graph, currentNodes, visitedNodes, queueNodes);
  const projection = showStatePanel
    ? { centerX: 312, centerY: 258, xScale: 78, yScale: 66 }
    : { centerX: SVG_W / 2, centerY: SVG_H / 2, xScale: 120, yScale: 82 };
  const layoutPositioned = positioned.map((node) => {
    if (!projectCompactCoords || !showStatePanel || typeof node.x !== "number" || typeof node.y !== "number") {
      return node;
    }
    const source = nodes.find((item) => item.id === node.id);
    if (typeof source?.x !== "number" || typeof source.y !== "number") return node;
    return {
      ...node,
      ...projectGraphPoint(source.x, source.y, projectCompactCoords, projection),
    };
  });
  const layoutById = new Map(layoutPositioned.map((node) => [node.id, node]));
  return (
    <svg
      className="graph-scene-renderer"
      viewBox={`0 0 ${SVG_W} ${SVG_H}`}
      width="100%"
      height="100%"
      data-pack-id={graph.pack_id ?? undefined}
      data-graph-asset-id={graph.asset_id ?? graphAsset?.id ?? undefined}
      data-asset-id={graphAsset?.id ?? undefined}
    >
      <defs>
        <marker id="graph-arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto">
          <path d="M0,0 L0,6 L9,3 z" fill={colors.muted} />
        </marker>
      </defs>
      {(graph.edges ?? []).map((edge, index) => {
        const a = layoutById.get(edge.source);
        const b = layoutById.get(edge.target);
        if (!a || !b) return null;
        const edgeId = edge.id ?? `${edge.source}-${edge.target}`;
        const active = edge.emphasis === "accent" || activeEdges.has(edgeId);
        const edgeAsset = edge.asset_id
          ? resolveAssetById(packId, edge.asset_id)
          : resolveAssetForRenderer("graph_scene", active ? "active_edge" : "graph_edge", packId) ??
            resolveAssetByRole("algorithm", active ? "active_edge" : "graph_edge", packId);
        return (
          <g
            key={`${edge.source}-${edge.target}-${index}`}
            opacity={opacity}
            data-edge-id={edgeId}
            data-edge-state={active ? "active" : "idle"}
            data-asset-id={edgeAsset?.id ?? edge.asset_id ?? undefined}
          >
            <line
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={active ? colors.accent : colors.line}
              strokeWidth={active ? 4 : 2}
              strokeLinecap="round"
              markerEnd={graph.directed ? "url(#graph-arrow)" : undefined}
            />
            {edge.label || edge.weight != null ? (
              <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 8} fill={colors.muted} fontSize={14} textAnchor="middle">
                {edge.label ?? edge.weight}
              </text>
            ) : null}
          </g>
        );
      })}
      {layoutPositioned.map((node) => {
        const state = graphNodeState(node.id, currentNodes, visitedNodes, queueNodes);
        const active = state === "current" || node.emphasis === "accent";
        const nodeAsset = resolveGraphNodeAsset(packId, node.asset_id, state);
        const width = state === "queue" ? 76 : active ? 64 : 58;
        const height = state === "queue" ? 52 : active ? 64 : 58;
        const radius = Math.max(width, height) / 2;
        return (
          <g
            key={node.id}
            opacity={opacity}
            data-node-id={node.id}
            data-node-state={state}
          >
            <circle cx={node.x} cy={node.y} r={radius} fill="transparent" />
            <AssetSvg
              asset={nodeAsset}
              assetId={node.asset_id ?? nodeAsset?.id}
              packId={packId}
              subject="algorithm"
              semanticRole={nodeRoleForState(state)}
              x={node.x - width / 2}
              y={node.y - height / 2}
              width={width}
              height={height}
              fallbackShape={state === "queue" ? "rect" : "circle"}
              className="graph-node-asset"
            />
            <text
              x={node.x}
              y={node.y + 6}
              fill={state === "queue" ? "#7a4b00" : colors.ink}
              fontSize={18}
              fontWeight={760}
              textAnchor="middle"
            >
              {node.label ?? node.id}
            </text>
          </g>
        );
      })}
      {showStatePanel ? (
        <GraphAlgorithmStatePanel
          graph={graph}
          theme={theme}
          currentNodes={[...currentNodes]}
          visitedNodes={[...visitedNodes]}
          queueNodes={[...queueNodes]}
          opacity={opacity}
        />
      ) : null}
    </svg>
  );
}

function shouldRenderGraphAlgorithmStatePanel(
  graph: GraphSceneSnapshot,
  currentNodes: Set<string>,
  visitedNodes: Set<string>,
  queueNodes: Set<string>,
): boolean {
  return Boolean(
    graph.pack_id === "algorithm-code-basic" &&
      (currentNodes.size > 0 || visitedNodes.size > 0 || queueNodes.size > 0 || (graph.active_edge_ids?.length ?? 0) > 0),
  );
}

function GraphAlgorithmStatePanel({
  graph,
  theme,
  currentNodes,
  visitedNodes,
  queueNodes,
  opacity,
}: {
  graph: GraphSceneSnapshot;
  theme: ThemeName;
  currentNodes: string[];
  visitedNodes: string[];
  queueNodes: string[];
  opacity: number;
}) {
  const colors = PALETTE[theme];
  const current = currentNodes[0] ?? graph.current_node_id ?? "node";

  return (
    <g opacity={opacity} data-semantic-role="algorithm_state_panel">
      <rect x="622" y="40" width="246" height="256" rx="14" fill={colors.card} stroke={colors.line} />
      <text x="646" y="76" fill={colors.ink} fontSize="18" fontWeight="760">
        BFS state
      </text>

      <g data-semantic-role="queue_panel">
        <text x="646" y="114" fill={colors.muted} fontSize="13" fontWeight="700">
          Queue
        </text>
        {queueNodes.length ? (
          queueNodes.map((nodeId, index) => (
            <g key={nodeId} data-queue-node-id={nodeId}>
              <rect
                x={646 + index * 54}
                y="126"
                width="42"
                height="30"
                rx="8"
                fill={`${colors.accent}22`}
                stroke={colors.accent}
              />
              <text
                x={667 + index * 54}
                y="146"
                textAnchor="middle"
                fill={colors.ink}
                fontSize="14"
                fontWeight="760"
              >
                {nodeId}
              </text>
            </g>
          ))
        ) : (
          <text x="646" y="146" fill={colors.muted} fontSize="13">
            empty
          </text>
        )}
      </g>

      <g data-semantic-role="visited_set">
        <text x="646" y="194" fill={colors.muted} fontSize="13" fontWeight="700">
          Visited
        </text>
        {visitedNodes.length ? (
          visitedNodes.map((nodeId, index) => (
            <g key={nodeId} data-visited-node-id={nodeId}>
              <circle cx={662 + index * 36} cy="224" r="15" fill={`${colors.secondary}24`} stroke={colors.secondary} />
              <text
                x={662 + index * 36}
                y="229"
                textAnchor="middle"
                fill={colors.ink}
                fontSize="13"
                fontWeight="760"
              >
                {nodeId}
              </text>
            </g>
          ))
        ) : (
          <text x="646" y="226" fill={colors.muted} fontSize="13">
            none
          </text>
        )}
        <text x="646" y="266" fill={colors.muted} fontSize="13" fontWeight="700">
          Current
        </text>
        <text x="714" y="266" fill={colors.accent} fontSize="15" fontWeight="780">
          {current}
        </text>
      </g>
    </g>
  );
}

type GraphNodeVisualState = "current" | "queue" | "visited" | "default";

interface GraphProjection {
  centerX: number;
  centerY: number;
  xScale: number;
  yScale: number;
}

function graphNodeState(
  nodeId: string,
  currentNodes: Set<string>,
  visitedNodes: Set<string>,
  queueNodes: Set<string>,
): GraphNodeVisualState {
  if (currentNodes.has(nodeId)) return "current";
  if (queueNodes.has(nodeId)) return "queue";
  if (visitedNodes.has(nodeId)) return "visited";
  return "default";
}

function nodeRoleForState(state: GraphNodeVisualState): string {
  if (state === "queue") return "queue";
  if (state === "visited") return "visited";
  return "graph_node";
}

function resolveGraphNodeAsset(
  packId: string,
  assetId: string | null | undefined,
  state: GraphNodeVisualState,
) {
  if (assetId) return resolveAssetById(packId, assetId);
  const semanticRole = nodeRoleForState(state);
  return (
    resolveAssetForRenderer("graph_scene", semanticRole, packId) ??
    resolveAssetByRole("algorithm", semanticRole, packId) ??
    resolveAssetForRenderer("graph_scene", "graph_node", packId) ??
    resolveAssetByRole("algorithm", "graph_node", packId)
  );
}

function shouldProjectCompactGraphCoords(nodes: GraphSceneSnapshot["nodes"]): boolean {
  const positioned = nodes.filter((node) => typeof node.x === "number" && typeof node.y === "number");
  if (!positioned.length) return false;
  return positioned.every((node) => Math.abs(node.x as number) <= 12 && Math.abs(node.y as number) <= 12);
}

function projectGraphPoint(
  x: number,
  y: number,
  compact: boolean,
  projection: GraphProjection = { centerX: SVG_W / 2, centerY: SVG_H / 2, xScale: 120, yScale: 82 },
): { x: number; y: number } {
  if (!compact) return { x, y };
  return {
    x: projection.centerX + x * projection.xScale,
    y: projection.centerY + y * projection.yScale,
  };
}

export const PhasePortraitSceneRenderer: React.FC<RendererProps> = ({ step, theme }) => {
  const snap = step.snapshot as PhasePortraitSceneSnapshot;
  const colors = PALETTE[theme];
  const xMin = snap.x_min ?? -5;
  const xMax = snap.x_max ?? 5;
  const yMin = snap.y_min ?? -5;
  const yMax = snap.y_max ?? 5;
  return (
    <Shell title={step.title} caption={snap.caption} formula={snap.formula_latex} theme={theme}>
      <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} width="100%" height="100%">
        <AxisFrame theme={theme} xMin={xMin} xMax={xMax} yMin={yMin} yMax={yMax} />
        {(snap.trajectories ?? []).map((trajectory, index) => (
          <polyline key={index} points={pointsPath(trajectory.points, xMin, xMax, yMin, yMax)} fill="none" stroke={trajectory.emphasis === "accent" ? colors.accent : colors.primary} strokeWidth={4} />
        ))}
        {(snap.equilibria ?? []).map((eq, index) => (
          <g key={index}>
            <circle cx={sx(eq.x, xMin, xMax)} cy={sy(eq.y, yMin, yMax)} r={10} fill={eq.stable ? colors.primary : colors.warn} />
            <text x={sx(eq.x, xMin, xMax) + 14} y={sy(eq.y, yMin, yMax) - 10} fill={colors.ink} fontSize={14}>{eq.label}</text>
          </g>
        ))}
      </svg>
    </Shell>
  );
};

export const ComplexPlaneSceneRenderer: React.FC<RendererProps> = ({ step, theme }) => {
  const snap = step.snapshot as ComplexPlaneSceneSnapshot;
  const colors = PALETTE[theme];
  const xMin = snap.x_min ?? -4;
  const xMax = snap.x_max ?? 4;
  const yMin = snap.y_min ?? -4;
  const yMax = snap.y_max ?? 4;
  return (
    <Shell title={step.title} caption={snap.caption} formula={snap.formula_latex} theme={theme}>
      <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} width="100%" height="100%">
        <AxisFrame theme={theme} xMin={xMin} xMax={xMax} yMin={yMin} yMax={yMax} />
        {(snap.mapping_grid ?? []).map((line, index) => (
          <polyline key={`grid-${index}`} points={pointsPath(line, xMin, xMax, yMin, yMax)} fill="none" stroke={colors.grid} strokeWidth={2} />
        ))}
        {(snap.contours ?? []).map((line, index) => (
          <polyline key={`contour-${index}`} points={pointsPath(line, xMin, xMax, yMin, yMax)} fill="none" stroke={colors.secondary} strokeWidth={3} />
        ))}
        {(snap.points ?? []).map((point, index) => (
          <g key={index}>
            <circle cx={sx(point.re, xMin, xMax)} cy={sy(point.im, yMin, yMax)} r={9} fill={point.emphasis === "accent" ? colors.accent : colors.primary} />
            <text x={sx(point.re, xMin, xMax) + 12} y={sy(point.im, yMin, yMax) - 10} fill={colors.ink} fontSize={14}>{point.label}</text>
          </g>
        ))}
        <text x={SVG_W - 42} y={SVG_H - 30} fill={colors.muted} textAnchor="end">Re</text>
        <text x={88} y={28} fill={colors.muted}>Im</text>
      </svg>
    </Shell>
  );
};

export const OptimizationSceneRenderer: React.FC<RendererProps> = ({ step, theme }) => {
  const snap = step.snapshot as OptimizationSceneSnapshot;
  const colors = PALETTE[theme];
  const xMin = snap.x_min ?? -1;
  const xMax = snap.x_max ?? 6;
  const yMin = snap.y_min ?? -1;
  const yMax = snap.y_max ?? 6;
  return (
    <Shell title={step.title} caption={snap.caption} formula={snap.formula_latex ?? snap.objective} theme={theme}>
      <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} width="100%" height="100%">
        <AxisFrame theme={theme} xMin={xMin} xMax={xMax} yMin={yMin} yMax={yMax} />
        {snap.feasible_region?.length ? (
          <polygon points={pointsPath(snap.feasible_region, xMin, xMax, yMin, yMax)} fill={`${colors.primary}30`} stroke={colors.primary} strokeWidth={3} />
        ) : null}
        {snap.iterates?.length ? (
          <polyline points={pointsPath(snap.iterates, xMin, xMax, yMin, yMax)} fill="none" stroke={colors.accent} strokeWidth={4} strokeDasharray="8 8" />
        ) : null}
        {snap.iterates?.map(([x, y], index) => <circle key={index} cx={sx(x, xMin, xMax)} cy={sy(y, yMin, yMax)} r={7} fill={colors.accent} />)}
        {snap.optimum ? <circle cx={sx(snap.optimum[0], xMin, xMax)} cy={sy(snap.optimum[1], yMin, yMax)} r={12} fill={colors.warn} /> : null}
      </svg>
    </Shell>
  );
};

export const ModelingSceneRenderer: React.FC<RendererProps> = ({ step, theme }) => {
  const snap = step.snapshot as ModelingSceneSnapshot;
  const graph: GraphSceneSnapshot = {
    kind: "graph_scene",
    nodes: (snap.variables ?? []).map((variable, index) => ({
      id: variable.id,
      label: variable.value != null ? `${variable.label}: ${variable.value}${variable.unit ?? ""}` : variable.label,
      emphasis: index === 0 ? "accent" : "secondary",
    })),
    edges: (snap.relations ?? []).map((relation) => ({
      source: relation.source,
      target: relation.target,
      label: relation.label,
      emphasis: relation.emphasis,
    })),
    directed: true,
    caption: snap.caption,
  };
  return (
    <Shell title={step.title} caption={snap.caption} formula={snap.formula_latex} theme={theme}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 18, height: "100%" }}>
        <GraphBody graph={graph} theme={theme} />
        <AssumptionList assumptions={snap.assumptions ?? []} theme={theme} />
      </div>
    </Shell>
  );
};

function GraphBody({ graph, theme }: { graph: GraphSceneSnapshot; theme: ThemeName }) {
  return <GraphSvg graph={graph} theme={theme} />;
}

function AssumptionList({ assumptions, theme }: { assumptions: string[]; theme: ThemeName }) {
  const colors = PALETTE[theme];
  return (
    <div style={{ border: `1px solid ${colors.line}`, borderRadius: 8, padding: 16, background: colors.card }}>
      <div style={{ fontSize: 15, color: colors.muted, marginBottom: 10 }}>Assumptions</div>
      {assumptions.length ? assumptions.map((item, index) => (
        <div key={index} style={{ padding: "9px 0", borderTop: index ? `1px solid ${colors.line}` : undefined }}>
          {item}
        </div>
      )) : <div style={{ color: colors.muted }}>No explicit assumptions</div>}
    </div>
  );
}

export const ManifoldSceneRenderer: React.FC<RendererProps> = ({ step, theme }) => {
  const snap = step.snapshot as ManifoldSceneSnapshot;
  const colors = PALETTE[theme];
  const vectors = snap.tangent_vectors ?? [];
  return (
    <Shell title={step.title} caption={snap.caption} formula={snap.formula_latex ?? snap.param_surface} theme={theme}>
      <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} width="100%" height="100%">
        <defs>
          <linearGradient id="manifold-fill" x1="0" x2="1">
            <stop offset="0" stopColor={colors.primary} stopOpacity="0.36" />
            <stop offset="1" stopColor={colors.secondary} stopOpacity="0.32" />
          </linearGradient>
        </defs>
        <path d="M120,330 C250,120 410,160 520,250 C650,360 735,320 810,175 L805,365 C690,450 520,420 410,335 C290,245 205,300 120,430 Z" fill="url(#manifold-fill)" stroke={colors.primary} strokeWidth={3} />
        {Array.from({ length: 7 }).map((_, index) => (
          <path key={`u-${index}`} d={`M${130 + index * 105},405 C${210 + index * 74},290 ${250 + index * 70},190 ${310 + index * 74},220`} fill="none" stroke={colors.grid} strokeWidth={2} />
        ))}
        {Array.from({ length: 5 }).map((_, index) => (
          <path key={`v-${index}`} d={`M135,${365 - index * 42} C285,${260 - index * 24} 520,${270 + index * 28} 800,${210 + index * 35}`} fill="none" stroke={colors.grid} strokeWidth={2} />
        ))}
        {vectors.map((vector, index) => {
          const x = 340 + index * 135;
          const y = 260 - index * 24;
          return (
            <g key={index}>
              <line x1={x} y1={y} x2={x + vector.direction[0] * 52} y2={y - vector.direction[1] * 52} stroke={colors.accent} strokeWidth={5} strokeLinecap="round" />
              <circle cx={x} cy={y} r={7} fill={colors.accent} />
              <text x={x + 12} y={y - 12} fill={colors.ink} fontSize={14}>{vector.label}</text>
            </g>
          );
        })}
        <text x={110} y={80} fill={colors.muted} fontSize={16}>{snap.chart_name ?? "local chart"}</text>
      </svg>
    </Shell>
  );
};
