import { useState } from "react";
import type { FormEvent } from "react";

import type { CustomProviderUpsertRequest, ProviderDescriptor } from "../types";

interface ProviderManagerProps {
  providers: ProviderDescriptor[];
  onCreateProvider: (payload: CustomProviderUpsertRequest) => Promise<void>;
  onDeleteProvider: (name: string) => Promise<void>;
}

const initialState: CustomProviderUpsertRequest = {
  name: "local-ollama",
  label: "Local Ollama",
  base_url: "http://127.0.0.1:11434/v1",
  model: "qwen2.5-coder",
  api_key: "",
  description: "自定义 OpenAI 兼容模型提供商",
  temperature: 0.2,
  supports_vision: false,
  enabled: true,
};

export function ProviderManager({
  providers,
  onCreateProvider,
  onDeleteProvider,
}: ProviderManagerProps) {
  const [form, setForm] = useState<CustomProviderUpsertRequest>(initialState);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const customProviders = providers.filter((provider) => provider.is_custom);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      await onCreateProvider(form);
      setForm(initialState);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "保存 provider 失败");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(name: string) {
    setSaving(true);
    setError(null);

    try {
      await onDeleteProvider(name);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "删除 provider 失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel panel-provider">
      <div className="panel-header">
        <span className="panel-kicker">Providers</span>
        <h3>自定义模型提供商</h3>
        <p>支持注册 OpenAI 兼容接口，例如本地 Ollama、vLLM 网关或第三方代理服务。</p>
      </div>

      <form className="prompt-form" onSubmit={handleSubmit}>
        <div className="select-grid">
          <label>
            <span>Provider ID</span>
            <input
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            />
          </label>
          <label>
            <span>显示名称</span>
            <input
              value={form.label}
              onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))}
            />
          </label>
        </div>

        <label>
          <span>Base URL</span>
          <input
            value={form.base_url}
            onChange={(event) => setForm((current) => ({ ...current, base_url: event.target.value }))}
          />
        </label>

        <div className="select-grid">
          <label>
            <span>模型名</span>
            <input
              value={form.model}
              onChange={(event) => setForm((current) => ({ ...current, model: event.target.value }))}
            />
          </label>
          <label>
            <span>Temperature</span>
            <input
              type="number"
              min="0"
              max="2"
              step="0.1"
              value={form.temperature}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  temperature: Number(event.target.value),
                }))
              }
            />
          </label>
        </div>

        <label>
          <span>状态</span>
          <select
            value={form.enabled ? "enabled" : "disabled"}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                enabled: event.target.value === "enabled",
              }))
            }
          >
            <option value="enabled">启用</option>
            <option value="disabled">禁用</option>
          </select>
        </label>

        <label>
          <span>视觉能力</span>
          <select
            value={form.supports_vision ? "vision" : "text"}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                supports_vision: event.target.value === "vision",
              }))
            }
          >
            <option value="text">仅文本</option>
            <option value="vision">支持图片</option>
          </select>
        </label>

        <label>
          <span>API Key</span>
          <input
            type="password"
            value={form.api_key ?? ""}
            onChange={(event) => setForm((current) => ({ ...current, api_key: event.target.value }))}
            placeholder="本地 provider 可留空"
          />
        </label>

        <label>
          <span>描述</span>
          <input
            value={form.description}
            onChange={(event) =>
              setForm((current) => ({ ...current, description: event.target.value }))
            }
          />
        </label>

        {error ? <p className="error-text">{error}</p> : null}

        <div className="form-actions">
          <button type="submit" disabled={saving}>
            {saving ? "保存中..." : "保存自定义 Provider"}
          </button>
          <p>同名 Provider 会被覆盖更新；视觉能力会影响题图是否发送给远程模型。</p>
        </div>
      </form>

      <div className="history-list">
        {customProviders.length === 0 ? (
          <div className="history-empty">当前还没有自定义 provider。</div>
        ) : null}
        {customProviders.map((provider) => (
          <div key={provider.name} className="history-item">
            <div className="history-item-head">
              <strong>{provider.label}</strong>
              <span>{provider.model}</span>
            </div>
            <p>{provider.base_url}</p>
            <div className="history-item-meta">
              <span>{provider.name}</span>
              <span>{provider.kind}</span>
              <span>{provider.supports_vision ? "vision" : "text"}</span>
              <span>{provider.configured ? "enabled" : "disabled"}</span>
              <button
                type="button"
                className="inline-action"
                onClick={() => handleDelete(provider.name)}
                disabled={saving}
              >
                删除
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
