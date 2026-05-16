import React from "react";

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  theme?: "dark" | "light";
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  handleReset = () => {
    this.setState({ error: null });
  };

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (this.props.fallback) return this.props.fallback;

    const isDark = (this.props.theme ?? "dark") === "dark";
    const bg = isDark ? "#0d1117" : "#f6f8fa";
    const surface = isDark ? "#161b22" : "#ffffff";
    const border = isDark ? "#30363d" : "#d0d7de";
    const text = isDark ? "#c9d1d9" : "#24292f";
    const muted = isDark ? "#8b949e" : "#6e7781";
    const accent = isDark ? "#f85149" : "#cf222e";

    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            background: surface,
            border: `1px solid ${border}`,
            borderRadius: 12,
            padding: "28px 32px",
            maxWidth: 480,
            width: "100%",
            display: "flex",
            flexDirection: "column",
            gap: 16,
            fontFamily: "system-ui, -apple-system, sans-serif",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 20 }}>⚠️</span>
            <span style={{ fontSize: 15, fontWeight: 600, color: accent }}>
              渲染出错
            </span>
          </div>

          <p style={{ margin: 0, fontSize: 13, color: muted, lineHeight: 1.6 }}>
            播放器在渲染过程中遇到了意外错误。你可以点击下方按钮重试，或刷新页面恢复正常状态。
          </p>

          <details style={{ fontSize: 12, color: muted }}>
            <summary style={{ cursor: "pointer", userSelect: "none" }}>错误详情</summary>
            <pre
              style={{
                marginTop: 8,
                padding: "8px 10px",
                background: bg,
                borderRadius: 6,
                border: `1px solid ${border}`,
                fontSize: 11,
                color: accent,
                overflowX: "auto",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
              }}
            >
              {error.message}
            </pre>
          </details>

          <button
            onClick={this.handleReset}
            style={{
              alignSelf: "flex-start",
              padding: "6px 18px",
              borderRadius: 6,
              border: `1px solid ${border}`,
              background: "transparent",
              color: text,
              fontSize: 13,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            重试
          </button>
        </div>
      </div>
    );
  }
}
