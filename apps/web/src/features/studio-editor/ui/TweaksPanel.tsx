import React from 'react';
import { TweakValues } from '../hooks/useTweaks';
import { THEME_PALETTE, type ThemeName } from '../../../shared/config/themePalette';

interface TweaksPanelProps {
  t: TweakValues;
  setTweak: (key: keyof TweakValues, value: TweakValues[keyof TweakValues]) => void;
}

const THEME_OPTIONS = Object.entries(THEME_PALETTE).map(([id, descriptor]) => ({
  id: id as ThemeName,
  label: descriptor.label,
  accent: descriptor.accent,
  surface: descriptor.surface2,
}));

export function TweaksPanel({ t, setTweak }: TweaksPanelProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <button
        className="mv-tweaks-btn"
        title="设计调节"
        onClick={() => setOpen((o) => !o)}
        aria-label="打开设计调节面板"
      >
        ⚙
      </button>

      {open && (
        <div className="mv-tweaks-panel">
          <div className="mv-tweaks-head">
            <span>TWEAKS</span>
            <button className="mv-icon-btn" onClick={() => setOpen(false)}>×</button>
          </div>
          <div className="mv-tweaks-body">
            <div className="mv-tweak-section">主题</div>

            <div className="mv-tweak-row">
              <div className="mv-tweak-label">主题</div>
              <div
                className="mv-tweak-theme-grid"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                  gap: 6,
                }}
              >
                {THEME_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className={`mv-tweak-theme-chip${t.theme === opt.id ? ' is-on' : ''}`}
                    onClick={() => setTweak('theme', opt.id)}
                    title={opt.label}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '4px 8px',
                      borderRadius: 6,
                      border: `1px solid ${t.theme === opt.id ? opt.accent : 'var(--line-2)'}`,
                      background: t.theme === opt.id ? `${opt.accent}26` : 'transparent',
                      color: 'var(--ink)',
                      fontSize: 11,
                      cursor: 'pointer',
                    }}
                  >
                    <span
                      aria-hidden
                      style={{
                        width: 14,
                        height: 14,
                        borderRadius: 4,
                        background: opt.surface,
                        border: `1px solid ${opt.accent}`,
                        boxShadow: `inset 0 0 0 2px ${opt.accent}`,
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {opt.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="mv-tweak-row">
              <div className="mv-tweak-label">强调色</div>
              <input
                type="color"
                value={t.accent}
                onChange={(e) => setTweak('accent', e.target.value)}
                style={{ width: 56, height: 26, borderRadius: 6, border: '1px solid var(--line)', cursor: 'pointer', background: 'transparent' }}
              />
            </div>

            <div className="mv-tweak-section">布局</div>

            <div className="mv-tweak-row">
              <div className="mv-tweak-label">历史/工具位置</div>
              <div className="mv-tweak-radios">
                {(['drawer', 'left', 'top'] as const).map((v) => (
                  <button
                    key={v}
                    className={`mv-tweak-radio${t.layout === v ? ' is-on' : ''}`}
                    onClick={() => setTweak('layout', v)}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>

            <div className="mv-tweak-row">
              <div className="mv-tweak-label">左栏宽度</div>
              <div className="mv-tweak-slider-row">
                <input type="range" className="mv-tweak-slider" min={12} max={50}
                  value={t.leftRatio} onChange={(e) => setTweak('leftRatio', Number(e.target.value))} />
                <span className="mv-tweak-val">{t.leftRatio}%</span>
              </div>
            </div>

            <div className="mv-tweak-row">
              <div className="mv-tweak-label">参数区高度</div>
              <div className="mv-tweak-slider-row">
                <input type="range" className="mv-tweak-slider" min={20} max={48}
                  value={t.paramsHeight} onChange={(e) => setTweak('paramsHeight', Number(e.target.value))} />
                <span className="mv-tweak-val">{t.paramsHeight}%</span>
              </div>
            </div>

            <div className="mv-tweak-row">
              <div className="mv-tweak-label">对话区高度</div>
              <div className="mv-tweak-slider-row">
                <input type="range" className="mv-tweak-slider" min={240} max={520}
                  value={t.chatHeight} onChange={(e) => setTweak('chatHeight', Number(e.target.value))} />
                <span className="mv-tweak-val">{t.chatHeight}px</span>
              </div>
            </div>

            <div className="mv-tweak-row">
              <div className="mv-tweak-label">密度</div>
              <div className="mv-tweak-radios">
                {(['compact', 'regular', 'comfy'] as const).map((v) => (
                  <button
                    key={v}
                    className={`mv-tweak-radio${t.density === v ? ' is-on' : ''}`}
                    onClick={() => setTweak('density', v)}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>

            <div className="mv-tweak-section">动画</div>

            <div className="mv-tweak-row">
              <div className="mv-tweak-label">交换时长</div>
              <div className="mv-tweak-slider-row">
                <input
                  type="range"
                  className="mv-tweak-slider"
                  min={12}
                  max={60}
                  step={2}
                  value={t.swapFrames}
                  onChange={(e) => setTweak('swapFrames', Number(e.target.value))}
                />
                <span className="mv-tweak-val">{t.swapFrames}f</span>
              </div>
            </div>

            <label className="mv-tweak-toggle">
              <input
                type="checkbox"
                checked={t.showHistoryDock}
                onChange={(e) => setTweak('showHistoryDock', e.target.checked)}
              />
              历史悬浮按钮
            </label>
          </div>
        </div>
      )}
    </>
  );
}
