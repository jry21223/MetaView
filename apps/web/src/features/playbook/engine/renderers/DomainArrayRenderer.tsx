import React from "react";
import type { AlgorithmArraySnapshot, AlgorithmBarsSnapshot, NarrationToken } from "../types";
import { domainCapability } from "../domainCapabilities";
import { AlgorithmRenderer } from "./AlgorithmRenderer";
import { BarBlockRenderer } from "./BarBlockRenderer";
import type { RendererProps } from "./types";

type ArrayLikeSnapshot = AlgorithmArraySnapshot | AlgorithmBarsSnapshot;
type CardEmphasis = "primary" | "secondary" | "accent" | "neutral";

const DOMAIN_LABELS: Record<string, string> = {
  physics: "Quantity",
  chemistry: "Participant",
  biology: "Stage",
  geography: "Factor",
};

const PALETTE = {
  dark: {
    bg: "#0a0c10",
    surface: "#151a22",
    surfaceAlt: "#10151d",
    border: "rgba(255,255,255,0.10)",
    text: "#e8ecf4",
    muted: "rgba(232,236,244,0.62)",
    primary: "#4de8b0",
    accent: "#ffb454",
    secondary: "#a8b3ff",
    soft: "rgba(77,232,176,0.12)",
    shadow: "rgba(0,0,0,0.34)",
  },
  light: {
    bg: "#f5f7fa",
    surface: "#ffffff",
    surfaceAlt: "#edf2f7",
    border: "rgba(20,24,32,0.10)",
    text: "#141820",
    muted: "rgba(20,24,32,0.62)",
    primary: "#007a61",
    accent: "#b86400",
    secondary: "#4b57b8",
    soft: "rgba(0,122,97,0.10)",
    shadow: "rgba(20,24,32,0.12)",
  },
} as const;

function normalizedDomain(domain: string | undefined): string {
  return (domain ?? "").trim().toLowerCase();
}

function shouldDelegateToAlgorithm(domain: string | undefined): boolean {
  const value = normalizedDomain(domain);
  return value === "algorithm" || value === "code";
}

function tokenEmphasis(tokens: NarrationToken[], value: string): CardEmphasis | null {
  const token = tokens.find((item) => item.label === value || item.value === value);
  const emphasis = token?.emphasis;
  return emphasis === "primary" || emphasis === "secondary" || emphasis === "accent"
    ? emphasis
    : null;
}

function cardEmphasis(snap: ArrayLikeSnapshot, index: number, tokens: NarrationToken[]): CardEmphasis {
  if (snap.active_indices.includes(index)) return "primary";
  if (snap.swap_indices.includes(index) || snap.sorted_indices.includes(index)) return "accent";
  const value = snap.array_values[index] ?? "";
  return tokenEmphasis(tokens, value) ?? "neutral";
}

function emphasisColor(theme: "dark" | "light", emphasis: CardEmphasis): string {
  const colors = PALETTE[theme];
  if (emphasis === "primary") return colors.primary;
  if (emphasis === "accent") return colors.accent;
  if (emphasis === "secondary") return colors.secondary;
  return colors.border;
}

function cardRole(domain: string): string {
  return DOMAIN_LABELS[domain] ?? "Concept";
}

export const DomainArrayRenderer: React.FC<RendererProps> = (props) => {
  const { step, theme, domain } = props;
  const snap = step.snapshot as ArrayLikeSnapshot;
  const normalized = normalizedDomain(domain);

  if (shouldDelegateToAlgorithm(domain)) {
    if (snap.kind === "algorithm_bars") {
      return <BarBlockRenderer {...props} />;
    }
    return <AlgorithmRenderer {...props} />;
  }

  const capability = domainCapability(normalized);
  const colors = PALETTE[theme];
  const role = cardRole(normalized);

  return (
    <div
      className="domain-array-renderer"
      data-domain={normalized || "unknown"}
      data-theme={theme}
      style={{
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 26,
        padding: "44px 56px",
        background: colors.bg,
        color: colors.text,
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <div style={{ display: "grid", gap: 8, justifyItems: "center", maxWidth: 860 }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "4px 10px",
            borderRadius: 999,
            border: `1px solid ${colors.border}`,
            background: colors.soft,
            color: colors.muted,
            fontSize: 11,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
          title={capability.message}
        >
          <span>{normalized || "domain"}</span>
          {capability.support !== "full" && <span>{capability.support}</span>}
        </div>
        <h2
          style={{
            color: colors.text,
            fontSize: 22,
            lineHeight: 1.25,
            fontWeight: 720,
            margin: 0,
            textAlign: "center",
          }}
        >
          {step.title}
        </h2>
      </div>

      <div
        className="domain-array-renderer__cards"
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${Math.min(Math.max(snap.array_values.length, 1), 4)}, minmax(120px, 1fr))`,
          gap: 14,
          width: "min(860px, 100%)",
        }}
      >
        {snap.array_values.map((value, index) => {
          const emphasis = cardEmphasis(snap, index, step.tokens);
          const color = emphasisColor(theme, emphasis);
          return (
            <div
              key={`${value}-${index}`}
              className="domain-array-renderer__card"
              data-emphasis={emphasis}
              style={{
                minHeight: 96,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                gap: 14,
                padding: "16px 18px",
                borderRadius: 8,
                border: `1px solid ${emphasis === "neutral" ? colors.border : color}`,
                background:
                  emphasis === "neutral"
                    ? `linear-gradient(180deg, ${colors.surface}, ${colors.surfaceAlt})`
                    : `${color}18`,
                boxShadow: `0 10px 28px ${colors.shadow}`,
                boxSizing: "border-box",
              }}
            >
              <div
                style={{
                  color: colors.muted,
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
              >
                {role} {index + 1}
              </div>
              <div
                style={{
                  color: emphasis === "neutral" ? colors.text : color,
                  fontSize: 24,
                  lineHeight: 1.1,
                  fontWeight: 760,
                  overflowWrap: "anywhere",
                }}
              >
                {value}
              </div>
            </div>
          );
        })}
      </div>

      {step.voiceover_text.trim() && (
        <p
          style={{
            maxWidth: 760,
            margin: 0,
            color: colors.muted,
            fontSize: 16,
            lineHeight: 1.6,
            textAlign: "center",
          }}
        >
          {step.voiceover_text}
        </p>
      )}
    </div>
  );
};
