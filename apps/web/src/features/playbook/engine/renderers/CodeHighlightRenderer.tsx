import React, { useEffect, useRef } from "react";
import type { CodeHighlightOverlay } from "../types";

interface CodeHighlightRendererProps {
  overlay: CodeHighlightOverlay;
  theme?: "dark" | "light";
}

const DARK = {
  bg: "#0d1117",
  surface: "#161b22",
  activeBg: "#1f3a5f",
  activeBorder: "#58a6ff",
  lineNum: "#484f58",
  text: "#c9d1d9",
  varBg: "#161b22",
  varLabel: "#8b949e",
  varValue: "#79c0ff",
} as const;

const LIGHT = {
  bg: "#f6f8fa",
  surface: "#ffffff",
  activeBg: "#dbeafe",
  activeBorder: "#3b82f6",
  lineNum: "#8c8c8c",
  text: "#24292f",
  varBg: "#f6f8fa",
  varLabel: "#57606a",
  varValue: "#0550ae",
} as const;

export const CodeHighlightRenderer: React.FC<CodeHighlightRendererProps> = ({
  overlay,
  theme = "dark",
}) => {
  const c = theme === "dark" ? DARK : LIGHT;
  const activeSet = new Set(overlay.active_lines);
  const activeLineRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    activeLineRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [overlay.active_line]);

  const hasVars = overlay.variables && Object.keys(overlay.variables).length > 0;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        background: c.bg,
        fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
        fontSize: 13,
        overflow: "hidden",
      }}
    >
      {/* Language badge */}
      <div
        style={{
          padding: "4px 12px",
          background: c.surface,
          color: c.lineNum,
          fontSize: 11,
          letterSpacing: "0.05em",
          borderBottom: `1px solid ${theme === "dark" ? "#30363d" : "#d0d7de"}`,
          flexShrink: 0,
        }}
      >
        {overlay.language}
      </div>

      {/* Code lines */}
      <div style={{ flex: 1, overflowY: "auto", overflowX: "auto" }}>
        {overlay.lines.map((line, i) => {
          const isActive = activeSet.has(i);
          const isAnchor = i === overlay.active_line;
          return (
            <div
              key={i}
              ref={isAnchor ? activeLineRef : null}
              style={{
                display: "flex",
                alignItems: "stretch",
                background: isActive ? c.activeBg : "transparent",
                borderLeft: isActive ? `3px solid ${c.activeBorder}` : "3px solid transparent",
                transition: "background 0.15s, border-color 0.15s",
                minHeight: 22,
              }}
            >
              <span
                style={{
                  width: 40,
                  flexShrink: 0,
                  textAlign: "right",
                  paddingRight: 12,
                  color: isActive ? c.activeBorder : c.lineNum,
                  userSelect: "none",
                  fontSize: 11,
                  lineHeight: "22px",
                }}
              >
                {i + 1}
              </span>
              <pre
                style={{
                  margin: 0,
                  padding: "0 12px 0 0",
                  color: c.text,
                  lineHeight: "22px",
                  whiteSpace: "pre",
                  flex: 1,
                  fontFamily: "inherit",
                  fontSize: "inherit",
                }}
              >
                {line || " "}
              </pre>
            </div>
          );
        })}
      </div>

      {/* Variable watch panel */}
      {hasVars && (
        <div
          style={{
            borderTop: `1px solid ${theme === "dark" ? "#30363d" : "#d0d7de"}`,
            background: c.varBg,
            padding: "6px 12px",
            display: "flex",
            flexWrap: "wrap",
            gap: "8px 20px",
            flexShrink: 0,
          }}
        >
          {Object.entries(overlay.variables!).map(([k, v]) => (
            <span key={k} style={{ fontSize: 12 }}>
              <span style={{ color: c.varLabel }}>{k}</span>
              <span style={{ color: c.lineNum }}>{" = "}</span>
              <span style={{ color: c.varValue }}>{v}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
