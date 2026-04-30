import React, { useEffect } from 'react';
import { TweakValues } from '../../features/studio-editor/hooks/useTweaks';
import { usePipelinePoller } from '../../features/pipeline/hooks/usePipelinePoller';
import { PlaybookPlayer } from '../../features/playbook/engine/player/PlaybookPlayer';

// ── Topbar ────────────────────────────────────────────────────────────────

interface TopbarProps {
  isDark: boolean;
  setTweak: (key: keyof TweakValues, value: TweakValues[keyof TweakValues]) => void;
  onHome: () => void;
  onHistory?: () => void;
}

function Topbar({ isDark, setTweak, onHome, onHistory }: TopbarProps) {
  return (
    <header className="mv-top">
      <div className="mv-brand">
        <span className="mv-pulse" />
        <span className="mv-brand-name">MetaView</span>
        <span className="mv-brand-meta">/ Concept Studio · v0.3</span>
      </div>

      <nav className="mv-nav">
        <button className="mv-nav-item is-active" onClick={onHome}>工作台</button>
        <button className="mv-nav-item" onClick={onHistory}>任务历史</button>
        <button className="mv-nav-item">模板</button>
        <button className="mv-nav-item">设置</button>
      </nav>

      <div className="mv-top-right">
        <div className="mv-status">
          <span className="mv-dot" />
          <span>CORE NODES ONLINE</span>
        </div>
        <button className="mv-icon-btn" title="切换主题"
          onClick={() => setTweak('theme', isDark ? 'light' : 'dark')}>
          {isDark ? '☀' : '☾'}
        </button>
        <div className="mv-avatar">MV</div>
      </div>
    </header>
  );
}

// ── StudioPage ────────────────────────────────────────────────────────────

export interface StudioPageProps {
  runId: string | null;
  t: TweakValues;
  setTweak: (key: keyof TweakValues, value: TweakValues[keyof TweakValues]) => void;
  onHome: () => void;
  onHistory?: () => void;
}

export function StudioPage({ runId, t, setTweak, onHome, onHistory }: StudioPageProps) {
  const isDark = t.theme === 'dark';
  const { playbook, error } = usePipelinePoller(runId);

  useEffect(() => {
    if (error) onHome();
  }, [error, onHome]);

  return (
    <>
      <Topbar isDark={isDark} setTweak={setTweak} onHome={onHome} onHistory={onHistory} />
      <main
        className="mv-main"
        style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}
      >
        <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
          {playbook && (
            <PlaybookPlayer
              script={playbook}
              theme={isDark ? 'dark' : 'light'}
            />
          )}
        </div>
      </main>
    </>
  );
}
