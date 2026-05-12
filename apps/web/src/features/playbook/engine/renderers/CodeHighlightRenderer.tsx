import React, { useEffect, useRef, useState } from "react";
import type { CodeHighlightOverlay } from "../types";
import { tokenizeLines, type TokenKind } from "./codeTokenizer";

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
  border: "#30363d",
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
  border: "#d0d7de",
} as const;

const TOKEN_DARK: Record<TokenKind, string> = {
  keyword: "#c792ea",
  string: "#c3e88d",
  number: "#f78c6c",
  comment: "#546e7a",
  operator: "#89ddff",
  text: DARK.text,
};

const TOKEN_LIGHT: Record<TokenKind, string> = {
  keyword: "#8250df",
  string: "#0a3069",
  number: "#0550ae",
  comment: "#6e7781",
  operator: "#cf222e",
  text: LIGHT.text,
};

export const CodeHighlightRenderer: React.FC<CodeHighlightRendererProps> = ({
  overlay,
  theme = "dark",
}) => {
  const c = theme === "dark" ? DARK : LIGHT;
  const tokenColors = theme === "dark" ? TOKEN_DARK : TOKEN_LIGHT;
  const activeSet = new Set(overlay.active_lines);
  const activeLineRef = useRef<HTMLDivElement | null>(null);

  // Track previous variables to detect value changes and trigger flash
  const prevVarsRef = useRef<Record<string, string>>({});
  const [changedKeys, setChangedKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    const curr = overlay.variables ?? {};
    // Schedule inside a callback to satisfy react-hooks/set-state-in-effect
    const flashId = setTimeout(() => {
      const prev = prevVarsRef.current;
      const changed = new Set<string>();
      for (const [k, v] of Object.entries(curr)) {
        if (prev[k] !== v) changed.add(k);
      }
      prevVarsRef.current = { ...curr };
      setChangedKeys(changed);
      setTimeout(() => setChangedKeys(new Set()), 300);
    }, 0);
    return () => clearTimeout(flashId);
  }, [overlay.variables]);

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
          borderBottom: `1px solid ${c.border}`,
          flexShrink: 0,
        }}
      >
        {overlay.language}
      </div>

      {/* Code lines */}
      <div style={{ flex: 1, overflowY: "auto", overflowX: "auto" }}>
        {(() => {
          const allTokens = tokenizeLines(
            overlay.lines.map((l) => l || " "),
            overlay.language,
          );
          return overlay.lines.map((line, i) => {
            const isActive = activeSet.has(i);
            const isAnchor = i === overlay.active_line;
            const showLabel = isAnchor && !!overlay.operation_label;
            const tokens = allTokens[i];

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
              {/* Line number */}
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

              {/* Operation badge */}
              {showLabel && (
                <span
                  style={{
                    marginRight: 8,
                    padding: "1px 8px",
                    borderRadius: 10,
                    fontSize: 10,
                    background: `${c.activeBorder}33`,
                    color: c.activeBorder,
                    alignSelf: "center",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                  }}
                >
                  {overlay.operation_label}
                </span>
              )}

              {/* Syntax-highlighted code */}
              <pre
                style={{
                  margin: 0,
                  padding: "0 12px 0 0",
                  lineHeight: "22px",
                  whiteSpace: "pre",
                  flex: 1,
                  fontFamily: "inherit",
                  fontSize: "inherit",
                }}
              >
                {tokens.map((tok, j) => (
                  <span key={j} style={{ color: tokenColors[tok.kind] }}>
                    {tok.text}
                  </span>
                ))}
              </pre>
            </div>
          );
          });
        })()}
      </div>

      {/* Variable watch panel */}
      {hasVars && (
        <div
          style={{
            borderTop: `1px solid ${c.border}`,
            background: c.varBg,
            padding: "6px 12px",
            display: "flex",
            flexWrap: "wrap",
            gap: "8px 20px",
            flexShrink: 0,
          }}
        >
          {Object.entries(overlay.variables!).map(([k, v]) => {
            const justChanged = changedKeys.has(k);
            return (
              <span
                key={k}
                style={{
                  fontSize: 12,
                  padding: "1px 4px",
                  borderRadius: 4,
                  background: justChanged ? `${c.activeBorder}22` : "transparent",
                  transition: "background 0.3s ease",
                }}
              >
                <span style={{ color: c.varLabel }}>{k}</span>
                <span style={{ color: c.lineNum }}>{" = "}</span>
                <span style={{ color: c.varValue }}>{v}</span>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
};
