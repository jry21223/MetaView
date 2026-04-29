import React, { useState, useEffect, useRef } from 'react';
import { TweakValues } from '../../features/studio-editor/hooks/useTweaks';
import { PlayerStage } from '../../features/studio-editor/ui/PlayerStage';

// ── Static demo data ──────────────────────────────────────────────────────

const PROBLEMS = {
  algo: {
    eyebrow: '算法', title: '归并排序的递归过程',
    tags: ['分治', '排序', 'O(n log n)'], difficulty: '中等',
  },
  math: {
    eyebrow: '高数', title: '二阶常微分方程的解曲线族',
    tags: ['微分方程', '相图', '稳定性'], difficulty: '进阶',
  },
  phys: {
    eyebrow: '物理', title: '斜面上质点的受力分解',
    tags: ['牛顿第二定律', '摩擦', '加速度'], difficulty: '基础',
  },
} as const;

type Subject = keyof typeof PROBLEMS;

const CHAT_BY_SUBJECT: Record<Subject, Array<{ from: 'ai' | 'user'; text: string; t: string }>> = {
  algo: [
    { from: 'ai', text: '我可以用 8 个元素演示归并排序的分治层级。这个数组规模合适吗？', t: '14:02' },
    { from: 'user', text: '把数组改成 [3,1,4,1,5,9,2,6]，标出每次比较的元素', t: '14:02' },
    { from: 'ai', text: '已更新。注意第 3 层会有重复元素的稳定性比较，要我特别强调它吗？', t: '14:03' },
  ],
  math: [
    { from: 'ai', text: '我会画出 y\'\' + 2y\' + y = 0 在不同初值下的解曲线。需要叠加相图吗？', t: '10:14' },
    { from: 'user', text: '把阻尼系数从 2 调到 0.5，看看欠阻尼的振荡', t: '10:15' },
    { from: 'ai', text: '好。系数变成 0.5 后会出现复根，曲线呈衰减振荡，我把振幅包络也画出来。', t: '10:15' },
  ],
  phys: [
    { from: 'ai', text: '斜面 30°、质量 2kg、动摩擦 0.2，质点会沿斜面下滑。要我标出每个力的分量吗？', t: '09:40' },
    { from: 'user', text: '斜面角度提到 45°，看加速度怎么变', t: '09:41' },
    { from: 'ai', text: '45° 时摩擦力等于 mg·cos45·0.2 ≈ 2.77N，下滑加速度约 5.55 m/s²。', t: '09:41' },
  ],
};

const TASK_HISTORY = [
  { id: 't-088', title: '归并排序的递归过程', subject: '算法', time: '刚刚', status: 'active' },
  { id: 't-087', title: 'Transformer 注意力机制', subject: 'ML', time: '12 分钟前', status: 'done' },
  { id: 't-086', title: '红黑树插入旋转', subject: '数据结构', time: '今天 13:24', status: 'done' },
  { id: 't-085', title: '电势能与电场关系', subject: '物理', time: '今天 11:08', status: 'done' },
  { id: 't-084', title: 'DFS vs BFS 对比', subject: '算法', time: '昨天', status: 'done' },
  { id: 't-083', title: '傅里叶级数收敛', subject: '数学', time: '昨天', status: 'draft' },
];

const TOOLS = [
  { id: 'tpl', icon: '▦', label: '模板库', desc: '从预设场景开始' },
  { id: 'code', icon: '‹›', label: '代码视图', desc: '查看 Remotion 源' },
  { id: 'share', icon: '↗', label: '分享', desc: '生成可访问链接' },
  { id: 'export', icon: '⤓', label: '导出', desc: 'MP4 / GIF / WebM' },
  { id: 'snap', icon: '◫', label: '截帧', desc: '当前时刻保存为图' },
  { id: 'fork', icon: '⑂', label: '复制为新任务', desc: '保留参数另存' },
];

const SUGGESTIONS: Record<Subject, string[]> = {
  algo: ['换一组数据', '为什么是 O(n log n)', '对比快排'],
  math: ['换一个初值', '画出相图', '解释稳定性'],
  phys: ['角度调到 45°', '加上空气阻力', '画速度时间曲线'],
};

// ── Topbar ────────────────────────────────────────────────────────────────

