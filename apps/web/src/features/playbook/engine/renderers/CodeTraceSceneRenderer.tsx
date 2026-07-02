import React from "react";
import { AssetSvg } from "../assets/AssetSvg";
import type { CodeTracePointer, CodeTraceSceneSnapshot } from "../types";
import type { RendererProps } from "./types";

const SVG_W = 900;
const SVG_H = 506;
const CORE_PACK_ID = "core-visual-basic";

const COLORS = {
  dark: {
    bg: "#0a0c10",
    panel: "#141922",
    ink: "#e8ecf4",
    muted: "#9aa4b2",
    line: "#303846",
    cell: "#202937",
    activeCell: "#173d58",
    rangeCell: "#1c3140",
    accent: "#58a6ff",
    pointer: "#f5b642",
  },
  light: {
    bg: "#f5f7fa",
    panel: "#ffffff",
    ink: "#172033",
    muted: "#60708a",
    line: "#d7dde6",
    cell: "#edf2f7",
    activeCell: "#dff2fb",
    rangeCell: "#e7f1f6",
    accent: "#0f76a8",
    pointer: "#b97613",
  },
} as const;

function shortLine(line: string): string {
  return line.length > 62 ? `${line.slice(0, 59)}...` : line;
}

function pointerY(pointer: CodeTracePointer): number {
  if (pointer.id === "mid") return 314;
  if (pointer.id === "high") return 362;
  return 266;
}

function clampIndex(index: number, maxIndex: number): number {
  return Math.max(0, Math.min(maxIndex, index));
}

export const CodeTraceSceneRenderer: React.FC<RendererProps> = ({ step, theme }) => {
  const snap = step.snapshot as CodeTraceSceneSnapshot;
  const colors = COLORS[theme];
  const packId = snap.pack_id ?? "algorithm-code-basic";
  const activeLines = new Set(snap.active_lines ?? []);
  const activeIndices = new Set(snap.active_indices ?? []);
  const arrayValues = snap.array_values ?? [];
  const pointers = snap.pointers ?? [];
  const [rangeStart, rangeEnd] = snap.search_range ?? [0, Math.max(0, arrayValues.length - 1)];
  const rangeMin = arrayValues.length > 0 ? clampIndex(Math.min(rangeStart, rangeEnd), arrayValues.length - 1) : 0;
  const rangeMax = arrayValues.length > 0 ? clampIndex(Math.max(rangeStart, rangeEnd), arrayValues.length - 1) : 0;

  const codeX = 56;
  const codeY = 88;
  const codeW = 500;
  const lineH = 34;
  const arrayX = 102;
  const arrayY = 390;
  const cellW = arrayValues.length > 0 ? Math.min(74, 560 / arrayValues.length) : 70;
  const cellH = 56;

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
        className="code-trace-scene"
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        width="100%"
        height="100%"
        data-pack-id={packId}
        data-trace-asset-id={snap.asset_id ?? undefined}
      >
        <rect x="0" y="0" width={SVG_W} height={SVG_H} fill={colors.bg} />
        <text x="44" y="50" fill={colors.ink} fontSize="28" fontWeight="760">
          {step.title}
        </text>
        <text x="44" y="474" fill={colors.muted} fontSize="17">
          {snap.caption}
        </text>

        <rect x="34" y="70" width="548" height="290" rx="10" fill={colors.panel} stroke={colors.line} />
        <text x={codeX} y="112" fill={colors.muted} fontSize="14" fontWeight="700">
          {snap.language} trace
        </text>
        {snap.lines.map((line, index) => {
          const y = codeY + 50 + index * lineH;
          const active = activeLines.has(index) || snap.active_line === index;
          return (
            <g key={`${index}-${line}`} data-code-line={index} data-code-line-state={active ? "active" : "idle"}>
              {active ? (
                <AssetSvg
                  assetId={snap.active_line_asset_id ?? "active-line"}
                  packId={packId}
                  subject="algorithm"
                  semanticRole="active_line"
                  x={codeX - 10}
                  y={y - 23}
                  width={codeW}
                  height={30}
                  fallbackShape="rect"
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

        <rect x="610" y="70" width="246" height="290" rx="10" fill={colors.panel} stroke={colors.line} />
        <text x="634" y="112" fill={colors.muted} fontSize="14" fontWeight="700">
          state
        </text>
        {Object.entries(snap.variables ?? {}).map(([key, value], index) => (
          <g key={key} data-variable={key}>
            <text x="634" y={152 + index * 34} fill={colors.muted} fontSize="14">
              {key}
            </text>
            <text x="744" y={152 + index * 34} fill={colors.ink} fontSize="16" fontWeight="720">
              {value}
            </text>
          </g>
        ))}

        <g data-search-range={`${rangeStart}-${rangeEnd}`}>
          {arrayValues.length > 0 ? (
            <g data-search-range-flow={`${rangeStart}-${rangeEnd}`}>
              <AssetSvg
                assetId="core-flow-arrow"
                packId={CORE_PACK_ID}
                subject="core"
                semanticRole="flow_arrow"
                x={arrayX + rangeMin * cellW + 4}
                y={arrayY - 24}
                width={Math.max(44, (rangeMax - rangeMin + 1) * cellW - 14)}
                height={16}
                opacity="0.76"
                preserveAspectRatio="none"
                fallbackShape="rect"
              />
            </g>
          ) : null}
          {arrayValues.map((value, index) => {
            const x = arrayX + index * cellW;
            const inRange = index >= rangeStart && index <= rangeEnd;
            const active = activeIndices.has(index);
            const state = active ? "active" : inRange ? "range" : "discarded";
            return (
              <g key={`${index}-${value}`} data-array-index={index} data-array-cell-state={state}>
                <rect
                  x={x}
                  y={arrayY}
                  width={cellW - 6}
                  height={cellH}
                  rx="8"
                  fill={active ? colors.activeCell : inRange ? colors.rangeCell : colors.cell}
                  stroke={active ? colors.accent : colors.line}
                  strokeWidth={active ? 2 : 1}
                />
                <text
                  x={x + (cellW - 6) / 2}
                  y={arrayY + 34}
                  textAnchor="middle"
                  fill={colors.ink}
                  fontSize="18"
                  fontWeight={active ? 760 : 650}
                >
                  {value}
                </text>
                <text x={x + (cellW - 6) / 2} y={arrayY + 72} textAnchor="middle" fill={colors.muted} fontSize="12">
                  {index}
                </text>
              </g>
            );
          })}
        </g>

        {pointers.map((pointer) => {
          const x = arrayX + pointer.index * cellW + (cellW - 6) / 2 - 18;
          const y = pointerY(pointer);
          return (
            <g key={pointer.id} data-pointer-id={pointer.id} data-pointer-index={pointer.index}>
              <AssetSvg
                assetId={pointer.asset_id ?? "pointer-marker"}
                packId={packId}
                subject="algorithm"
                semanticRole="pointer"
                x={x}
                y={y}
                width={36}
                height={32}
                fallbackShape="rect"
              />
              <line
                x1={x + 18}
                y1={y + 30}
                x2={arrayX + pointer.index * cellW + (cellW - 6) / 2}
                y2={arrayY - 4}
                stroke={colors.pointer}
                strokeWidth="1.2"
                strokeDasharray="3 4"
              />
              <text x={x + 18} y={y - 6} textAnchor="middle" fill={colors.pointer} fontSize="13" fontWeight="730">
                {pointer.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};
