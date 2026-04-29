import React, { useMemo } from 'react';

interface HlInfo {
  pairIdx?: number;
  val?: number;
  leftVal?: number;
  rightVal?: number;
  completed?: number[];
  final?: boolean;
}

interface TimelineLevel {
  chunks: number[][];
  label: string;
  kind: 'split' | 'merge' | 'final';
  compares: number;
  moves: number;
  hl: HlInfo | null;
  depth: number;
}

interface Timeline {
  levels: TimelineLevel[];
  splitTree: number[][][];
  total: number;
}

function buildMergeSortTimeline(initial: number[]): Timeline {
  const levels: TimelineLevel[] = [];
  let compares = 0, moves = 0;

  const push = (chunks: number[][], label: string, kind: TimelineLevel['kind'], hl: HlInfo | null, depth: number) =>
    levels.push({ chunks: chunks.map((c) => [...c]), label, kind, compares, moves, hl, depth });

  const splitTree: number[][][] = [];
  let current: number[][] = [initial.slice()];
  splitTree.push(current.map((c) => [...c]));
  push(current, '原始数组', 'split', null, 0);

  while (current.some((c) => c.length > 1)) {
    const next: number[][] = [];
    current.forEach((c) => {
      if (c.length <= 1) { next.push(c); return; }
      const mid = Math.ceil(c.length / 2);
      next.push(c.slice(0, mid));
      next.push(c.slice(mid));
    });
    current = next;
    splitTree.push(current.map((c) => [...c]));
    push(current, `分治 → ${current.length} 段`, 'split', null, splitTree.length - 1);
  }

  let working = current.map((c) => c.slice());
  let mergeDepth = splitTree.length - 1;

  while (working.length > 1) {
    const merged: number[][] = [];
    for (let i = 0; i < working.length; i += 2) {
      const a = working[i];
      const b = working[i + 1];
      if (!b) { merged.push(a); continue; }

      const out: number[] = [];
      let p = 0, q = 0;

      while (p < a.length && q < b.length) {
        compares += 1;
        const pickL = a[p] <= b[q];
        const partial = [...working];
        partial.splice(i, 2, [...out, pickL ? a[p] : b[q]]);
        push(partial, `比较 ${a[p]} vs ${b[q]}  →  取 ${pickL ? a[p] : b[q]}`, 'merge',
          { pairIdx: i, val: pickL ? a[p] : b[q], leftVal: a[p], rightVal: b[q] }, mergeDepth - 1);
        if (pickL) { out.push(a[p++]); } else { out.push(b[q++]); }
        moves += 1;
      }
      while (p < a.length) { out.push(a[p++]); moves += 1; }
      while (q < b.length) { out.push(b[q++]); moves += 1; }

      const snapshot = [...working];
      snapshot.splice(i, 2, out);
      push(snapshot, `合并 → [${out.join(', ')}]`, 'merge', { pairIdx: i, completed: out }, mergeDepth - 1);
      merged.push(out);
    }
    working = merged;
    mergeDepth -= 1;
  }
  push(working, '✓ 排序完成', 'final', { final: true }, 0);

  return { levels, splitTree, total: levels.length };
}

function captionFor(step: TimelineLevel): string {
  if (!step) return '';
  if (step.kind === 'split') {
    if (step.depth === 0) return '我们从一个无序的数组开始。';
    if (step.depth === 1) return '把它一分为二，分别处理左右两半。';
    return `继续向下拆分，直到每一段只剩一个元素 — 当前深度 ${step.depth}。`;
  }
  if (step.kind === 'merge') {
    if (step.hl) return `合并两个有序段，比较后取较小的放入新数组：${step.hl.val}。`;
    return '现在自下而上合并 — 每一对相邻段都是有序的，归并即可。';
  }
  return '全部归并完成，数组已经有序。';
}

interface BarProps {
  n: number;
  max: number;
  on: boolean;
  final: boolean;
  flash: boolean;
}

