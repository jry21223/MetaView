import { useState } from "react";
import type { FormEvent } from "react";

import { testCustomProvider } from "../api/client";
import type {
  CustomProviderTestResponse,
  CustomProviderUpsertRequest,
  ProviderDescriptor,
} from "../types";

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
  router_model: "qwen2.5-coder:3b",
  planning_model: "",
  coding_model: "",
  critic_model: "",
  test_model: "",
  api_key: "",
  description: "自定义 OpenAI 兼容模型提供商",
  temperature: 0.2,
  supports_vision: false,
  enabled: true,
};

interface ProviderPreset {
  key: string;
  icon: string;
  data: CustomProviderUpsertRequest;
}

const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    key: "deepseek",
    icon: "neurology",
    data: {
      name: "deepseek",
      label: "DeepSeek",
      base_url: "https://api.deepseek.com/v1",
      model: "deepseek-chat",
      router_model: "deepseek-chat",
      planning_model: "deepseek-reasoner",
      coding_model: "deepseek-chat",
      critic_model: "deepseek-chat",
      test_model: "deepseek-chat",
      api_key: "",
      description: "DeepSeek 官方 API（兼容 OpenAI 协议）",
      temperature: 0.2,
      supports_vision: false,
      enabled: true,
    },
  },
  {
    key: "kimi",
    icon: "auto_awesome",
    data: {
      name: "kimi",
      label: "Kimi (Moonshot)",
      base_url: "https://api.moonshot.cn/v1",
      model: "moonshot-v1-auto",
      router_model: "moonshot-v1-8k",
      planning_model: "moonshot-v1-auto",
      coding_model: "moonshot-v1-auto",
      critic_model: "moonshot-v1-8k",
      test_model: "moonshot-v1-8k",
      api_key: "",
      description: "Moonshot AI Kimi 官方 API",
      temperature: 0.2,
      supports_vision: false,
      enabled: true,
    },
  },
  {
    key: "openai",
    icon: "psychology",
    data: {
      name: "openai-official",
      label: "OpenAI",
      base_url: "https://api.openai.com/v1",
      model: "gpt-4o",
      router_model: "gpt-4o-mini",
      planning_model: "gpt-4o",
      coding_model: "gpt-4o",
      critic_model: "gpt-4o-mini",
      test_model: "gpt-4o-mini",
      api_key: "",
      description: "OpenAI 官方 API",
      temperature: 0.2,
      supports_vision: true,
      enabled: true,
    },
  },
  {
    key: "ollama",
    icon: "dns",
    data: { ...initialState },
  },
];

function stageModelSummary(provider: ProviderDescriptor): string[] {
  const items: string[] = [];
  if (provider.stage_models.router) {
    items.push(`router ${provider.stage_models.router}`);
  }
  if (provider.stage_models.planning) {
    items.push(`planning ${provider.stage_models.planning}`);
  }
  if (provider.stage_models.coding) {
    items.push(`coding ${provider.stage_models.coding}`);
  }
  if (provider.stage_models.critic) {
    items.push(`critic ${provider.stage_models.critic}`);
  }
  if (provider.stage_models.test) {
    items.push(`test ${provider.stage_models.test}`);
  }
  return items;
}

