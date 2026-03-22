import { useEffect, useState } from "react";
import type { FormEvent } from "react";

import type { RuntimeSettings, RuntimeSettingsUpdateRequest } from "../types";

interface TTSSettingsPanelProps {
  settings: RuntimeSettings;
  onSave: (payload: RuntimeSettingsUpdateRequest) => Promise<void>;
}

function buildFormState(settings: RuntimeSettings): RuntimeSettingsUpdateRequest {
  return {
    mock_provider_enabled: settings.mock_provider_enabled,
    tts: {
      enabled: settings.tts.enabled,
      backend: settings.tts.backend,
      model: settings.tts.model,
      base_url: settings.tts.base_url ?? "",
      api_key: "",
      voice: settings.tts.voice,
      rate_wpm: settings.tts.rate_wpm,
      speed: settings.tts.speed,
      max_chars: settings.tts.max_chars,
      timeout_s: settings.tts.timeout_s ?? 120,
    },
  };
}

export function TTSSettingsPanel({ settings, onSave }: TTSSettingsPanelProps) {
  const [form, setForm] = useState<RuntimeSettingsUpdateRequest>(() => buildFormState(settings));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  useEffect(() => {
    setForm(buildFormState(settings));
  }, [settings]);

  const usesRemoteBackend = form.tts.backend !== "system";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSavedMessage(null);

    try {
      await onSave({
        mock_provider_enabled: form.mock_provider_enabled,
        tts: {
          ...form.tts,
          base_url: form.tts.base_url?.trim() || null,
          api_key: form.tts.api_key?.trim() || null,
          timeout_s: form.tts.timeout_s ?? null,
        },
      });
      setSavedMessage("运行时配置已更新，后续生成将直接使用新设置。");
      setForm((current) => ({
        ...current,
        tts: {
          ...current.tts,
          api_key: "",
        },
      }));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存 TTS 配置失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel panel-provider">
      <div className="panel-header">
        <span className="panel-kicker">Narration</span>
        <h3>TTS 与默认行为</h3>
        <p>这里控制 `mimotts-v2` 配音接口，以及是否允许系统继续暴露 `mock` provider。</p>
      </div>

      <form className="prompt-form" onSubmit={handleSubmit}>
        <label className="toggle-field">
          <div>
            <span>启用视频配音</span>
            <p className="field-hint">关闭后会跳过旁白生成，只保留纯视频渲染。</p>
          </div>
          <button
            type="button"
            className={`switch-button ${form.tts.enabled ? "is-active" : ""}`}
            onClick={() =>
              setForm((current) => ({
                ...current,
                tts: { ...current.tts, enabled: !current.tts.enabled },
              }))
            }
            aria-pressed={form.tts.enabled}
          >
            <span />
            <strong>{form.tts.enabled ? "开启" : "关闭"}</strong>
          </button>
        </label>

        <label className="toggle-field">
          <div>
            <span>允许 mock provider</span>
            <p className="field-hint">关闭后，前端和后端默认都会优先走已配置的真实 API。</p>
          </div>
          <button
            type="button"
            className={`switch-button ${form.mock_provider_enabled ? "is-active" : ""}`}
            onClick={() =>
              setForm((current) => ({
                ...current,
                mock_provider_enabled: !current.mock_provider_enabled,
              }))
            }
            aria-pressed={form.mock_provider_enabled}
          >
            <span />
            <strong>{form.mock_provider_enabled ? "启用" : "禁用"}</strong>
          </button>
        </label>

        <div className="select-grid">
          <label>
            <span>TTS Backend</span>
            <select
              value={form.tts.backend}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  tts: {
                    ...current.tts,
                    backend: event.target.value as RuntimeSettingsUpdateRequest["tts"]["backend"],
                  },
                }))
              }
            >
              <option value="openai_compatible">openai_compatible</option>
              <option value="auto">auto</option>
              <option value="system">system</option>
            </select>
          </label>

          <label>
            <span>TTS Model</span>
            <input
              value={form.tts.model}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  tts: { ...current.tts, model: event.target.value },
                }))
              }
              placeholder="mimotts-v2"
            />
          </label>
        </div>

        <div className="select-grid">
          <label>
            <span>Voice</span>
            <input
              value={form.tts.voice}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  tts: { ...current.tts, voice: event.target.value },
                }))
              }
              placeholder="default"
            />
          </label>

          <label>
            <span>Rate WPM</span>
            <input
              type="number"
              min="60"
              max="320"
              value={form.tts.rate_wpm}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  tts: { ...current.tts, rate_wpm: Number(event.target.value) },
                }))
              }
            />
          </label>
        </div>

        <div className="select-grid">
          <label>
            <span>Speed</span>
            <input
              type="number"
              min="0.5"
              max="1.5"
              step="0.01"
              value={form.tts.speed}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  tts: { ...current.tts, speed: Number(event.target.value) },
                }))
              }
            />
          </label>

          <label>
            <span>Max Chars</span>
            <input
              type="number"
              min="100"
              max="20000"
              value={form.tts.max_chars}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  tts: { ...current.tts, max_chars: Number(event.target.value) },
                }))
              }
            />
          </label>
        </div>

        <label>
          <span>Timeout (s)</span>
          <input
            type="number"
            min="1"
            max="600"
            step="1"
            value={form.tts.timeout_s ?? 120}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                tts: { ...current.tts, timeout_s: Number(event.target.value) },
              }))
            }
          />
        </label>

        <label>
          <span>TTS Base URL</span>
          <input
            value={form.tts.base_url ?? ""}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                tts: { ...current.tts, base_url: event.target.value },
              }))
            }
            placeholder={usesRemoteBackend ? "https://your-tts-gateway/v1" : "system 模式下可留空"}
          />
        </label>

        <label>
          <span>TTS API Key</span>
          <input
            type="password"
            value={form.tts.api_key ?? ""}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                tts: { ...current.tts, api_key: event.target.value },
              }))
            }
            placeholder={
              settings.tts.api_key_configured ? "留空则清空当前 Key" : "输入新的 TTS API Key"
            }
          />
        </label>

        <div className="history-item-meta">
          <span>{settings.tts.api_key_configured ? "api key configured" : "api key missing"}</span>
          <span>{settings.tts.backend}</span>
          <span>{settings.mock_provider_enabled ? "mock enabled" : "mock disabled"}</span>
        </div>

        {savedMessage ? <p>{savedMessage}</p> : null}
        {error ? <p className="error-text">{error}</p> : null}

        <div className="form-actions">
          <button type="submit" disabled={saving}>
            {saving ? "保存中..." : "保存运行时配置"}
          </button>
          <p>留空会清空当前 TTS Key；`auto` 模式会优先尝试这里的远程配置，再回退到 generation provider。</p>
        </div>
      </form>
    </section>
  );
}
