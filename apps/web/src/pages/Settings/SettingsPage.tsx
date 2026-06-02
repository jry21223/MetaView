import React, { useState } from 'react';
import { GlobalTopbar, type Stage } from '../../shared/ui/GlobalTopbar';
import {
  type ProviderSettings,
} from '../../features/providers/hooks/useProviderSettings';
import {
  OPENAI_VOICES,
  useTTS,
} from '../../features/playbook/engine/player/useTTS';
import { API_BASE_URL, type AppEdition } from '../../shared/config/constants';
import type { TweakValues } from '../../features/studio-editor/hooks/useTweaks';
import { THEME_PALETTE, type ThemeName } from '../../shared/config/themePalette';

type SetTweakFn = <K extends keyof TweakValues>(key: K, value: TweakValues[K]) => void;

interface SettingsPageProps {
  appEdition?: AppEdition;
  isDark: boolean;
  isProviderConfigured: boolean;
  accountBalanceYuan?: string | null;
  accountName?: string | null;
  accountAvatarUrl?: string | null;
  onNavigate: (stage: Stage) => void;
  onToggleTheme: () => void;
  onOpenProviderSettings: () => void;

  /** Provider state passed in by the host so changes survive navigation. */
  providerSettings?: ProviderSettings;
  onUpdateProvider?: (next: ProviderSettings) => void;

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
  appEdition = 'self',
  isDark,
  isProviderConfigured,
  accountBalanceYuan = null,
  accountName = null,
  accountAvatarUrl = null,
  onNavigate,
  onToggleTheme,
  onOpenProviderSettings,
  providerSettings,
  onUpdateProvider,
  tweaks,
  setTweak,
}: SettingsPageProps) {
  const showProviderSettings = appEdition === 'self';
  const [apiKey, setApiKey] = useState(providerSettings?.apiKey ?? '');
  const [baseUrl, setBaseUrl] = useState(
    providerSettings?.baseUrl ?? 'https://api.openai.com/v1',
  );
  const [model, setModel] = useState(providerSettings?.model ?? 'gpt-4o-mini');
  const [showKey, setShowKey] = useState(false);
  const [savedFlash, setSavedFlash] = useState<string | null>(null);
  const [ttsProbe, setTtsProbe] = useState<
    { kind: 'idle' } | { kind: 'loading' } | { kind: 'ok' } | { kind: 'error'; detail: string }
  >({ kind: 'idle' });

  const tts = useTTS();

  const flash = (msg: string) => {
    setSavedFlash(msg);
    window.setTimeout(() => setSavedFlash((cur) => (cur === msg ? null : cur)), 1800);
  };

  const handleProviderSave = () => {
    if (!onUpdateProvider) return;
    onUpdateProvider({
      apiKey: apiKey.trim(),
      baseUrl: baseUrl.trim(),
      model: model.trim(),
    });
    flash('服务商配置已保存');
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
    flash('朗读音频缓存已清空');
  };

  /** Fire a short request through the backend TTS proxy so the user can
   *  verify their METAVIEW_TTS_API_KEY is set without having to start a
   *  full playback. 503 from the proxy means the env var isn't configured;
   *  surface that message directly. */
  const handleTtsProbe = async () => {
    setTtsProbe({ kind: 'loading' });
    try {
      const resp = await fetch(`${API_BASE_URL}/api/v1/tts/speech`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: '朗读后端测试。',
          voice: tts.config.voice === 'auto' ? 'alloy' : tts.config.voice,
          rate: 1.0,
        }),
      });
      if (!resp.ok) {
        let detail = `状态码 ${resp.status}`;
        try {
          const payload = (await resp.json()) as { detail?: string };
          if (payload?.detail) detail = payload.detail;
        } catch {
          // fall through with status-only detail
        }
        setTtsProbe({ kind: 'error', detail });
        return;
      }
      setTtsProbe({ kind: 'ok' });
    } catch (err) {
      setTtsProbe({
        kind: 'error',
        detail: err instanceof Error ? err.message : '请求失败',
      });
    }
  };

  return (
    <>
      <GlobalTopbar
        stage="settings"
        appEdition={appEdition}
        isProviderConfigured={isProviderConfigured}
        accountBalanceYuan={accountBalanceYuan}
        accountName={accountName}
        accountAvatarUrl={accountAvatarUrl}
        onNavigate={onNavigate}
        isDark={isDark}
        onToggleTheme={onToggleTheme}
        onOpenProviderSettings={onOpenProviderSettings}
      />
      <main className="mv-settings-body">
        <header className="mv-settings-head">
          <div className="mv-eyebrow-mini">设置</div>
          <h1 className="mv-settings-title">
            {showProviderSettings ? '本地偏好与模型服务商配置' : '账户偏好与播放设置'}
          </h1>
          <p className="mv-settings-sub">
            {showProviderSettings
              ? '所有设置只存在你本地浏览器（localStorage / sessionStorage），不会上传服务端。'
              : '运营版由平台托管模型服务；这里保留播放、朗读和界面偏好。'}
          </p>
          {savedFlash && (
            <div className="mv-settings-flash" role="status" aria-live="polite">
              ✓ {savedFlash}
            </div>
          )}
        </header>

        {showProviderSettings && (
        <section className="mv-settings-section">
          <h2 className="mv-settings-section-title">模型服务商</h2>
          <p className="mv-settings-section-hint">
            配置 OpenAI 或任意兼容接口；留空密钥时会回退到后端默认凭据。
          </p>

          <div className="mv-settings-field">
            <label htmlFor="mv-set-key">API 密钥</label>
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
            <label htmlFor="mv-set-base">接口地址</label>
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
            <label htmlFor="mv-set-model">模型</label>
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
              保存服务商配置
            </button>
          </div>
        </section>
        )}

        {/* ───── TTS ───── */}
        <section className="mv-settings-section">
          <h2 className="mv-settings-section-title">朗读 · 语音合成</h2>
          <p className="mv-settings-section-hint">
            浏览器语音不需要配置；OpenAI 服务端走后端代理（issue #40），
            前端不再存第三方密钥。API 密钥需在服务器 <code>.env</code> 设置
            <code>METAVIEW_TTS_API_KEY</code>（缺省回退到 <code>METAVIEW_OPENAI_API_KEY</code>）。
          </p>

          <div className="mv-settings-field">
            <label>朗读引擎</label>
            <div className="mv-settings-segmented">
              <button
                type="button"
                className={`mv-chip${tts.config.backend === 'system' ? ' mv-chip-primary' : ''}`}
                onClick={() => tts.updateConfig({ backend: 'system' })}
              >
                浏览器语音
              </button>
              <button
                type="button"
                className={`mv-chip${tts.config.backend === 'openai' ? ' mv-chip-primary' : ''}`}
                onClick={() => tts.updateConfig({ backend: 'openai' })}
              >
                OpenAI 服务端
              </button>
            </div>
          </div>

          {tts.config.backend === 'openai' && (
            <div className="mv-settings-field">
              <label>API 密钥状态</label>
              <div className="mv-settings-field-inline">
                <button
                  type="button"
                  className="mv-chip"
                  onClick={handleTtsProbe}
                  disabled={ttsProbe.kind === 'loading'}
                >
                  {ttsProbe.kind === 'loading' ? '测试中…' : '测试朗读后端'}
                </button>
                {ttsProbe.kind === 'ok' && (
                  <span className="mv-settings-probe-ok">✓ 后端可用，密钥已生效</span>
                )}
                {ttsProbe.kind === 'error' && (
                  <span className="mv-settings-probe-err" role="alert">
                    ✗ {ttsProbe.detail}
                  </span>
                )}
                {ttsProbe.kind === 'idle' && (
                  <span className="mv-settings-probe-hint">
                    点一下确认 <code>METAVIEW_TTS_API_KEY</code> 是否已配置
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="mv-settings-field">
            <label htmlFor="mv-set-voice">音色</label>
            <select
              id="mv-set-voice"
              className="mv-text-input"
              value={tts.config.voice}
              onChange={(e) => tts.updateConfig({ voice: e.target.value })}
              disabled={tts.config.backend === 'system'}
            >
              <option value="auto">自动 · 跟随学科推荐</option>
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
              清空朗读音频缓存
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
              工作台显示历史侧栏
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
              清空朗读音频缓存
            </button>
          </div>
        </section>
      </main>
    </>
  );
}
