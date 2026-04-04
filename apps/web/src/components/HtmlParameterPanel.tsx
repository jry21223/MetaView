import type { ExecutionParameterControl } from "../types";

interface HtmlParameterPanelProps {
  controls: ExecutionParameterControl[];
  values: Record<string, string>;
  onChange: (id: string, value: string) => void;
  disabled?: boolean;
}

export function HtmlParameterPanel({
  controls,
  values,
  onChange,
  disabled = false,
}: HtmlParameterPanelProps) {
  if (!controls || controls.length === 0) return null;


  return (
    <div
      className="html-parameter-panel"
      style={{
        padding: "16px",
        background: "var(--surface-container-low)",
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--outline-variant)",
      }}
    >
      <div
        style={{
          fontSize: "0.9rem",
          fontWeight: 600,
          marginBottom: "12px",
          color: "var(--on-surface)",
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
          tune
        </span>
        参数控制
      </div>

      <div
        style={{
          display: "grid",
          gap: "12px",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
        }}
      >
        {controls.map((ctrl) => (
          <div
            key={ctrl.id}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "6px",
            }}
          >
            <label
              style={{
                fontSize: "0.8rem",
                color: "var(--on-surface-variant)",
                fontWeight: 500,
              }}
              title={ctrl.description || ""}
            >
              {ctrl.label}
            </label>
            <input
              type="text"
              className="input"
              value={values[ctrl.id] ?? ""}
              onChange={(e) => onChange(ctrl.id, e.target.value)}
              placeholder={ctrl.placeholder || ""}
              disabled={disabled}
              style={{
                padding: "8px 12px",
                fontSize: "0.9rem",
                borderRadius: "var(--radius-sm)",
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
