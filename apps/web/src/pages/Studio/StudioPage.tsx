import React, { useEffect, useRef, useState } from 'react';
import { TweakValues } from '../../features/studio-editor/hooks/useTweaks';
import { usePipelinePoller } from '../../features/pipeline/hooks/usePipelinePoller';
import { PlaybookPlayer } from '../../features/playbook/engine/player/PlaybookPlayer';
import { GlobalTopbar, Stage } from '../../shared/ui/GlobalTopbar';
import { useProviderSettings, ProviderSettings } from '../../features/providers/hooks/useProviderSettings';
import type { PlaybookScript } from '../../features/playbook/engine/types';
import { ExportModal } from '../../features/export/ui/ExportModal';

// ── Domain mapping ────────────────────────────────────────────────────────

const DOMAIN_LABEL: Record<string, string> = {
  algorithm: '算法',
  math: '数学',
  code: '代码',
  physics: '物理',
  chemistry: '化学',
  biology: '生物',
  geography: '地理',
};

const DOMAIN_SUGGESTIONS: Record<string, string[]> = {
  algorithm: ['换一组数据', '为什么这个复杂度', '对比其他方法'],
  math: ['改变初始条件', '几何意义', '推导过程'],
  physics: ['改变参数', '加上其他力', '受力分析'],
  code: ['解释这段逻辑', '更好的写法', '边界情况'],
  chemistry: ['换反应物', '反应机理', '平衡条件'],
  biology: ['详细解释步骤', '实际应用', '相关知识点'],
  geography: ['原因分析', '影响因素', '对比其他地区'],
};

const FALLBACK_SUGGESTIONS = ['换个角度讲', '展开第一步', '总结要点'];

// ── ProblemCard ───────────────────────────────────────────────────────────

interface ProblemCardProps {
  playbook: PlaybookScript | null;
  runId: string | null;
  collapsed: boolean;
  onToggle: () => void;
}

function ProblemCard({ playbook, runId, collapsed, onToggle }: ProblemCardProps) {
  const domain = playbook?.domain ?? '';
  const domainLabel = DOMAIN_LABEL[domain] ?? domain ?? '—';
  const taskId = runId ? `#${runId.slice(0, 8)}` : '#—';

  return (
    <div className={`mv-card mv-problem mv-problem-slim${collapsed ? ' is-collapsed' : ''}`}>
      <div className="mv-problem-row">
        <div className="mv-problem-eyebrow">
          <span className="mv-subject-chip">{domainLabel}</span>
          <span className="mv-eyebrow-mini">任务 {taskId}</span>
        </div>
        <button className="mv-chip mv-chip-collapse" onClick={onToggle} title={collapsed ? '展开' : '折叠'}>
          {collapsed ? '展开 ▴' : '折叠 ▾'}
        </button>
      </div>
      <h2 className="mv-problem-title">{playbook?.title ?? '等待生成…'}</h2>
      {playbook && (
        <>
          {playbook.summary && (
            <p style={{ margin: 0, fontSize: 12, lineHeight: 1.55, color: 'var(--ink-2)' }}>
              {playbook.summary}
            </p>
          )}
        </>
      )}
    </div>
  );
}

// ── ChatPanel ─────────────────────────────────────────────────────────────

interface ChatMessage {
  from: 'user' | 'ai';
  text: string;
  pending?: boolean;
  error?: boolean;
}

interface ChatPanelProps {
  playbook: PlaybookScript | null;
  isProviderConfigured: boolean;
  onOpenProviderSettings?: () => void;
  collapsed: boolean;
  onToggle: () => void;
}

async function callChat(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  settings: ProviderSettings,
  signal: AbortSignal,
): Promise<string> {
  const baseUrl = (settings.baseUrl?.trim() || 'https://api.openai.com/v1').replace(/\/$/, '');
  const model = settings.model?.trim() || 'gpt-4o-mini';
  const resp = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${settings.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, messages, temperature: 0.7, max_tokens: 400 }),
    signal,
  });
  if (!resp.ok) {
    const err = new Error(`HTTP ${resp.status}`) as Error & { status?: number };
    err.status = resp.status;
    throw err;
  }
  const data = await resp.json();
  return data.choices?.[0]?.message?.content ?? '';
}

