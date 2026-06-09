import React, { useState } from "react";
import type { ProviderSettings, RouterModeSetting } from "../hooks/useProviderSettings";

interface ProviderSettingsModalProps {
  initial: ProviderSettings;
  onSave: (s: ProviderSettings) => void;
  onClose: () => void;
}

const ROUTER_MODES: Array<{ id: RouterModeSetting; label: string; hint: string }> = [
  { id: "hybrid", label: "Hybrid", hint: "模型优先，失败回退启发式" },
  { id: "llm", label: "LLM", hint: "只用路由模型" },
  { id: "heuristic", label: "Heuristic", hint: "只用确定性规则" },
  { id: "off", label: "Off", hint: "关闭小模型路由" },
];

function clampNumber(value: number, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

export function ProviderSettingsModal({ initial, onSave, onClose }: ProviderSettingsModalProps) {
  const [apiKey, setApiKey] = useState(initial.apiKey);
  const [baseUrl, setBaseUrl] = useState(initial.baseUrl);
  const [model, setModel] = useState(initial.model);
  const [routerMode, setRouterMode] = useState<RouterModeSetting>(initial.routerMode);
  const [routerModel, setRouterModel] = useState(initial.routerModel);
  const [routerMinConfidence, setRouterMinConfidence] = useState(initial.routerMinConfidence);
  const [routerTimeoutS, setRouterTimeoutS] = useState(initial.routerTimeoutS);
  const [showKey, setShowKey] = useState(false);

  const handleSave = () => {
    onSave({
      apiKey: apiKey.trim(),
      baseUrl: baseUrl.trim(),
      model: model.trim(),
      routerMode,
      routerModel: routerModel.trim(),
      routerMinConfidence: clampNumber(routerMinConfidence, 0.72, 0, 1),
      routerTimeoutS: clampNumber(routerTimeoutS, 12, 1, 60),
    });
    onClose();
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.78)",
        backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onMouseDown={onClose}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{
        background: "var(--surface-2)",
        border: "1px solid var(--line)",
        borderRadius: 12,
        boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
        padding: "28px 32px",
        width: 560,
        maxWidth: "90vw",
        maxHeight: "calc(100vh - 36px)",
        overflow: "auto",
        display: "flex",
        flexDirection: "column",
        gap: 20,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>LLM Provider 设置</div>
            <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>
              配置生成模型与小模型路由；支持 OpenAI 及兼容接口
            </div>
          </div>
          <button className="mv-icon-btn" onClick={onClose} style={{ fontSize: 18 }}>×</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Field label="API Key">
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type={showKey ? "text" : "password"}
                className="mv-text-input mv-mono"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                style={{ flex: 1, fontSize: 13 }}
              />
              <button
                className="mv-chip"
                onClick={() => setShowKey(!showKey)}
                style={{ flexShrink: 0 }}
              >
                {showKey ? "隐藏" : "显示"}
              </button>
            </div>
          </Field>

          <Field label="Base URL" hint="兼容 OpenAI 的任意接口">
            <input
              type="text"
              className="mv-text-input mv-mono"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.openai.com/v1"
              style={{ fontSize: 13 }}
            />
          </Field>

          <Field label="Generation Model" hint="用于 CIR / Playbook 生成">
            <input
              type="text"
              className="mv-text-input mv-mono"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="gpt-4o-mini"
              style={{ fontSize: 13 }}
            />
          </Field>
        </div>

        <div style={{ borderTop: "1px solid var(--line)", paddingTop: 16, display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 13 }}>小模型路由</div>
            <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 3, lineHeight: 1.5 }}>
              生成前先判断学科 / skill。Router Model 留空时复用生成模型或后端默认路由模型。
            </div>
          </div>

          <Field label="Router Mode">
            <div className="mv-settings-segmented mv-router-mode-grid">
              {ROUTER_MODES.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  className={`mv-chip${routerMode === mode.id ? " mv-chip-primary" : ""}`}
                  onClick={() => setRouterMode(mode.id)}
                  title={mode.hint}
                >
                  <span className="mv-settings-layout-label">{mode.label}</span>
                  <span className="mv-settings-layout-hint">{mode.hint}</span>
                </button>
              ))}
            </div>
          </Field>

          <Field label="Router Model" hint="建议小而快；如 gpt-4o-mini / qwen-turbo">
            <input
              type="text"
              className="mv-text-input mv-mono"
              value={routerModel}
              onChange={(e) => setRouterModel(e.target.value)}
              placeholder="留空则复用默认模型"
              style={{ fontSize: 13 }}
              disabled={routerMode === "off" || routerMode === "heuristic"}
            />
          </Field>

          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 12 }}>
            <Field label={`最低置信度 · ${routerMinConfidence.toFixed(2)}`}>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={routerMinConfidence}
                onChange={(e) => setRouterMinConfidence(Number.parseFloat(e.target.value))}
                className="mv-settings-slider"
                disabled={routerMode === "off" || routerMode === "heuristic"}
              />
            </Field>
            <Field label="Router Timeout">
              <input
                type="number"
                min={1}
                max={60}
                step={1}
                className="mv-text-input mv-mono"
                value={routerTimeoutS}
                onChange={(e) => setRouterTimeoutS(Number.parseFloat(e.target.value))}
                disabled={routerMode === "off" || routerMode === "heuristic"}
              />
            </Field>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button className="mv-chip" onClick={onClose}>取消</button>
          <button className="mv-chip mv-chip-primary" onClick={handleSave}>
            保存并使用
          </button>
        </div>

        <div style={{ fontSize: 11, color: "var(--ink-3)", borderTop: "1px solid var(--line)", paddingTop: 12 }}>
          设置仅存储在本地浏览器中；提交任务时只随当前请求发送。留空 API Key 时使用服务器默认配置。
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
        <span style={{ fontSize: 12, fontWeight: 500 }}>{label}</span>
        {hint && <span style={{ fontSize: 11, color: "var(--ink-3)" }}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}
