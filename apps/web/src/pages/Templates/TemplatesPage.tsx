import { useMemo, useState } from "react";
import { PlaybookPlayer } from "../../features/playbook/engine/player/PlaybookPlayer";
import { getSubjectVisualShowcaseEntry } from "../../features/playbook/engine/fixtures/subjectVisualShowcase";
import {
  TEMPLATES,
  TEMPLATE_DOMAIN_LABEL,
  templatesByDomain,
  type TemplateDef,
  type TemplateDomain,
} from "./templates";

interface TemplatesPageProps {
  /** Triggered when the user picks a template — host wires this to the
   *  pipeline submit + navigation to workbench. */
  onUseTemplate: (prompt: string) => void | Promise<void>;
}

type DomainFilter = TemplateDomain | "all";

export function TemplatesPage({
  onUseTemplate,
}: TemplatesPageProps) {
  const [filter, setFilter] = useState<DomainFilter>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(TEMPLATES[0]?.id ?? "");
  const selected = TEMPLATES.find((template) => template.id === selectedId) ?? TEMPLATES[0];
  const preview = selected?.previewFixtureId ? getSubjectVisualShowcaseEntry(selected.previewFixtureId) : undefined;

  const grouped = useMemo(() => templatesByDomain(), []);
  const availableDomains = useMemo<TemplateDomain[]>(
    () => grouped.map((g) => g.domain),
    [grouped],
  );

  const filtered = useMemo<TemplateDef[]>(() => {
    const q = search.trim().toLowerCase();
    return TEMPLATES.filter((tpl) => {
      if (filter !== "all" && tpl.domain !== filter) return false;
      if (!q) return true;
      return (
        tpl.title.toLowerCase().includes(q) ||
        tpl.desc.toLowerCase().includes(q) ||
        tpl.prompt.toLowerCase().includes(q)
      );
    });
  }, [filter, search]);

  const filteredGroups = useMemo(
    () =>
      grouped
        .map((group) => ({
          ...group,
          items: filtered.filter((template) => template.domain === group.domain),
        }))
        .filter((group) => group.items.length > 0),
    [filtered, grouped],
  );

  return (
    <main className="mv-templates-body">
      <header className="mv-templates-head">
        <div className="mv-templates-head__copy">
          <div className="mv-eyebrow-mini">LESSON ATLAS / 讲解图谱</div>
          <h1 className="mv-templates-title">从一个可靠样例开始</h1>
          <p className="mv-templates-sub">
            按学科浏览已经验证过的讲解起点，选中后仍可在工作台继续修改。
          </p>
        </div>
        <div className="mv-templates-index-mark" aria-label={`${filtered.length} 个模板`}>
          <strong>{String(filtered.length).padStart(2, "0")}</strong>
          <span>VISIBLE<br />STARTS</span>
        </div>
      </header>

      <section className="mv-templates-controls" aria-label="查找讲解模板">
        <label className="mv-templates-search-wrap">
          <span>SEARCH</span>
          <input
            type="search"
            className="mv-text-input mv-templates-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索标题、知识点或 prompt"
          />
        </label>
        <div className="mv-templates-filters" role="group" aria-label="学科筛选">
          <button
            type="button"
            aria-pressed={filter === "all"}
            className={`mv-chip${filter === "all" ? " mv-chip-primary" : ""}`}
            onClick={() => setFilter("all")}
          >
            全部
          </button>
          {availableDomains.map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={filter === d}
              className={`mv-chip${filter === d ? " mv-chip-primary" : ""}`}
              onClick={() => setFilter(d)}
            >
              {TEMPLATE_DOMAIN_LABEL[d]}
            </button>
          ))}
        </div>
      </section>

      {selected && (
        <section className="mv-template-preview" aria-label="案例预览">
          <div className="mv-template-preview__copy">
            <div className="mv-eyebrow-mini">CASE PREVIEW</div>
            <h2>{selected.title}</h2>
            <p>{selected.desc}</p>
            {preview ? (
              <span className="mv-chip">{"\u53ef\u64ad\u653e\u9884\u89c8"}</span>
            ) : (
              <span className="mv-chip">{"\u6682\u65e0\u9759\u6001\u9884\u89c8"}</span>
            )}
            <button type="button" className="mv-send" onClick={() => void Promise.resolve(onUseTemplate(selected.prompt))}>
              {"\u7528\u8fd9\u4e2a\u6848\u4f8b\u5f00\u59cb"}
            </button>
          </div>
          <div className="mv-template-preview__stage">
            {preview ? (
              <PlaybookPlayer script={preview.script} theme="light" showLearningConsole layoutMode="desktop" />
            ) : (
              <p>{"\u8fd9\u4e2a\u6848\u4f8b\u5df2\u63d0\u4f9b\u9898\u76ee\u6a21\u677f\uff0c\u6682\u65e0\u786e\u5b9a\u6027\u9759\u6001\u64ad\u653e\u4f5c\u4e3a\u9884\u89c8\u3002"}</p>
            )}
          </div>
        </section>
      )}
      {filtered.length === 0 ? (
        <div className="mv-templates-empty">
          <span>NO MATCH</span>
          <strong>没有匹配的讲解起点</strong>
          <p>试试更短的关键词，或切换到全部学科。</p>
        </div>
      ) : (
        <div className="mv-templates-catalog">
          {filteredGroups.map((group, groupIndex) => (
            <section className="mv-template-domain" key={group.domain}>
              <header className="mv-template-domain__head">
                <span>{String(groupIndex + 1).padStart(2, "0")}</span>
                <h2>{TEMPLATE_DOMAIN_LABEL[group.domain]}</h2>
                <small>{group.items.length} 个起点</small>
              </header>
              <div className="mv-template-list">
                {group.items.map((template, index) => (
                  <button
                    key={template.id}
                    type="button"
                    className="mv-template-entry"
                    aria-pressed={selected?.id === template.id}
                    onClick={() => setSelectedId(template.id)}
                  >
                    <span className="mv-template-entry__index">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="mv-template-entry__copy">
                      <strong>{template.title}</strong>
                      <small>{template.desc}</small>
                    </span>
                    <span
                      className="mv-template-entry__signal"
                      data-domain={template.domain}
                      aria-hidden="true"
                    >
                      <i />
                      <i />
                      <i />
                    </span>
                    <span className="mv-template-entry__action">
                      {template.previewFixtureId ? "查看案例" : "查看模板"} <b>→</b>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
