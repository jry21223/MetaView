import React, { useState } from 'react';
import { GlobalTopbar, type Stage } from '../../shared/ui/GlobalTopbar';
import {
  type ProviderSettings,
} from '../../features/providers/hooks/useProviderSettings';
import {
  OPENAI_VOICES,
  useTTS,
} from '../../features/playbook/engine/player/useTTS';
import type { TweakValues } from '../../features/studio-editor/hooks/useTweaks';
import { THEME_PALETTE, type ThemeName } from '../../shared/config/themePalette';

type SetTweakFn = <K extends keyof TweakValues>(key: K, value: TweakValues[K]) => void;

interface SettingsPageProps {
  isDark: boolean;
  isProviderConfigured: boolean;
  onNavigate: (stage: Stage) => void;
  onToggleTheme: () => void;
  onOpenProviderSettings: () => void;

  /** Provider state passed in by the host so changes survive navigation. */
  providerSettings: ProviderSettings;
  onUpdateProvider: (next: ProviderSettings) => void;

  /** Appearance tweaks (theme / density / layout). */
  tweaks: TweakValues;
  setTweak: SetTweakFn;
}

const DENSITY_OPTIONS: Array<{ id: TweakValues['density']; label: string }> = [
  { id: 'compact', label: '紧凑' },
  { id: 'regular', label: '常规' },
  { id: 'comfy', label: '宽松' },
];

const LAYOUT_OPTIONS: Array<{ id: TweakValues['layout']; label: string; hint: string }> = [
  { id: 'drawer', label: '抽屉', hint: '默认；侧栏可收纳' },
  { id: 'left', label: '左栏固定', hint: '永远显示左栏' },
  { id: 'top', label: '顶部', hint: '极简 · 全宽' },
];

const VOICE_RATE_BOUNDS = { min: 0.5, max: 2.0, step: 0.05 } as const;

