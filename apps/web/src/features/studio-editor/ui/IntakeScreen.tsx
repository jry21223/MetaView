import React, { useState, useRef, useMemo } from 'react';
import { TweakValues, themeVars } from '../hooks/useTweaks';

const TEMPLATE_GALLERY = [
  { id: 'merge-sort', subject: 'algo', title: '归并排序', desc: '数组分治 → 合并', tag: '算法' },
  { id: 'ode-2', subject: 'math', title: '二阶常微分方程', desc: '相图 + 数值解', tag: '高数' },
  { id: 'incline', subject: 'phys', title: '斜面摩擦', desc: '受力分析 + 加速度', tag: '物理' },
  { id: 'binary-search', subject: 'algo', title: '二分查找', desc: '有序数组 / 收敛区间', tag: '算法' },
  { id: 'fft', subject: 'math', title: '傅里叶变换', desc: '时域 ⇄ 频域', tag: '高数' },
  { id: 'projectile', subject: 'phys', title: '抛体运动', desc: '速度合成 + 轨迹', tag: '物理' },
] as const;

export interface IntakeContext {
  subject: 'algo' | 'math' | 'phys';
  template: string;
  title: string;
  raw: string;
  files: Array<{ name: string; size: number }>;
  sourceCode?: string;
}

interface IntakeScreenProps {
  onSubmit: (ctx: IntakeContext) => void | Promise<void>;
  t: TweakValues;
  isSubmitting?: boolean;
  submitError?: string | null;
  isProviderConfigured?: boolean;
  onOpenProviderSettings?: () => void;
  onHistory?: () => void;
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

const CODE_EXTENSIONS = new Set([
  '.py', '.js', '.ts', '.tsx', '.jsx', '.java', '.cpp', '.c', '.cs',
  '.go', '.rs', '.rb', '.swift', '.kt', '.php', '.r', '.m', '.sh',
]);

function isCodeFile(name: string): boolean {
  const ext = name.slice(name.lastIndexOf('.')).toLowerCase();
  return CODE_EXTENSIONS.has(ext);
}

export function IntakeScreen({ onSubmit, t, isSubmitting = false, submitError = null, isProviderConfigured = false, onOpenProviderSettings, onHistory }: IntakeScreenProps) {
  const [input, setInput] = useState('');
  const [files, setFiles] = useState<Array<{ name: string; size: number }>>([]);
  const [fileObjects, setFileObjects] = useState<File[]>([]);
  const [thinking, setThinking] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const css = useMemo(() => themeVars(t), [t]);

  const handleFiles = (list: FileList | null) => {
    if (!list) return;
    const arr = Array.from(list);
    setFileObjects((prev) => [...prev, ...arr]);
    setFiles((prev) => [...prev, ...arr.map((f) => ({ name: f.name, size: f.size }))]);
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setFileObjects((prev) => prev.filter((_, i) => i !== index));
  };

  const submit = async () => {
    if (!input.trim() && files.length === 0) return;

    setThinking('正在理解你的需求…');

    const subject = input.toLowerCase().includes('排序') || input.toLowerCase().includes('算法') || input.toLowerCase().includes('search')
      ? 'algo'
      : input.includes('微分') || input.includes('积分') || input.includes('傅里叶')
      ? 'math'
      : input.includes('斜面') || input.includes('物理') || input.includes('力')
      ? 'phys'
      : 'algo';

    let sourceCode: string | undefined;
    const codeFile = fileObjects.find((f) => isCodeFile(f.name));
    if (codeFile) {
      try {
        sourceCode = await readFileAsText(codeFile);
      } catch {
        // ignore read error, proceed without source code
      }
    }

    setThinking('提交中…');

    await onSubmit({
      subject,
      template: 'merge-sort',
      title: input.slice(0, 40) || '未命名',
      raw: input,
      files,
      sourceCode,
    });

    setThinking('');
  };

  const pickTemplate = (tpl: typeof TEMPLATE_GALLERY[number]) => {
    onSubmit({
      subject: tpl.subject as IntakeContext['subject'],
      template: tpl.id,
      title: tpl.title,
      raw: tpl.title,
      files: [],
    });
  };

  const pending = isSubmitting;

  return (
    <div className="mv-intake" style={css}>
      <div className="mv-intake-top">
        <div className="mv-brand">
          <span className="mv-pulse" />
          <span className="mv-brand-name">MetaView</span>
          <span className="mv-brand-meta">/ Concept Studio · v0.3</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {onHistory && (
            <button className="mv-chip" onClick={onHistory}>
              任务历史
            </button>
          )}
          {onOpenProviderSettings && (
            <button
              className="mv-chip"
              onClick={onOpenProviderSettings}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <span style={{ opacity: isProviderConfigured ? 1 : 0.5 }}>⚙</span>
              <span>Provider</span>
              {isProviderConfigured && (
                <span style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: 'var(--accent)', display: 'inline-block',
                }} />
              )}
            </button>
          )}
          <div className="mv-intake-status">
            <span className="mv-pulse" />
            CORE NODES ONLINE
          </div>
        </div>
      </div>

