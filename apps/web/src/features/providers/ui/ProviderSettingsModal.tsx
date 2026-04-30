import React, { useState } from "react";
import type { ProviderSettings } from "../hooks/useProviderSettings";

interface ProviderSettingsModalProps {
  initial: ProviderSettings;
  onSave: (s: ProviderSettings) => void;
  onClose: () => void;
}

export function ProviderSettingsModal({ initial, onSave, onClose }: ProviderSettingsModalProps) {
  const [apiKey, setApiKey] = useState(initial.apiKey);
  const [baseUrl, setBaseUrl] = useState(initial.baseUrl);
  const [model, setModel] = useState(initial.model);
  const [showKey, setShowKey] = useState(false);

  const handleSave = () => {
    onSave({ apiKey: apiKey.trim(), baseUrl: baseUrl.trim(), model: model.trim() });
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.78)',
        backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: 'var(--surface-2)',
        border: '1px solid var(--line)',
        borderRadius: 12,
        boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
        padding: '28px 32px',
        width: 480,
        maxWidth: '90vw',
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>LLM Provider 设置</div>
            <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>
              配置你自己的 API Key，支持 OpenAI 及兼容接口
            </div>
          </div>
          <button className="mv-icon-btn" onClick={onClose} style={{ fontSize: 18 }}>×</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="API Key">
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type={showKey ? 'text' : 'password'}
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
                {showKey ? '隐藏' : '显示'}
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

          <Field label="Model">
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

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="mv-chip" onClick={onClose}>取消</button>
          <button className="mv-chip mv-chip-primary" onClick={handleSave}>
            保存并使用
          </button>
        </div>

        <div style={{ fontSize: 11, color: 'var(--ink-3)', borderTop: '1px solid var(--line)', paddingTop: 12 }}>
          设置仅存储在本地浏览器中，不会上传至服务器。
          留空 API Key 时使用服务器默认配置。
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
        <span style={{ fontSize: 12, fontWeight: 500 }}>{label}</span>
        {hint && <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}