export function SettingsPage({
  isDark,
  isProviderConfigured,
  onNavigate,
  onToggleTheme,
  onOpenProviderSettings,
  providerSettings,
  onUpdateProvider,
  tweaks,
  setTweak,
}: SettingsPageProps) {
  const [apiKey, setApiKey] = useState(providerSettings.apiKey);
  const [baseUrl, setBaseUrl] = useState(providerSettings.baseUrl);
  const [model, setModel] = useState(providerSettings.model);
  const [showKey, setShowKey] = useState(false);
  const [savedFlash, setSavedFlash] = useState<string | null>(null);

  const tts = useTTS();

  const flash = (msg: string) => {
    setSavedFlash(msg);
    window.setTimeout(() => setSavedFlash((cur) => (cur === msg ? null : cur)), 1800);
  };

  const handleProviderSave = () => {
    onUpdateProvider({
      apiKey: apiKey.trim(),
      baseUrl: baseUrl.trim(),
      model: model.trim(),
    });
    flash('Provider 已保存');
  };

  const handleClearExportJobs = () => {
    try {
      window.sessionStorage.removeItem('mv_export_jobs');
      flash('已清除本地导出任务记录');
    } catch {
      flash('清除失败（sessionStorage 不可用）');
    }
  };

  const handleClearTtsCache = () => {
    tts.clearCache();
    flash('TTS 音频缓存已清空');
  };

  return (
    <>
      <GlobalTopbar
        stage="settings"
        isProviderConfigured={isProviderConfigured}
        onNavigate={onNavigate}
        isDark={isDark}
        onToggleTheme={onToggleTheme}
        onOpenProviderSettings={onOpenProviderSettings}
      />
      <main className="mv-settings-body">
        <header className="mv-settings-head">
          <div className="mv-eyebrow-mini">SETTINGS</div>
          <h1 className="mv-settings-title">本地偏好与 Provider 配置</h1>
          <p className="mv-settings-sub">
            所有设置只存在你本地浏览器（localStorage / sessionStorage），不会上传服务端。
          </p>
          {savedFlash && (
            <div className="mv-settings-flash" role="status" aria-live="polite">
              ✓ {savedFlash}
            </div>
          )}
        </header>

        {/* ───── LLM Provider ───── */}
        <section className="mv-settings-section">
          <h2 className="mv-settings-section-title">LLM Provider</h2>
          <p className="mv-settings-section-hint">
            配置 OpenAI 或任意兼容接口；留空 API Key 时会回退到后端默认凭据。
          </p>

          <div className="mv-settings-field">
            <label htmlFor="mv-set-key">API Key</label>
            <div className="mv-settings-field-inline">
              <input
                id="mv-set-key"
                type={showKey ? 'text' : 'password'}
                className="mv-text-input mv-mono"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
              />
              <button
                type="button"
                className="mv-chip"
                onClick={() => setShowKey((s) => !s)}
              >
                {showKey ? '隐藏' : '显示'}
              </button>
            </div>
          </div>

          <div className="mv-settings-field">
            <label htmlFor="mv-set-base">Base URL</label>
            <input
              id="mv-set-base"
              type="url"
              className="mv-text-input mv-mono"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.openai.com/v1"
            />
          </div>

          <div className="mv-settings-field">
            <label htmlFor="mv-set-model">Model</label>
            <input
              id="mv-set-model"
              type="text"
              className="mv-text-input mv-mono"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="gpt-4o-mini"
            />
          </div>

          <div className="mv-settings-actions">
            <button
              type="button"
              className="mv-chip mv-chip-primary"
              onClick={handleProviderSave}
            >
              保存 Provider
            </button>
          </div>
        </section>

        {/* ───── TTS ───── */}
        <section className="mv-settings-section">
          <h2 className="mv-settings-section-title">TTS · 朗读</h2>
          <p className="mv-settings-section-hint">
            选择朗读后端：浏览器自带的 system 不需要配置；OpenAI 走后端代理（issue #40），
            API Key 由后端 <code>METAVIEW_TTS_API_KEY</code> 提供。
          </p>

          <div className="mv-settings-field">
            <label>后端</label>
            <div className="mv-settings-segmented">
              <button
                type="button"
                className={`mv-chip${tts.config.backend === 'system' ? ' mv-chip-primary' : ''}`}
                onClick={() => tts.updateConfig({ backend: 'system' })}
              >
                system · 浏览器
              </button>
              <button
                type="button"
                className={`mv-chip${tts.config.backend === 'openai' ? ' mv-chip-primary' : ''}`}
                onClick={() => tts.updateConfig({ backend: 'openai' })}
              >
                openai · 服务端
              </button>
            </div>
          </div>

          <div className="mv-settings-field">
            <label htmlFor="mv-set-voice">Voice</label>
            <select
              id="mv-set-voice"
              className="mv-text-input"
              value={tts.config.voice}
              onChange={(e) => tts.updateConfig({ voice: e.target.value })}
              disabled={tts.config.backend === 'system'}
            >
              <option value="auto">auto · 跟随学科推荐</option>
              {OPENAI_VOICES.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label} — {v.description}
                </option>
              ))}
            </select>
          </div>

          <div className="mv-settings-field">
            <label htmlFor="mv-set-rate">
              语速 · {tts.config.rate.toFixed(2)}×
            </label>
            <input
              id="mv-set-rate"
              type="range"
              min={VOICE_RATE_BOUNDS.min}
              max={VOICE_RATE_BOUNDS.max}
              step={VOICE_RATE_BOUNDS.step}
              value={tts.config.rate}
              onChange={(e) =>
                tts.updateConfig({ rate: Number.parseFloat(e.target.value) || 1.0 })
              }
              className="mv-settings-slider"
            />
          </div>

          <div className="mv-settings-actions">
            <button
              type="button"
              className="mv-chip"
              onClick={handleClearTtsCache}
            >
              清空 TTS 音频缓存
            </button>
          </div>
        </section>

        {/* ───── Appearance ───── */}
        <section className="mv-settings-section">
          <h2 className="mv-settings-section-title">外观</h2>
          <p className="mv-settings-section-hint">
            实时生效；同样的设置在顶部右侧的小齿轮也能切换。
          </p>

          <div className="mv-settings-field">
            <label htmlFor="mv-set-theme">主题</label>
            <select
              id="mv-set-theme"
              className="mv-text-input"
              value={tweaks.theme}
              onChange={(e) => setTweak('theme', e.target.value as ThemeName)}
            >
              {(Object.keys(THEME_PALETTE) as ThemeName[]).map((name) => (
                <option key={name} value={name}>
                  {THEME_PALETTE[name].label}
                </option>
              ))}
            </select>
          </div>

          <div className="mv-settings-field">
            <label>密度</label>
            <div className="mv-settings-segmented">
              {DENSITY_OPTIONS.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  className={`mv-chip${tweaks.density === d.id ? ' mv-chip-primary' : ''}`}
                  onClick={() => setTweak('density', d.id)}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mv-settings-field">
            <label>布局</label>
            <div className="mv-settings-segmented mv-settings-layout-grid">
              {LAYOUT_OPTIONS.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  className={`mv-chip${tweaks.layout === l.id ? ' mv-chip-primary' : ''}`}
                  onClick={() => setTweak('layout', l.id)}
                  title={l.hint}
                >
                  <span className="mv-settings-layout-label">{l.label}</span>
                  <span className="mv-settings-layout-hint">{l.hint}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="mv-settings-field mv-settings-field-row">
            <label htmlFor="mv-set-dock">
              工作台显示历史 Dock
            </label>
            <input
              id="mv-set-dock"
              type="checkbox"
              checked={tweaks.showHistoryDock}
              onChange={(e) => setTweak('showHistoryDock', e.target.checked)}
            />
          </div>
        </section>

        {/* ───── Local data ───── */}
        <section className="mv-settings-section mv-settings-danger">
          <h2 className="mv-settings-section-title">本地数据</h2>
          <p className="mv-settings-section-hint">
            服务端历史不受影响；仅清理浏览器里的本地状态。
          </p>

          <div className="mv-settings-actions">
            <button
              type="button"
              className="mv-chip"
              onClick={handleClearExportJobs}
            >
              清除导出任务恢复记录
            </button>
            <button
              type="button"
              className="mv-chip"
              onClick={handleClearTtsCache}
            >
              清空 TTS 音频缓存
            </button>
          </div>
        </section>
      </main>
    </>
  );
}
