import React, { useState } from "react";
import {
  type ProviderSettings,
  type RouterModeSetting,
} from "../../features/providers/hooks/useProviderSettings";
import {
  OPENAI_VOICES,
  useTTS,
} from "../../features/playbook/engine/player/useTTS";
import { API_BASE_URL, type AppEdition } from "../../shared/config/constants";
import type { TweakValues } from "../../features/studio-editor/hooks/useTweaks";
import {
  THEME_PALETTE,
  type ThemeName,
} from "../../shared/config/themePalette";

type SetTweakFn = <K extends keyof TweakValues>(
  key: K,
  value: TweakValues[K],
) => void;

interface SettingsPageProps {
  appEdition?: AppEdition;

  /** Provider state passed in by the host so changes survive navigation. */
  providerSettings?: ProviderSettings;
  onUpdateProvider?: (next: ProviderSettings) => void;

  /** Appearance tweaks (theme / density / layout). */
  tweaks: TweakValues;
  setTweak: SetTweakFn;
}

const DENSITY_OPTIONS: Array<{ id: TweakValues["density"]; label: string }> = [
  { id: "compact", label: "紧凑" },
  { id: "regular", label: "常规" },
  { id: "comfy", label: "宽松" },
];

const LAYOUT_OPTIONS: Array<{
  id: TweakValues["layout"];
  label: string;
  hint: string;
}> = [
  { id: "drawer", label: "抽屉", hint: "默认；侧栏可收纳" },
  { id: "left", label: "左栏固定", hint: "永远显示左栏" },
  { id: "top", label: "顶部", hint: "极简 · 全宽" },
];

const ROUTER_MODE_OPTIONS: Array<{
  id: RouterModeSetting;
  label: string;
  hint: string;
}> = [
  { id: "hybrid", label: "Hybrid", hint: "小模型优先，失败回退规则" },
  { id: "llm", label: "LLM", hint: "仅使用路由模型" },
  { id: "heuristic", label: "Heuristic", hint: "仅使用确定性规则" },
  { id: "off", label: "Off", hint: "关闭路由模型" },
];

const THEME_OPTIONS = (Object.keys(THEME_PALETTE) as ThemeName[]).map(
  (name) => ({
    id: name,
    ...THEME_PALETTE[name],
  }),
);

const VOICE_RATE_BOUNDS = { min: 0.5, max: 2.0, step: 0.05 } as const;

function clampNumber(
  value: number,
  fallback: number,
  min: number,
  max: number,
): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

