import React, { useEffect, useRef, useState } from "react";
import type { CodeHighlightOverlay } from "../types";
import { tokenizeLines, type TokenKind } from "./codeTokenizer";

interface CodeHighlightRendererProps {
  overlay: CodeHighlightOverlay;
  theme?: "dark" | "light";
  lineNumberOffset?: number;
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
  bg: "#fbfaf6",
  surface: "#fffefa",
  activeBg: "rgba(130, 151, 111, 0.16)",
  activeBorder: "#82976f",
  lineNum: "#969b92",
  text: "#30352f",
  varBg: "#fbfaf6",
  varLabel: "#73796f",
  varValue: "#6f8e72",
  border: "rgba(65, 73, 62, 0.14)",
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
  keyword: "#6f7f62",
  string: "#5f7462",
  number: "#6b6f66",
  comment: "#6e7781",
  operator: "#b45f5f",
  text: LIGHT.text,
};

export const CodeHighlightRenderer: React.FC<CodeHighlightRendererProps> = ({
  overlay,
  theme = "dark",
  lineNumberOffset = 0,
}) => {
  const c = theme === "dark" ? DARK : LIGHT;
  const tokenColors = theme === "dark" ? TOKEN_DARK : TOKEN_LIGHT;
  const activeSet = new Set(overlay.active_lines);
  const activeLineRef = useRef<HTMLDivElement | null>(null);
  const codeScrollRef = useRef<HTMLDivElement | null>(null);

  // Track previous variables to detect value changes and trigger flash
  const prevVarsRef = useRef<Record<string, string>>({});
  const [changedKeys, setChangedKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    const curr = overlay.variables ?? {};
    let clearFlashId: ReturnType<typeof setTimeout> | undefined;
    // Schedule inside a callback to satisfy react-hooks/set-state-in-effect
    const flashId = setTimeout(() => {
      const prev = prevVarsRef.current;
      const changed = new Set<string>();
      for (const [k, v] of Object.entries(curr)) {
        if (prev[k] !== v) changed.add(k);
      }
      prevVarsRef.current = { ...curr };
      setChangedKeys(changed);
      clearFlashId = setTimeout(() => setChangedKeys(new Set()), 300);
    }, 0);
    return () => {
      clearTimeout(flashId);
      if (clearFlashId) clearTimeout(clearFlashId);
    };
  }, [overlay.variables]);

  useEffect(() => {
    const activeLine = activeLineRef.current;
    const scrollContainer = codeScrollRef.current;
    if (!activeLine || !scrollContainer) return;

    const activeBounds = activeLine.getBoundingClientRect();
    const containerBounds = scrollContainer.getBoundingClientRect();
    if (activeBounds.top < containerBounds.top) {
      scrollContainer.scrollTop -= containerBounds.top - activeBounds.top;
    } else if (activeBounds.bottom > containerBounds.bottom) {
      scrollContainer.scrollTop += activeBounds.bottom - containerBounds.bottom;
    }
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
        fontSize: 12.5,
        overflow: "hidden",
      }}
    >
      {/* Language badge */}
      <div
        style={{
          padding: "4px 10px",
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
      <div ref={codeScrollRef} style={{ flex: 1, overflowY: "auto", overflowX: "auto" }}>
        {(() => {
          const allTokens = tokenizeLines(
            overlay.lines.map((l) => l || " "),
            overlay.language,
          );
          return overlay.lines.map((_line, i) => {
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
                  width: 34,
                  flexShrink: 0,
                  textAlign: "right",
                  paddingRight: 10,
                  color: isActive ? c.activeBorder : c.lineNum,
                  userSelect: "none",
                  fontSize: 11,
                  lineHeight: "22px",
                }}
              >
                {lineNumberOffset + i + 1}
              </span>

              {/* Operation badge */}
              {showLabel && (
                <span
                  style={{
                    marginRight: 7,
                    padding: "1px 7px",
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
                  padding: "0 10px 0 0",
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
            padding: "6px 10px",
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