function Bar({ n, max, on, final: isFinal, flash }: BarProps) {
  const h = 24 + (n / max) * 80;
  const cls = ['mv-bar'];
  if (on) cls.push('is-on');
  if (isFinal) cls.push('is-final');
  if (flash) cls.push('is-flash');
  return (
    <div className={cls.join(' ')} style={{ height: `${h}px` }}>
      <span>{n}</span>
    </div>
  );
}

interface CaptionProps {
  step: TimelineLevel;
  stepIdx: number;
  total: number;
  frame: number;
  duration: number;
}

function Caption({ step, stepIdx, total, frame, duration }: CaptionProps) {
  const full = captionFor(step);
  const stepLen = duration / total;
  const stepStart = stepIdx * stepLen;
  const localT = Math.max(0, Math.min(1, (frame - stepStart) / (stepLen * 0.7)));
  const visible = full.slice(0, Math.ceil(full.length * localT));
  return (
    <div className="mv-stage-caption" key={stepIdx}>
      <span className="mv-caption-text">{visible}</span>
      {visible.length < full.length && <span className="mv-caption-cursor">▍</span>}
    </div>
  );
}

interface PlayerStageProps {
  frame: number;
  duration: number;
}

export function PlayerStage({ frame, duration }: PlayerStageProps) {
  const initial = useMemo(() => [5, 2, 8, 1, 9, 3, 7, 4], []);
  const tl = useMemo(() => buildMergeSortTimeline(initial), [initial]);
  const t = Math.min(0.999, frame / duration);
  const stepIdx = Math.floor(t * tl.total);
  const step = tl.levels[stepIdx] ?? tl.levels[tl.levels.length - 1];
  const maxVal = Math.max(...initial);

  const renderRows: Array<{
    chunks: number[][];
    current: boolean;
    kind: TimelineLevel['kind'];
    hl: HlInfo | null;
  }> = [];

  if (step.kind === 'split') {
    for (let i = 0; i <= step.depth; i++) {
      renderRows.push({ chunks: tl.splitTree[i], current: i === step.depth, kind: 'split', hl: null });
    }
  } else if (step.kind === 'merge') {
    renderRows.push({ chunks: step.chunks, current: true, kind: 'merge', hl: step.hl });
  } else {
    renderRows.push({ chunks: step.chunks, current: true, kind: 'final', hl: step.hl });
  }

  return (
    <div className="mv-stage">
      <div className="mv-stage-grid">
        <div className="mv-viz">
          {renderRows.map((row, i) => (
            <React.Fragment key={i}>
              {row.kind === 'merge' && i > 0 && <div className="mv-arrow-band">↓ MERGE</div>}
              {row.kind === 'final' && <div className="mv-arrow-band">✓ SORTED</div>}
              <div className={`mv-viz-row${row.current ? ' is-current' : ''}`}>
                {row.chunks.map((chunk, j) => {
                  const isHl = row.hl !== null && row.hl.pairIdx === j;
                  const isFinal = row.kind === 'final';
                  return (
                    <div key={j} className={`mv-viz-chunk${isHl ? ' is-merged' : ''}${isFinal ? ' is-final' : ''}`}>
                      {chunk.map((n, k) => (
                        <Bar
                          key={k}
                          n={n}
                          max={maxVal}
                          on={isHl}
                          final={isFinal}
                          flash={row.hl !== null && row.hl.val === n && isHl}
                        />
                      ))}
                    </div>
                  );
                })}
              </div>
            </React.Fragment>
          ))}
        </div>

        <div className="mv-stage-stats">
          <div><span>比较</span><b>{step.compares}</b></div>
          <div><span>移动</span><b>{step.moves}</b></div>
          <div><span>步骤</span><b>{stepIdx + 1}/{tl.total}</b></div>
        </div>

        <Caption step={step} stepIdx={stepIdx} total={tl.total} frame={frame} duration={duration} />
      </div>
    </div>
  );
}