export function ProviderManager({
  providers,
  onCreateProvider,
  onDeleteProvider,
}: ProviderManagerProps) {
  const [form, setForm] = useState<CustomProviderUpsertRequest>(initialState);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<CustomProviderTestResponse | null>(null);

  const customProviders = providers.filter((provider) => provider.is_custom);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setTestResult(null);

    try {
      await onCreateProvider(form);
      setForm(initialState);
      setEditingName(null);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "保存 provider 失败");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(name: string) {
    setSaving(true);
    setError(null);
    setTestResult(null);

    try {
      await onDeleteProvider(name);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "删除 provider 失败");
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setSaving(true);
    setError(null);
    setTestResult(null);

    try {
      const result = await testCustomProvider(form);
      setTestResult(result);
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : "测试 provider 失败");
    } finally {
      setSaving(false);
    }
  }

  function handleEdit(provider: ProviderDescriptor) {
    setForm({
      name: provider.name,
      label: provider.label,
      base_url: provider.base_url ?? "",
      model: provider.model,
      router_model: provider.stage_models.router ?? "",
      planning_model: provider.stage_models.planning ?? "",
      coding_model: provider.stage_models.coding ?? "",
      critic_model: provider.stage_models.critic ?? "",
      test_model: provider.stage_models.test ?? "",
      api_key: "",
      description: provider.description,
      temperature: provider.temperature ?? 0.2,
      supports_vision: provider.supports_vision,
      enabled: provider.configured,
    });
    setEditingName(provider.name);
    setError(null);
    setTestResult(null);
  }

  function handleCancelEdit() {
    setForm(initialState);
    setEditingName(null);
    setError(null);
    setTestResult(null);
  }

  return (
    <section className="panel panel-provider">
      <div className="panel-header">
        <span className="panel-kicker">Providers</span>
        <h3>自定义模型提供商</h3>
        <p>
          支持注册 OpenAI 兼容接口，例如本地 Ollama、vLLM 网关或第三方代理服务。Provider
          请求默认不设超时限制；如果上游网关另有限制，以网关设置为准。
        </p>
      </div>

      {/* Preset quick-fill buttons */}
      <div className="provider-presets">
        <span className="provider-presets-label">快速填入</span>
        <div className="provider-presets-grid">
          {PROVIDER_PRESETS.map((preset) => (
            <button
              key={preset.key}
              type="button"
              className={`provider-preset-btn ${form.name === preset.data.name && !editingName ? "is-active" : ""}`}
              onClick={() => {
                setForm({ ...preset.data });
                setEditingName(null);
                setError(null);
                setTestResult(null);
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{preset.icon}</span>
              {preset.data.label}
            </button>
          ))}
        </div>
      </div>

      <form className="prompt-form" onSubmit={handleSubmit}>
        <div className="select-grid">
          <label>
            <span>Provider ID</span>
            <input
              value={form.name}
              disabled={editingName !== null}
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
            <span>默认模型</span>
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

        <div className="select-grid">
          <label>
            <span>路由模型</span>
            <input
              value={form.router_model ?? ""}
              onChange={(event) =>
                setForm((current) => ({ ...current, router_model: event.target.value }))
              }
              placeholder="留空则使用默认模型"
            />
          </label>
          <label>
            <span>规划模型</span>
            <input
              value={form.planning_model ?? ""}
              onChange={(event) =>
                setForm((current) => ({ ...current, planning_model: event.target.value }))
              }
              placeholder="留空则使用默认模型"
            />
          </label>
        </div>

        <div className="select-grid">
          <label>
            <span>编码模型</span>
            <input
              value={form.coding_model ?? ""}
              onChange={(event) =>
                setForm((current) => ({ ...current, coding_model: event.target.value }))
              }
              placeholder="留空则使用默认模型"
            />
          </label>
          <label>
            <span>审查模型</span>
            <input
              value={form.critic_model ?? ""}
              onChange={(event) =>
                setForm((current) => ({ ...current, critic_model: event.target.value }))
              }
              placeholder="留空则使用默认模型"
            />
          </label>
        </div>

        <label>
          <span>连通性测试模型</span>
          <input
            value={form.test_model ?? ""}
            onChange={(event) =>
              setForm((current) => ({ ...current, test_model: event.target.value }))
            }
            placeholder="留空则使用默认模型"
          />
        </label>

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
            placeholder={editingName ? "留空则保留原有密钥，输入新值则覆盖" : "本地 provider 可留空"}
          />
        </label>
        {editingName ? (
          <p className="form-hint">编辑时 API Key 字段为空表示保留原有密钥，输入新值则会覆盖。</p>
        ) : null}

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
        {testResult ? (
          <div className="skill-card">
            <strong>连接测试成功</strong>
            <p>
              {testResult.provider} / {testResult.model} / {testResult.message}
            </p>
            {testResult.raw_excerpt ? <pre>{testResult.raw_excerpt}</pre> : null}
          </div>
        ) : null}

        <div className="form-actions">
          <button type="submit" disabled={saving}>
            {saving ? "处理中..." : editingName ? "保存修改" : "保存自定义 Provider"}
          </button>
          <button type="button" className="ghost-button" onClick={handleTest} disabled={saving}>
            测试连通性
          </button>
          {editingName ? (
            <button
              type="button"
              className="ghost-button"
              onClick={handleCancelEdit}
              disabled={saving}
            >
              取消编辑
            </button>
          ) : null}
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
            {stageModelSummary(provider).length > 0 ? (
              <p>{stageModelSummary(provider).join(" / ")}</p>
            ) : null}
            <div className="history-item-meta">
              <span>{provider.name}</span>
              <span>{provider.kind}</span>
              <span>{provider.supports_vision ? "vision" : "text"}</span>
              <span>{provider.configured ? "enabled" : "disabled"}</span>
              <span>{provider.api_key_configured ? "🔑" : "no-key"}</span>
              <button
                type="button"
                className="inline-action"
                onClick={() => handleEdit(provider)}
                disabled={saving}
              >
                编辑
              </button>
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