export function SettingsPage({
  appEdition = "self",
  providerSettings,
  onUpdateProvider,
  tweaks,
  setTweak,
}: SettingsPageProps) {
  const showProviderSettings = appEdition === "self";
  const [apiKey, setApiKey] = useState(providerSettings?.apiKey ?? "");
  const [baseUrl, setBaseUrl] = useState(
    providerSettings?.baseUrl ?? "https://api.openai.com/v1",
  );
  const [model, setModel] = useState(providerSettings?.model ?? "gpt-4o-mini");
  const [routerMode, setRouterMode] = useState<RouterModeSetting>(
    providerSettings?.routerMode ?? "hybrid",
  );
  const [routerModel, setRouterModel] = useState(
    providerSettings?.routerModel ?? "",
  );
  const [routerMinConfidence, setRouterMinConfidence] = useState(
    providerSettings?.routerMinConfidence ?? 0.72,
  );
  const [routerTimeoutS, setRouterTimeoutS] = useState(
    providerSettings?.routerTimeoutS ?? 12,
  );
  const [showKey, setShowKey] = useState(false);
  const [showTtsKey, setShowTtsKey] = useState(false);
  const [savedFlash, setSavedFlash] = useState<string | null>(null);
  const [ttsProbe, setTtsProbe] = useState<
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "ok" }
    | { kind: "error"; detail: string }
  >({ kind: "idle" });

  const tts = useTTS();
  const showLocalTtsSettings = appEdition === "self";
  const themeDefaultAccent = THEME_PALETTE[tweaks.theme].accent;
  const accentIsThemeDefault =
    tweaks.accent.toLowerCase() === themeDefaultAccent.toLowerCase();

  const flash = (msg: string) => {
    setSavedFlash(msg);
    window.setTimeout(
      () => setSavedFlash((cur) => (cur === msg ? null : cur)),
      1800,
    );
  };

  const routerUsesModel = routerMode === "hybrid" || routerMode === "llm";

  const handleProviderSave = () => {
    if (!onUpdateProvider) return;
    onUpdateProvider({
      apiKey: apiKey.trim(),
      baseUrl: baseUrl.trim(),
      model: model.trim(),
      routerMode,
      routerModel: routerModel.trim(),
      routerMinConfidence: clampNumber(routerMinConfidence, 0.72, 0, 1),
      routerTimeoutS: clampNumber(routerTimeoutS, 12, 1, 60),
    });
    flash("服务商与路由配置已保存");
  };

  const handleClearExportJobs = () => {
    try {
      window.sessionStorage.removeItem("mv_export_jobs");
      flash("已清除本地导出任务记录");
    } catch {
      flash("清除失败（sessionStorage 不可用）");
    }
  };

  const handleClearTtsCache = () => {
    tts.clearCache();
    flash("朗读音频缓存已清空");
  };

  /** Fire a short request through the backend TTS proxy so the user can
   *  verify their METAVIEW_TTS_API_KEY is set without having to start a
   *  full playback. 503 from the proxy means the env var isn't configured;
   *  surface that message directly. */
  const handleTtsProbe = async () => {
    setTtsProbe({ kind: "loading" });
    try {
      const resp = await fetch(`${API_BASE_URL}/api/v1/tts/speech`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "朗读后端测试。",
          voice: tts.config.voice === "auto" ? "alloy" : tts.config.voice,
          rate: 1.0,
          ...(showLocalTtsSettings && {
            api_key: tts.config.apiKey || null,
            base_url: tts.config.baseUrl || null,
            model: tts.config.model || null,
          }),
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
        setTtsProbe({ kind: "error", detail });
        return;
      }
      setTtsProbe({ kind: "ok" });
    } catch (err) {
      setTtsProbe({
        kind: "error",
        detail: err instanceof Error ? err.message : "请求失败",
      });
    }
  };

  return (
    <>
      <main className="mv-settings-body">
        <header className="mv-settings-head">
          <div className="mv-eyebrow-mini">SYSTEM INSTRUMENTS / 设置</div>
          <h1 className="mv-settings-title">
            {showProviderSettings ? "教学生成与模型路由" : "账户偏好与播放设置"}
          </h1>
          <p className="mv-settings-sub">
            {showProviderSettings
              ? "把生成模型、路由模型、朗读和界面偏好放在一页；本地设置只保存在当前浏览器。"
              : "运营版由平台托管模型服务；这里保留播放、朗读和界面偏好。"}
          </p>
          {savedFlash && (
            <div className="mv-settings-flash" role="status" aria-live="polite">
              ✓ {savedFlash}
            </div>
          )}
        </header>

        <div className="mv-settings-layout">
          <nav className="mv-settings-nav" aria-label="设置分区">
            <span className="mv-settings-nav__label">SECTIONS</span>
            {showProviderSettings && (
              <>
                <a href="#settings-provider"><span>01</span>生成模型</a>
                <a href="#settings-router"><span>02</span>模型路由</a>
              </>
            )}
            <a href="#settings-tts"><span>{showProviderSettings ? "03" : "01"}</span>朗读</a>
            <a href="#settings-appearance"><span>{showProviderSettings ? "04" : "02"}</span>外观</a>
            <a href="#settings-data"><span>{showProviderSettings ? "05" : "03"}</span>本地数据</a>
            <small>设置实时保存在当前浏览器</small>
          </nav>

          <div className="mv-settings-sections">
        {showProviderSettings && (
          <section className="mv-settings-section" id="settings-provider">
            <div className="mv-settings-section-intro">
              <span>01 / PROVIDER</span>
              <h2 className="mv-settings-section-title">生成模型</h2>
              <p className="mv-settings-section-hint">
                配置 OpenAI 或任意兼容接口；留空密钥时会回退到后端默认凭据。
              </p>
            </div>

            <div className="mv-settings-field">
              <label htmlFor="mv-set-key">API 密钥</label>
              <div className="mv-settings-field-inline">
                <input
                  id="mv-set-key"
                  type={showKey ? "text" : "password"}
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
                  {showKey ? "隐藏" : "显示"}
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
              <label htmlFor="mv-set-model">生成模型</label>
              <input
                id="mv-set-model"
                type="text"
                className="mv-text-input mv-mono"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="gpt-4o-mini"
              />
            </div>
          </section>
        )}

        {showProviderSettings && (
          <section className="mv-settings-section" id="settings-router">
            <div className="mv-settings-section-intro">
              <span>02 / ROUTER</span>
              <h2 className="mv-settings-section-title">小模型路由</h2>
              <p className="mv-settings-section-hint">
                题目进入生成链路前先判断学科与 specialized
                skill；路由模型建议使用小而快的模型。
              </p>
            </div>

            <div className="mv-settings-field">
              <label>Router Mode</label>
              <div className="mv-settings-segmented mv-router-mode-grid">
                {ROUTER_MODE_OPTIONS.map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    className={`mv-chip${routerMode === mode.id ? " mv-chip-primary" : ""}`}
                    onClick={() => setRouterMode(mode.id)}
                    title={mode.hint}
                  >
                    <span className="mv-settings-layout-label">
                      {mode.label}
                    </span>
                    <span className="mv-settings-layout-hint">{mode.hint}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="mv-settings-field">
              <label htmlFor="mv-set-router-model">Router Model</label>
              <input
                id="mv-set-router-model"
                type="text"
                className="mv-text-input mv-mono"
                value={routerModel}
                onChange={(e) => setRouterModel(e.target.value)}
                placeholder="留空则复用后端默认 / 生成模型"
                disabled={!routerUsesModel}
              />
            </div>

            <div className="mv-settings-router-grid">
              <div className="mv-settings-field">
                <label htmlFor="mv-set-router-confidence">
                  最低置信度 · {routerMinConfidence.toFixed(2)}
                </label>
                <input
                  id="mv-set-router-confidence"
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={routerMinConfidence}
                  onChange={(e) =>
                    setRouterMinConfidence(Number.parseFloat(e.target.value))
                  }
                  disabled={!routerUsesModel}
                  className="mv-settings-slider"
                />
              </div>
              <div className="mv-settings-field">
                <label htmlFor="mv-set-router-timeout">路由超时（秒）</label>
                <input
                  id="mv-set-router-timeout"
                  type="number"
                  min={1}
                  max={60}
                  step={1}
                  className="mv-text-input mv-mono"
                  value={routerTimeoutS}
                  onChange={(e) =>
                    setRouterTimeoutS(Number.parseFloat(e.target.value))
                  }
                  disabled={!routerUsesModel}
                />
              </div>
            </div>

            <div className="mv-settings-actions">
              <button
                type="button"
                className="mv-chip mv-chip-primary"
                onClick={handleProviderSave}
              >
                保存模型与路由配置
              </button>
            </div>
          </section>
        )}

        {/* ───── TTS ───── */}
        <section className="mv-settings-section" id="settings-tts">
          <div className="mv-settings-section-intro">
            <span>{showProviderSettings ? "03" : "01"} / NARRATION</span>
            <h2 className="mv-settings-section-title">
              {showLocalTtsSettings ? "本地 TTS 配置" : "平台托管 TTS"}
            </h2>
            <p className="mv-settings-section-hint">
              {showLocalTtsSettings ? (
                <>
                  浏览器语音不需要配置；OpenAI / 兼容 TTS
                  通过后端临时代理，请求只使用当前浏览器保存的本地配置。
                </>
              ) : (
                <>
                  运营版使用平台托管 TTS。API 密钥由服务器 <code>.env</code>{" "}
                  中的 <code>METAVIEW_TTS_API_KEY</code> 或{" "}
                  <code>METAVIEW_OPENAI_API_KEY</code> 提供。
                </>
              )}
            </p>
          </div>

          <div className="mv-settings-field">
            <label>朗读引擎</label>
            <div className="mv-settings-segmented">
              <button
                type="button"
                className={`mv-chip${tts.config.backend === "system" ? " mv-chip-primary" : ""}`}
                onClick={() => tts.updateConfig({ backend: "system" })}
              >
                浏览器语音
              </button>
              <button
                type="button"
                className={`mv-chip${tts.config.backend === "openai" ? " mv-chip-primary" : ""}`}
                onClick={() => tts.updateConfig({ backend: "openai" })}
              >
                {showLocalTtsSettings ? "OpenAI / 兼容 API" : "平台 TTS"}
              </button>
            </div>
          </div>

          {showLocalTtsSettings && (
            <>
              <div className="mv-settings-field">
                <label htmlFor="mv-set-tts-key">TTS API 密钥</label>
                <div className="mv-settings-field-inline">
                  <input
                    id="mv-set-tts-key"
                    type={showTtsKey ? "text" : "password"}
                    className="mv-text-input mv-mono"
                    value={tts.config.apiKey}
                    onChange={(e) => tts.updateConfig({ apiKey: e.target.value })}
                    placeholder="sk-..."
                  />
                  <button
                    type="button"
                    className="mv-chip"
                    onClick={() => setShowTtsKey((s) => !s)}
                  >
                    {showTtsKey ? "隐藏" : "显示"}
                  </button>
                </div>
              </div>

              <div className="mv-settings-field">
                <label htmlFor="mv-set-tts-base">TTS 接口地址</label>
                <input
                  id="mv-set-tts-base"
                  type="url"
                  className="mv-text-input mv-mono"
                  value={tts.config.baseUrl}
                  onChange={(e) => tts.updateConfig({ baseUrl: e.target.value })}
                  placeholder="https://api.openai.com/v1"
                />
              </div>

              <div className="mv-settings-field">
                <label htmlFor="mv-set-tts-model">TTS 模型</label>
                <input
                  id="mv-set-tts-model"
                  type="text"
                  className="mv-text-input mv-mono"
                  value={tts.config.model}
                  onChange={(e) => tts.updateConfig({ model: e.target.value })}
                  placeholder="tts-1"
                />
              </div>
            </>
          )}

          {tts.config.backend === "openai" && (
            <div className="mv-settings-field">
              <label>API 密钥状态</label>
              <div className="mv-settings-field-inline">
                <button
                  type="button"
                  className="mv-chip"
                  onClick={handleTtsProbe}
                  disabled={ttsProbe.kind === "loading"}
                >
                  {ttsProbe.kind === "loading" ? "测试中…" : "测试朗读后端"}
                </button>
                {ttsProbe.kind === "ok" && (
                  <span className="mv-settings-probe-ok">
                    ✓ 后端可用，密钥已生效
                  </span>
                )}
                {ttsProbe.kind === "error" && (
                  <span className="mv-settings-probe-err" role="alert">
                    ✗ {ttsProbe.detail}
                  </span>
                )}
                {ttsProbe.kind === "idle" && (
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
              disabled={tts.config.backend === "system"}
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
                tts.updateConfig({
                  rate: Number.parseFloat(e.target.value) || 1.0,
                })
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
        <section className="mv-settings-section" id="settings-appearance">
          <div className="mv-settings-section-intro">
            <span>{showProviderSettings ? "04" : "02"} / APPEARANCE</span>
            <h2 className="mv-settings-section-title">外观</h2>
            <p className="mv-settings-section-hint">
              实时生效；主题和强调色会同步到工作台与播放器。
            </p>
          </div>

          <div className="mv-settings-field">
            <label>主题</label>
            <div
              className="mv-settings-theme-grid"
              role="group"
              aria-label="主题"
            >
              {THEME_OPTIONS.map((theme) => {
                const selected = tweaks.theme === theme.id;
                return (
                  <button
                    key={theme.id}
                    type="button"
                    className={`mv-settings-theme-card${selected ? " is-on" : ""}`}
                    aria-pressed={selected}
                    onClick={() => setTweak("theme", theme.id)}
                    style={
                      {
                        "--theme-preview-surface": theme.surface2,
                        "--theme-preview-ink": theme.ink,
                        "--theme-preview-ink-2": theme.ink2,
                        "--theme-preview-line": theme.line,
                        "--theme-preview-line-2": theme.line2,
                        "--theme-preview-accent": theme.accent,
                      } as React.CSSProperties
                    }
                  >
                    <span className="mv-settings-theme-stage" aria-hidden>
                      <span className="mv-settings-theme-line is-wide" />
                      <span className="mv-settings-theme-line" />
                      <span className="mv-settings-theme-bars">
                        <span />
                        <span />
                        <span />
                      </span>
                    </span>
                    <span className="mv-settings-theme-meta">
                      <span className="mv-settings-theme-name">
                        {theme.label}
                      </span>
                      <span className="mv-settings-theme-mode">
                        {theme.type}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mv-settings-field">
            <label htmlFor="mv-set-accent">强调色</label>
            <div className="mv-settings-accent-row">
              <input
                id="mv-set-accent"
                type="color"
                value={tweaks.accent}
                onChange={(e) => setTweak("accent", e.target.value)}
                aria-label="强调色"
              />
              <span
                className="mv-settings-accent-swatch"
                style={{ background: tweaks.accent }}
              />
              <span className="mv-settings-accent-value mv-mono">
                {tweaks.accent}
              </span>
              <button
                type="button"
                className="mv-chip mv-settings-accent-reset"
                disabled={accentIsThemeDefault}
                onClick={() => setTweak("accent", themeDefaultAccent)}
              >
                恢复主题默认色
              </button>
            </div>
          </div>

          <div className="mv-settings-field">
            <label>密度</label>
            <div className="mv-settings-segmented">
              {DENSITY_OPTIONS.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  className={`mv-chip${tweaks.density === d.id ? " mv-chip-primary" : ""}`}
                  onClick={() => setTweak("density", d.id)}
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
                  className={`mv-chip${tweaks.layout === l.id ? " mv-chip-primary" : ""}`}
                  onClick={() => setTweak("layout", l.id)}
                  title={l.hint}
                >
                  <span className="mv-settings-layout-label">{l.label}</span>
                  <span className="mv-settings-layout-hint">{l.hint}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="mv-settings-field mv-settings-field-row">
            <label htmlFor="mv-set-dock">工作台显示历史侧栏</label>
            <input
              id="mv-set-dock"
              type="checkbox"
              checked={tweaks.showHistoryDock}
              onChange={(e) => setTweak("showHistoryDock", e.target.checked)}
            />
          </div>
        </section>

        {/* ───── Local data ───── */}
        <section className="mv-settings-section mv-settings-danger" id="settings-data">
          <div className="mv-settings-section-intro">
            <span>{showProviderSettings ? "05" : "03"} / LOCAL DATA</span>
            <h2 className="mv-settings-section-title">本地数据</h2>
            <p className="mv-settings-section-hint">
              服务端历史不受影响；仅清理浏览器里的本地状态。
            </p>
          </div>

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
          </div>
        </div>
      </main>
    </>
  );
}