interface TopbarProps {
  isDark: boolean;
  setTweak: (key: keyof TweakValues, value: TweakValues[keyof TweakValues]) => void;
  onHome: () => void;
}

function Topbar({ isDark, setTweak, onHome }: TopbarProps) {
  return (
    <header className="mv-top">
      <div className="mv-brand">
        <div className="mv-logo">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
            <path d="M3 20 L9 4 L12 14 L15 4 L21 20" stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="mv-brand-text">
          <div className="mv-brand-name">MetaView</div>
          <div className="mv-eyebrow">REMOTION ENGINE · v2</div>
        </div>
      </div>

      <nav className="mv-nav">
        <button className="mv-nav-item is-active" onClick={onHome}>工作台</button>
        <button className="mv-nav-item">任务历史</button>
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

// ── Problem card ──────────────────────────────────────────────────────────

type AnyProblem = { eyebrow: string; title: string; tags: readonly string[]; difficulty: string };

function ProblemCard({ problem }: { problem: AnyProblem }) {
  return (
    <div className="mv-card mv-problem mv-problem-slim">
      <div className="mv-problem-row">
        <div className="mv-problem-eyebrow">
          <span className="mv-subject-chip">{problem.eyebrow}</span>
          <span className="mv-eyebrow-mini">任务 #t-088</span>
        </div>
        <span className="mv-pill">{problem.difficulty}</span>
      </div>
      <h2 className="mv-problem-title">{problem.title}</h2>
      <div className="mv-tags">
        {problem.tags.map((tag) => (
          <span className="mv-tag" key={tag}>#{tag}</span>
        ))}
      </div>
    </div>
  );
}

// ── Chat panel ────────────────────────────────────────────────────────────

interface ChatPanelProps {
  chat: Array<{ from: 'ai' | 'user'; text: string; t: string }>;
  subject: Subject;
  chatHeight: number;
}

function ChatPanel({ chat, subject, chatHeight }: ChatPanelProps) {
  const [msgs, setMsgs] = useState(chat);
  useEffect(() => { setMsgs(chat); }, [chat]);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [msgs]);

  const send = async () => {
    if (!input.trim() || pending) return;
    const userText = input.trim();
    const nextMsgs = [...msgs, { from: 'user' as const, text: userText, t: 'now' }];
    setMsgs(nextMsgs);
    setInput('');
    setPending(true);
    setMsgs([...nextMsgs, { from: 'ai', text: '思考中…', t: 'now' }]);
    await new Promise((r) => setTimeout(r, 900));
    const replies: Record<Subject, string> = {
      algo: '好的，我已记录你的调整。可以通过参数面板直接修改数组内容。',
      math: '理解了，我会在下次渲染时调整系数。你可以在参数面板实时预览。',
      phys: '已收到，重新计算受力分析中。参数面板里可以直接拖动角度滑块。',
    };
    setMsgs([...nextMsgs, { from: 'ai', text: replies[subject], t: 'now' }]);
    setPending(false);
  };

  return (
    <div className="mv-card mv-chat" style={{ flex: `1 1 ${chatHeight}px`, minHeight: 280 }}>
      <div className="mv-card-eyebrow">
        <span>追问 · 围绕题目</span>
        <span className="mv-eyebrow-mini">{msgs.length} 条</span>
      </div>
      <div className="mv-chat-stream" ref={scrollRef}>
        {msgs.map((m, i) => (
          <div key={i} className={`mv-msg mv-msg-${m.from}`}>
            <div className="mv-msg-meta">
              <span>{m.from === 'user' ? '你' : 'MetaView'}</span>
              <span>{m.t}</span>
            </div>
            <div className="mv-msg-bubble">{m.text}</div>
          </div>
        ))}
      </div>
      <div className="mv-suggestions">
        {SUGGESTIONS[subject].map((s) => (
          <button key={s} className="mv-suggestion" onClick={() => setInput(s)}>{s}</button>
        ))}
      </div>
      <div className="mv-chat-input-wrap">
        <textarea
          rows={1}
          className="mv-chat-input"
          placeholder="针对题目继续追问 / 调整条件…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
        />
        <div className="mv-chat-actions">
          <button className="mv-chip">＋ 附件</button>
          <div className="mv-spacer" />
          <button className="mv-send" onClick={send} disabled={pending}>
            {pending ? '生成中…' : '发送 ↵'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Code view ─────────────────────────────────────────────────────────────

const CODE_SAMPLE = `import {AbsoluteFill, useCurrentFrame, interpolate} from 'remotion';

export const MergeSort: React.FC<{data: number[]}> = ({data}) => {
  const frame = useCurrentFrame();
  const phase = frame < 96 ? 'split' : frame < 204 ? 'merge' : 'final';
  const t = interpolate(frame, [0, 240], [0, 1]);

  return (
    <AbsoluteFill style={{background: '#0b0f0d', padding: 64}}>
      <Phase name={phase} progress={t} />
      <Layers data={data} depth={Math.floor(t * 4)} />
      <MergeBand active={phase === 'merge'} step={(frame - 96) / 36} />
    </AbsoluteFill>
  );
};`;

function highlight(line: string): string {
  return line
    .replace(/(\b(import|from|const|return|export|React|FC|number|string)\b)/g, '<i class="kw">$1</i>')
    .replace(/('[^']*')/g, '<i class="str">$1</i>')
    .replace(/(\/\/.*)$/g, '<i class="cm">$1</i>')
    .replace(/(\b\d+\b)/g, '<i class="num">$1</i>');
}

function CodeView() {
  return (
    <div className="mv-code">
      <div className="mv-code-tabs">
        <span className="is-on">MergeSort.tsx</span>
        <span>Composition.tsx</span>
        <span>useProps.ts</span>
      </div>
      <pre className="mv-code-body">
        {CODE_SAMPLE.split('\n').map((line, i) => (
          <div className="mv-code-line" key={i}>
            <span className="mv-code-ln">{String(i + 1).padStart(2, ' ')}</span>
            <span dangerouslySetInnerHTML={{ __html: highlight(line) }} />
          </div>
        ))}
      </pre>
    </div>
  );
}

// ── Params panels ─────────────────────────────────────────────────────────

function Param({ label, hint, children, wide }: { label: string; hint?: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={`mv-param${wide ? ' mv-param-wide' : ''}`}>
      <div className="mv-param-lbl">
        <span>{label}</span>
        {hint && <span className="mv-param-hint">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function AlgoParams() {
  const [arr, setArr] = useState('5, 2, 8, 1, 9, 3, 7, 4');
  const [algo, setAlgo] = useState('merge');
  const [order, setOrder] = useState('asc');
  return (
    <div className="mv-params-grid">
      <Param label="数组内容" hint="逗号分隔" wide>
        <input className="mv-text-input mv-mono" value={arr} onChange={(e) => setArr(e.target.value)} />
      </Param>
      <Param label="算法变体">
        <div className="mv-segmented">
          {['merge', 'quick', 'heap'].map((a) => (
            <button key={a} className={algo === a ? 'is-on' : ''} onClick={() => setAlgo(a)}>{a}</button>
          ))}
        </div>
      </Param>
      <Param label="排序方向">
        <div className="mv-segmented">
          {([['asc', '升序'], ['desc', '降序']] as const).map(([k, l]) => (
            <button key={k} className={order === k ? 'is-on' : ''} onClick={() => setOrder(k)}>{l}</button>
          ))}
        </div>
      </Param>
      <Param label="比较高亮">
        <div className="mv-toggles">
          <label><input type="checkbox" defaultChecked /> 显示比较</label>
          <label><input type="checkbox" defaultChecked /> 显示交换</label>
          <label><input type="checkbox" /> 计步器</label>
        </div>
      </Param>
    </div>
  );
}

function MathParams() {
  const [coef, setCoef] = useState({ a: 1, b: 2, c: 1 });
  const [y0, setY0] = useState(1);
  const [yp0, setYp0] = useState(0);
  const [variant, setVariant] = useState('ode');
  return (
    <div className="mv-params-grid">
      <Param label="方程变体">
        <div className="mv-segmented">
          {([['ode', '二阶 ODE'], ['int', '定积分'], ['lim', '极限']] as const).map(([k, l]) => (
            <button key={k} className={variant === k ? 'is-on' : ''} onClick={() => setVariant(k)}>{l}</button>
          ))}
        </div>
      </Param>
      <Param label="系数 a · b · c" hint="ay″ + by′ + cy = 0">
        <div className="mv-tri-input">
          {(['a', 'b', 'c'] as const).map((k) => (
            <div key={k} className="mv-num-stepper">
              <button onClick={() => setCoef({ ...coef, [k]: +(coef[k] - 0.1).toFixed(2) })}>−</button>
              <span className="mv-mono">{coef[k]}</span>
              <button onClick={() => setCoef({ ...coef, [k]: +(coef[k] + 0.1).toFixed(2) })}>+</button>
            </div>
          ))}
        </div>
      </Param>
      <Param label="初值 y(0)">
        <div className="mv-slider-row">
          <input type="range" min="-3" max="3" step="0.1" value={y0} onChange={(e) => setY0(+e.target.value)} />
          <span className="mv-mono">{y0}</span>
        </div>
      </Param>
      <Param label="初值 y′(0)">
        <div className="mv-slider-row">
          <input type="range" min="-3" max="3" step="0.1" value={yp0} onChange={(e) => setYp0(+e.target.value)} />
          <span className="mv-mono">{yp0}</span>
        </div>
      </Param>
      <Param label="可视化">
        <div className="mv-toggles">
          <label><input type="checkbox" defaultChecked /> 解曲线</label>
          <label><input type="checkbox" /> 相图</label>
          <label><input type="checkbox" /> 包络</label>
        </div>
      </Param>
    </div>
  );
}

function PhysParams() {
  const [theta, setTheta] = useState(30);
  const [mass, setMass] = useState(2);
  const [mu, setMu] = useState(0.2);
  const [g, setG] = useState(9.8);
  const a = +(g * (Math.sin((theta * Math.PI) / 180) - mu * Math.cos((theta * Math.PI) / 180))).toFixed(2);
  return (
    <div className="mv-params-grid">
      <Param label="斜面角度 θ" hint="度">
        <div className="mv-slider-row">
          <input type="range" min="0" max="80" value={theta} onChange={(e) => setTheta(+e.target.value)} />
          <span className="mv-mono">{theta}°</span>
        </div>
      </Param>
      <Param label="质量 m" hint="kg">
        <div className="mv-slider-row">
          <input type="range" min="0.1" max="10" step="0.1" value={mass} onChange={(e) => setMass(+e.target.value)} />
          <span className="mv-mono">{mass}</span>
        </div>
      </Param>
      <Param label="动摩擦 μ">
        <div className="mv-slider-row">
          <input type="range" min="0" max="1" step="0.01" value={mu} onChange={(e) => setMu(+e.target.value)} />
          <span className="mv-mono">{mu}</span>
        </div>
      </Param>
      <Param label="重力 g" hint="m/s²">
        <div className="mv-slider-row">
          <input type="range" min="1" max="20" step="0.1" value={g} onChange={(e) => setG(+e.target.value)} />
          <span className="mv-mono">{g}</span>
        </div>
      </Param>
      <Param label="计算结果" hint="只读">
        <div className="mv-readout">
          <span>加速度 a =</span>
          <b className="mv-mono">{a} m/s²</b>
        </div>
      </Param>
      <Param label="显示矢量">
        <div className="mv-toggles">
          <label><input type="checkbox" defaultChecked /> 重力</label>
          <label><input type="checkbox" defaultChecked /> 法向力</label>
          <label><input type="checkbox" defaultChecked /> 摩擦</label>
        </div>
      </Param>
    </div>
  );
}

// ── Player area ───────────────────────────────────────────────────────────

interface PlayerState {
  playing: boolean;
  setPlaying: (v: boolean) => void;
  frame: number;
  setFrame: (v: number) => void;
  duration: number;
  fps: number;
  speed: number;
  setSpeed: (v: number) => void;
  view: string;
  setView: (v: string) => void;
}

function PlayerArea({ player, paramsHeight }: { player: PlayerState; paramsHeight: number }) {
  const { playing, setPlaying, frame, setFrame, duration, fps, speed, setSpeed, view, setView } = player;
  const [loop, setLoop] = useState(true);

  const tc = (f: number) => {
    const s = f / fps;
    const m = Math.floor(s / 60);
    const sec = (s % 60).toFixed(2).padStart(5, '0');
    return `${String(m).padStart(2, '0')}:${sec}`;
  };

  return (
    <div className="mv-card mv-player" style={{ flex: `1 1 ${100 - paramsHeight}%` }}>
      <div className="mv-player-head">
        <div className="mv-card-eyebrow">
          <span>主视窗 · Remotion</span>
          <span className="mv-pill mv-pill-sub">1920×1080 · {fps}fps</span>
        </div>
        <div className="mv-view-switch">
          <button className={view === 'preview' ? 'is-on' : ''} onClick={() => setView('preview')}>预览</button>
          <button className={view === 'code' ? 'is-on' : ''} onClick={() => setView('code')}>代码</button>
        </div>
      </div>

      <div className="mv-stage-wrap">
        {view === 'preview'
          ? <PlayerStage frame={frame} duration={duration} />
          : <CodeView />}
      </div>

      <div className="mv-transport">
        <button className="mv-tx mv-tx-step" onClick={() => setFrame(Math.max(0, frame - 1))} title="上一帧">⏮</button>
        <button className="mv-tx mv-tx-play" onClick={() => setPlaying(!playing)}>
          {playing ? '❚❚' : '▶'}
        </button>
        <button className="mv-tx mv-tx-step" onClick={() => setFrame(Math.min(duration - 1, frame + 1))} title="下一帧">⏭</button>

        <div className="mv-tc">
          <span className="mv-tc-now">{tc(frame)}</span>
          <span className="mv-tc-sep">/</span>
          <span className="mv-tc-end">{tc(duration)}</span>
        </div>

        <div className="mv-scrubber">
          <div className="mv-scrub-track" onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const pct = (e.clientX - rect.left) / rect.width;
            setFrame(Math.round(pct * duration));
          }}>
            <div className="mv-scrub-fill" style={{ width: `${(frame / duration) * 100}%` }} />
            {[0.25, 0.5, 0.75].map((p) => (
              <div className="mv-scrub-mark" key={p} style={{ left: `${p * 100}%` }} />
            ))}
            <div className="mv-scrub-head" style={{ left: `${(frame / duration) * 100}%` }} />
          </div>
        </div>

        <div className="mv-speed">
          {[0.5, 1, 1.5, 2, 4].map((s) => (
            <button key={s} className={speed === s ? 'is-on' : ''} onClick={() => setSpeed(s)}>{s}×</button>
          ))}
        </div>

        <button className={`mv-icon-btn${loop ? ' is-on' : ''}`} onClick={() => setLoop(!loop)} title="循环">↻</button>
      </div>
    </div>
  );
}

// ── Params panel ──────────────────────────────────────────────────────────

interface ParamsPanelProps {
  paramsHeight: number;
  subject: Subject;
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
}

function ParamsPanel({ paramsHeight, subject, collapsed, setCollapsed }: ParamsPanelProps) {
  return (
    <div
      className={`mv-card mv-params${collapsed ? ' is-collapsed' : ''}`}
      style={{ flex: collapsed ? '0 0 auto' : `1 1 ${paramsHeight}%` }}
    >
      <div className="mv-card-eyebrow">
        <span>题目变量 · Remotion props</span>
        <div className="mv-params-actions">
          {!collapsed && <span className="mv-eyebrow-mini">实时同步</span>}
          {!collapsed && <button className="mv-chip">重置</button>}
          {!collapsed && <button className="mv-chip mv-chip-primary">重新生成 →</button>}
          <button className="mv-chip mv-chip-collapse" onClick={() => setCollapsed(!collapsed)}>
            {collapsed ? '展开 ▴' : '折叠 ▾'}
          </button>
        </div>
      </div>
      {!collapsed && (
        <>
          {subject === 'algo' && <AlgoParams />}
          {subject === 'math' && <MathParams />}
          {subject === 'phys' && <PhysParams />}
        </>
      )}
    </div>
  );
}

// ── Right column ──────────────────────────────────────────────────────────

function RightColumn({ subject, paramsHeight, player }: { subject: Subject; paramsHeight: number; player: PlayerState }) {
  const [paramsCollapsed, setParamsCollapsed] = useState(false);
  useEffect(() => {
    if (player.playing) setParamsCollapsed(true);
  }, [player.playing]);
  return (
    <section className="mv-right">
      <PlayerArea player={player} paramsHeight={paramsHeight} />
      <ParamsPanel paramsHeight={paramsHeight} subject={subject} collapsed={paramsCollapsed} setCollapsed={setParamsCollapsed} />
    </section>
  );
}

// ── History dock ──────────────────────────────────────────────────────────

interface HistoryDockProps {
  open: boolean;
  setOpen: (v: boolean) => void;
}

function HistoryDock({ open, setOpen }: HistoryDockProps) {
  const [activeTool, setActiveTool] = useState<string | null>(null);

  return (
    <div className={`mv-dock${open ? ' is-open' : ''}`}>
      {open && (
        <div className="mv-dock-panel">
          <div className="mv-dock-head">
            <div className="mv-dock-tabs">
              <button className="is-on">任务历史</button>
              <button>工具</button>
            </div>
            <button className="mv-icon-btn" onClick={() => setOpen(false)}>×</button>
          </div>
          <div className="mv-dock-body">
            <div className="mv-history-list">
              {TASK_HISTORY.map((task) => (
                <div key={task.id} className={`mv-history-item${task.status === 'active' ? ' is-active' : ''}`}>
                  <div className="mv-history-id">{task.id}</div>
                  <div className="mv-history-main">
                    <div className="mv-history-title">{task.title}</div>
                    <div className="mv-history-meta">
                      <span className="mv-pill mv-pill-sub">{task.subject}</span>
                      <span>{task.time}</span>
                    </div>
                  </div>
                  <div className={`mv-status-dot mv-status-${task.status}`} />
                </div>
              ))}
            </div>
            <div className="mv-tools-rail">
              <div className="mv-eyebrow-mini">工具</div>
              <div className="mv-tools-grid">
                {TOOLS.map((tool) => (
                  <button key={tool.id}
                    className={`mv-tool${activeTool === tool.id ? ' is-on' : ''}`}
                    onClick={() => setActiveTool(activeTool === tool.id ? null : tool.id)}>
                    <span className="mv-tool-icon">{tool.icon}</span>
                    <span className="mv-tool-label">{tool.label}</span>
                    <span className="mv-tool-desc">{tool.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      <button className="mv-dock-fab" onClick={() => setOpen(!open)} title="任务历史 / 工具">
        <span className="mv-fab-icon">{open ? '×' : '≡'}</span>
        {!open && <span className="mv-fab-badge">{TASK_HISTORY.length}</span>}
      </button>
    </div>
  );
}

// ── StudioPage (Workbench) ────────────────────────────────────────────────

export interface StudioPageProps {
  subject: Subject;
  t: TweakValues;
  setTweak: (key: keyof TweakValues, value: TweakValues[keyof TweakValues]) => void;
  onHome: () => void;
}

export function StudioPage({ subject, t, setTweak, onHome }: StudioPageProps) {
  const isDark = t.theme === 'dark';
  const fps = 30;
  const duration = 240;

  const [playing, setPlaying] = useState(false);
  const [frame, setFrame] = useState(48);
  const [speed, setSpeed] = useState(1);
  const [view, setView] = useState('preview');
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setFrame((f) => {
        const next = f + 0.25 * speed;
        return next >= duration ? 0 : next;
      });
    }, 1000 / fps);
    return () => clearInterval(id);
  }, [playing, speed, duration, fps]);

  const player: PlayerState = {
    playing, setPlaying, frame, setFrame: (v) => setFrame(v),
    duration, fps, speed, setSpeed, view, setView,
  };

  const problem = PROBLEMS[subject];
  const chat = CHAT_BY_SUBJECT[subject];

  return (
    <>
      <Topbar isDark={isDark} setTweak={setTweak} onHome={onHome} />
      <main className="mv-main" style={{ '--left-w': `${t.leftRatio}%` } as React.CSSProperties}>
        <section className="mv-left">
          <ProblemCard problem={problem} />
          <ChatPanel chat={chat} subject={subject} chatHeight={t.chatHeight} />
        </section>
        <RightColumn subject={subject} paramsHeight={t.paramsHeight} player={player} />
      </main>
      {t.showHistoryDock && <HistoryDock open={historyOpen} setOpen={setHistoryOpen} />}
    </>
  );
}
