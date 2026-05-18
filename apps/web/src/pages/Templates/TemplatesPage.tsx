import React, { useMemo, useState } from 'react';
import { GlobalTopbar, type Stage } from '../../shared/ui/GlobalTopbar';
import {
  TEMPLATES,
  TEMPLATE_DOMAIN_LABEL,
  templatesByDomain,
  type TemplateDef,
  type TemplateDomain,
} from './templates';

interface TemplatesPageProps {
  isDark: boolean;
  isProviderConfigured: boolean;
  onNavigate: (stage: Stage) => void;
  onToggleTheme: () => void;
  onOpenProviderSettings: () => void;
  /** Triggered when the user picks a template — host wires this to the
   *  pipeline submit + navigation to workbench. */
  onUseTemplate: (prompt: string) => void | Promise<void>;
}

type DomainFilter = TemplateDomain | 'all';

export function TemplatesPage({
  isDark,
  isProviderConfigured,
  onNavigate,
  onToggleTheme,
  onOpenProviderSettings,
  onUseTemplate,
}: TemplatesPageProps) {
  const [filter, setFilter] = useState<DomainFilter>('all');
  const [search, setSearch] = useState('');

  const grouped = useMemo(() => templatesByDomain(), []);
  const availableDomains = useMemo<TemplateDomain[]>(
    () => grouped.map((g) => g.domain),
    [grouped],
  );

  const filtered = useMemo<TemplateDef[]>(() => {
    const q = search.trim().toLowerCase();
    return TEMPLATES.filter((tpl) => {
      if (filter !== 'all' && tpl.domain !== filter) return false;
      if (!q) return true;
      return (
        tpl.title.toLowerCase().includes(q) ||
        tpl.desc.toLowerCase().includes(q) ||
        tpl.prompt.toLowerCase().includes(q)
      );
    });
  }, [filter, search]);

  return (
    <>
      <GlobalTopbar
        stage="templates"
        isProviderConfigured={isProviderConfigured}
        onNavigate={onNavigate}
        isDark={isDark}
        onToggleTheme={onToggleTheme}
        onOpenProviderSettings={onOpenProviderSettings}
      />
      <main className="mv-templates-body">
        <header className="mv-templates-head">
          <div className="mv-eyebrow-mini">TEMPLATE LIBRARY</div>
          <h1 className="mv-templates-title">挑一个模板，立刻看到它怎么讲</h1>
          <p className="mv-templates-sub">
            每个模板已经写好了对应的 prompt，点一下就会带着它跑一遍管线；进入工作台后还能继续微调。
          </p>
        </header>

        <section className="mv-templates-controls">
          <input
            type="search"
            className="mv-text-input mv-templates-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索模板（标题 / 描述 / prompt 关键字）"
          />
          <div className="mv-templates-filters">
            <button
              type="button"
              className={`mv-chip${filter === 'all' ? ' mv-chip-primary' : ''}`}
              onClick={() => setFilter('all')}
            >
              全部
            </button>
            {availableDomains.map((d) => (
              <button
                key={d}
                type="button"
                className={`mv-chip${filter === d ? ' mv-chip-primary' : ''}`}
                onClick={() => setFilter(d)}
              >
                {TEMPLATE_DOMAIN_LABEL[d]}
              </button>
            ))}
          </div>
        </section>

        {filtered.length === 0 && (
          <div className="mv-templates-empty">没有匹配的模板。试试改一下搜索关键字。</div>
        )}

        <div className="mv-templates-grid">
          {filtered.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              className="mv-tpl-card mv-tpl-card-lg"
              onClick={() => onUseTemplate(tpl.prompt)}
            >
              <div className="mv-tpl-tag">{TEMPLATE_DOMAIN_LABEL[tpl.domain]}</div>
              <div className="mv-tpl-title">{tpl.title}</div>
              <div className="mv-tpl-desc">{tpl.desc}</div>
              <div className="mv-tpl-prompt-preview">{tpl.prompt}</div>
              <div className="mv-tpl-arrow">→</div>
            </button>
          ))}
        </div>

        <footer className="mv-templates-foot">
          <span>
            模板写在 <code>apps/web/src/pages/Templates/templates.ts</code>；新增一项是一个对象。
          </span>
        </footer>
      </main>
    </>
  );
}