      <div className="mv-intake-body">
        <div className="mv-intake-hero">
          <div className="mv-eyebrow-mini">为每道题，生成可解释的动画</div>
          <h1 className="mv-intake-title">
            把题目<span className="mv-accent-text">交给我</span>，
            <br />
            动画与讲解自动展开。
          </h1>
          <p className="mv-intake-sub">
            粘贴题目文本、上传题图或源码 — 自动识别学科与最合适的可视化模板。也可以从下方模板直接开始。
          </p>
        </div>

        <div className="mv-intake-composer">
          {files.length > 0 && (
            <div className="mv-intake-files">
              {files.map((f, i) => (
                <div key={i} className="mv-intake-file">
                  <span className="mv-file-icon">📎</span>
                  <span className="mv-file-name">{f.name}</span>
                  <button onClick={() => removeFile(i)}>✕</button>
                </div>
              ))}
            </div>
          )}
          <textarea
            className="mv-intake-input"
            rows={4}
            placeholder="例如：『把归并排序的过程画出来，数组是 [5,2,8,1,9,3,7,4]』 / 『高数：求 y'' + 2y' + y = 0 的解』"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                submit();
              }
            }}
          />
          <div className="mv-intake-actions">
            <button className="mv-chip" onClick={() => fileRef.current?.click()}>
              ＋ 附件
            </button>
            <input
              ref={fileRef}
              type="file"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
            />
            <span className="mv-intake-hint">⌘ + ↵ 提交</span>
            <div className="mv-spacer" />
            {(thinking || submitError) && (
              <span className={`mv-intake-thinking${submitError ? ' mv-intake-error' : ''}`}>
                {submitError ?? thinking}
              </span>
            )}
            <button
              className="mv-send mv-intake-send"
              onClick={submit}
              disabled={pending || (!input.trim() && files.length === 0)}
            >
              {pending ? '识别中…' : '理解并生成 →'}
            </button>
          </div>
        </div>

        <div className="mv-intake-or">
          <span>或从模板开始</span>
        </div>

        <div className="mv-intake-templates">
          {TEMPLATE_GALLERY.map((tpl) => (
            <button key={tpl.id} className="mv-tpl-card" onClick={() => pickTemplate(tpl)}>
              <div className="mv-tpl-tag">{tpl.tag}</div>
              <div className="mv-tpl-title">{tpl.title}</div>
              <div className="mv-tpl-desc">{tpl.desc}</div>
              <div className="mv-tpl-arrow">→</div>
            </button>
          ))}
          <button
            className="mv-tpl-card mv-tpl-blank"
            onClick={() => onSubmit({ subject: 'algo', template: 'blank', title: '空白模板', raw: '', files: [] })}
          >
            <div className="mv-tpl-tag">自定义</div>
            <div className="mv-tpl-title">空白模板</div>
            <div className="mv-tpl-desc">从零开始描述你的动画</div>
            <div className="mv-tpl-arrow">＋</div>
          </button>
        </div>
      </div>
    </div>
  );
}