function formatChatError(err: unknown, baseUrl: string | undefined): string {
  if (err instanceof Error) {
    const status = (err as Error & { status?: number }).status;
    if (status === 401 || status === 403) return '（API Key 无效或无权限，请在 Provider 设置中检查）';
    if (status === 429) return '（请求过于频繁，稍后再试）';
    if (status && status >= 500) return `（Provider 服务异常 HTTP ${status}）`;
    if (err.name === 'TypeError' || /fetch|network/i.test(err.message)) {
      return `（无法连接到 ${baseUrl || 'Provider'}，请检查 Base URL 与网络）`;
    }
    return `（请求失败：${err.message}）`;
  }
  return '（接口暂时不可用，稍后再试）';
}

function ChatPanel({ playbook, isProviderConfigured, onOpenProviderSettings, collapsed, onToggle }: ChatPanelProps) {
  const { settings } = useProviderSettings();
  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [msgs]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const domain = playbook?.domain ?? '';
  const suggestions = DOMAIN_SUGGESTIONS[domain] ?? FALLBACK_SUGGESTIONS;

  const send = async (text?: string) => {
    const userText = (text ?? input).trim();
    if (!userText || pending || !playbook) return;
    if (!isProviderConfigured) return;

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    const nextMsgs: ChatMessage[] = [...msgs, { from: 'user', text: userText }];
    setMsgs([...nextMsgs, { from: 'ai', text: '思考中…', pending: true }]);
    setInput('');
    setPending(true);

    const sys = `你是 MetaView 的教学助手，正在解释「${playbook.title}」（${DOMAIN_LABEL[domain] ?? domain}）。
摘要：${playbook.summary}
共 ${playbook.steps.length} 步。
回答用简洁中文（2-4 句），可以建议进一步探索方向。`;

    const apiMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: sys },
      ...nextMsgs.map((m) => ({
        role: (m.from === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: m.text,
      })),
    ];

    try {
      const reply = await callChat(apiMessages, settings, abortRef.current.signal);
      setMsgs([...nextMsgs, { from: 'ai', text: reply.trim() || '（空回复）' }]);
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setMsgs([...nextMsgs, { from: 'ai', text: formatChatError(err, settings.baseUrl), error: true }]);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className={`mv-card mv-chat${collapsed ? ' is-collapsed' : ''}`}>
      <div className="mv-card-eyebrow">
        <span>追问 · 围绕题目</span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {!collapsed && msgs.length > 0 && (
            <span className="mv-eyebrow-mini">{msgs.length} 条</span>
          )}
          <button className="mv-chip mv-chip-collapse" onClick={onToggle}>
            {collapsed ? '展开 ▴' : '折叠 ▾'}
          </button>
        </div>
      </div>

      <div className="mv-chat-stream" ref={scrollRef}>
        {msgs.length === 0 && !isProviderConfigured && (
          <div style={{ fontSize: 12, color: 'var(--ink-3)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span>配置 Provider 后可以追问当前题目。</span>
            {onOpenProviderSettings && (
              <button className="mv-chip mv-chip-primary" onClick={onOpenProviderSettings} style={{ alignSelf: 'flex-start' }}>
                去配置 →
              </button>
            )}
          </div>
        )}
        {msgs.length === 0 && isProviderConfigured && playbook && (
          <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
            可以围绕这道题追问，或点下方建议词快速开始。
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`mv-msg mv-msg-${m.from}${m.pending ? ' is-pending' : ''}`}>
            <div className="mv-msg-meta">
              <span>{m.from === 'user' ? '你' : 'MetaView'}</span>
            </div>
            <div className="mv-msg-bubble" style={m.error ? { color: 'var(--ink-3)' } : undefined}>
              {m.text}
            </div>
          </div>
        ))}
      </div>

      <div className="mv-suggestions">
        {suggestions.map((s) => (
          <button
            key={s}
            className="mv-suggestion"
            onClick={() => send(s)}
            disabled={pending || !isProviderConfigured || !playbook}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="mv-chat-input-wrap">
        <textarea
          rows={1}
          className="mv-chat-input"
          placeholder={isProviderConfigured ? '继续追问…' : '需要配置 Provider'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          disabled={!isProviderConfigured || !playbook}
        />
        <div className="mv-chat-actions">
          <div className="mv-spacer" />
          <button
            className="mv-send"
            onClick={() => send()}
            disabled={pending || !input.trim() || !isProviderConfigured || !playbook}
          >
            {pending ? '生成中…' : '发送 ↵'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── StudioPage ────────────────────────────────────────────────────────────

export interface StudioPageProps {
  runId: string | null;
  t: TweakValues;
  setTweak: (key: keyof TweakValues, value: TweakValues[keyof TweakValues]) => void;
  onNavigate: (stage: Stage) => void;
  isProviderConfigured: boolean;
  onOpenProviderSettings?: () => void;
}

export function StudioPage({
  runId, t, setTweak, onNavigate, isProviderConfigured, onOpenProviderSettings,
}: StudioPageProps) {
  const isDark = t.theme === 'dark';
  const { playbook, error, isLoading, status } = usePipelinePoller(runId);

  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [problemCollapsed, setProblemCollapsed] = useState(false);
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  useEffect(() => {
    if (error) onNavigate('intake');
  }, [error, onNavigate]);

  const mainStyle = {
    ['--left-w' as string]: leftCollapsed ? '0px' : `${t.leftRatio}%`,
    gridTemplateColumns: leftCollapsed ? '1fr' : `var(--left-w) 1fr`,
  } as React.CSSProperties;

  return (
    <>
      <GlobalTopbar
        stage="workbench"
        isProviderConfigured={isProviderConfigured}
        onNavigate={onNavigate}
        isDark={isDark}
        onToggleTheme={() => setTweak('theme', isDark ? 'light' : 'dark')}
        onOpenProviderSettings={onOpenProviderSettings}
        onOpenExport={() => setExportOpen(true)}
        exportEnabled={!!playbook && !!runId}
      />
      {exportOpen && (
        <ExportModal
          runId={runId}
          isDark={isDark}
          onClose={() => setExportOpen(false)}
        />
      )}
      <main className="mv-main" style={mainStyle}>
        {!leftCollapsed && (
          <aside className="mv-left">
            <ProblemCard
              playbook={playbook}
              runId={runId}
              collapsed={problemCollapsed}
              onToggle={() => setProblemCollapsed((v) => !v)}
            />
            <ChatPanel
              playbook={playbook}
              isProviderConfigured={isProviderConfigured}
              onOpenProviderSettings={onOpenProviderSettings}
              collapsed={chatCollapsed}
              onToggle={() => setChatCollapsed((v) => !v)}
            />
          </aside>
        )}

        <section className="mv-right">
          <button
            className="mv-left-handle"
            onClick={() => setLeftCollapsed((v) => !v)}
            title={leftCollapsed ? '展开左栏' : '折叠左栏'}
          >
            {leftCollapsed ? '›' : '‹'}
          </button>

          {playbook ? (
            <PlaybookPlayer script={playbook} theme={isDark ? 'dark' : 'light'} />
          ) : isLoading ? (
            <div className="mv-right-placeholder">
              <div className="mv-spinner" />
              <span>{status === 'running' ? '生成中…' : '排队中…'}</span>
            </div>
          ) : !error ? (
            <div className="mv-right-placeholder">
              <span>提交一个题目开始生成</span>
            </div>
          ) : null}
        </section>
      </main>
    </>
  );
}
