import { Fragment, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  TEMPLATES,
  TEMPLATE_DOMAIN_LABEL,
  templatesByDomain,
  type TemplateDef,
  type TemplateDomain,
} from "./templates";
import { getTemplatePreviewCase } from "./templatePreviewCases";
import { TemplateLinePreview } from "./TemplateLinePreview";

type DomainFilter = TemplateDomain | "all";

interface TemplatesPageProps {
  onOpenTemplate?: (templateId: string) => void;
}

export function TemplatesPage({ onOpenTemplate }: TemplatesPageProps = {}) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<DomainFilter>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const grouped = useMemo(() => templatesByDomain(), []);
  const availableDomains = useMemo<TemplateDomain[]>(
    () => grouped.map((group) => group.domain),
    [grouped],
  );
  const filtered = useMemo<TemplateDef[]>(() => {
    const query = search.trim().toLowerCase();
    return TEMPLATES.filter((template) => {
      if (filter !== "all" && template.domain !== filter) return false;
      if (!query) return true;
      return template.title.toLowerCase().includes(query) ||
        template.desc.toLowerCase().includes(query) ||
        template.prompt.toLowerCase().includes(query);
    });
  }, [filter, search]);
  const filteredGroups = useMemo(
    () => grouped
      .map((group) => ({
        ...group,
        items: filtered.filter((template) => template.domain === group.domain),
      }))
      .filter((group) => group.items.length > 0),
    [filtered, grouped],
  );
  const openTemplate = (templateId: string) => {
    if (onOpenTemplate) {
      onOpenTemplate(templateId);
      return;
    }
    navigate(`/templates/${templateId}`);
  };

  const activateTemplate = (template: TemplateDef) => {
    if (!template.previewCaseId) return;
    if (selectedId === template.id) {
      openTemplate(template.id);
      return;
    }
    setSelectedId(template.id);
  };

  return (
    <main className="mv-templates-body">
      <header className="mv-templates-head">
        <div className="mv-templates-head__copy">
          <div className="mv-eyebrow-mini">从一个好问题开始</div>
          <h1 className="mv-templates-title">挑一个感兴趣的知识点，从这里慢慢看懂它</h1>
          <p className="mv-templates-sub">这些案例已经准备好了。先看一眼，再跟着完整讲解一步步走下去。</p>
        </div>
        <div className="mv-templates-index-mark" aria-label={`${filtered.length} 个模板`}>
          <strong>{String(filtered.length).padStart(2, "0")}</strong>
          <span>VISIBLE<br />TEMPLATES</span>
        </div>
      </header>

      <section className="mv-templates-controls" aria-label="查找讲解模板">
        <label className="mv-templates-search-wrap">
          <span>SEARCH</span>
          <input
            type="search"
            className="mv-text-input mv-templates-search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setSelectedId(null);
            }}
            placeholder="搜索标题或知识点"
          />
        </label>
        <div className="mv-templates-filters" role="group" aria-label="学科筛选">
          <button
            type="button"
            aria-pressed={filter === "all"}
            className={`mv-chip${filter === "all" ? " mv-chip-primary" : ""}`}
            onClick={() => {
              setFilter("all");
              setSelectedId(null);
            }}
          >
            全部
          </button>
          {availableDomains.map((domain) => (
            <button
              key={domain}
              type="button"
              aria-pressed={filter === domain}
              className={`mv-chip${filter === domain ? " mv-chip-primary" : ""}`}
              onClick={() => {
                setFilter(domain);
                setSelectedId(null);
              }}
            >
              {TEMPLATE_DOMAIN_LABEL[domain]}
            </button>
          ))}
        </div>
      </section>

      {filtered.length === 0 ? (
        <div className="mv-templates-empty">
          <span>NO MATCH</span>
          <strong>没有匹配的讲解模板</strong>
          <p>试试更短的关键词，或切换到全部学科。</p>
        </div>
      ) : (
        <div className="mv-templates-catalog">
          {filteredGroups.map((group, groupIndex) => (
            <section className="mv-template-domain" key={group.domain}>
              <header className="mv-template-domain__head">
                <span>{String(groupIndex + 1).padStart(2, "0")}</span>
                <h2>{TEMPLATE_DOMAIN_LABEL[group.domain]}</h2>
                <small>{group.items.length} 个模板</small>
              </header>
              <div className="mv-template-list">
                {group.items.map((template, index) => {
                  const selected = selectedId === template.id;
                  const previewCase = template.previewCaseId
                    ? getTemplatePreviewCase(template.previewCaseId)
                    : null;
                  const previewId = `template-preview-${template.id}`;
                  return (
                    <Fragment key={template.id}>
                      <button
                        type="button"
                        className={`mv-template-entry${selected ? " is-selected" : ""}${previewCase ? " is-published" : " is-pending"}`}
                        aria-label={`${template.title}，${previewCase ? (selected ? "进入完整案例" : "展开预览") : "制作中"}`}
                        aria-expanded={previewCase ? selected : undefined}
                        aria-controls={previewCase ? previewId : undefined}
                        disabled={!previewCase}
                        onClick={() => activateTemplate(template)}
                      >
                        <span className="mv-template-entry__index">{String(index + 1).padStart(2, "0")}</span>
                        <span className="mv-template-entry__copy">
                          <strong>{template.title}</strong>
                          <small>{template.desc}</small>
                        </span>
                        <TemplateLinePreview caseId={template.previewCaseId} />
                        <span className="mv-template-entry__action">
                          {previewCase ? (selected ? "进入案例" : "展开预览") : "制作中"}
                          {previewCase && <b>→</b>}
                        </span>
                      </button>
                      {selected && previewCase && (
                        <button
                          id={previewId}
                          type="button"
                          className="mv-template-expanded-preview"
                          onClick={() => openTemplate(template.id)}
                          aria-label={`进入完整案例：${template.title}`}
                        >
                          <span className="mv-template-expanded-preview__media">
                            <img src={previewCase.posterUrl} alt={previewCase.posterAlt} />
                          </span>
                          <span className="mv-template-expanded-preview__copy">
                            <small>STATIC PLAYBOOK / {previewCase.buildScript(previewCase.defaultParams).steps.length} STEPS</small>
                            <strong>再次点击，进入完整案例</strong>
                            <span>左侧播放画面，右侧可调参数与固定 Follow-up。</span>
                          </span>
                        </button>
                      )}
                    </Fragment>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
