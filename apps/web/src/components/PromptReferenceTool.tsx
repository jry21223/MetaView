import { useEffect, useState } from "react";

import { generatePromptReference } from "../api/client";
import type {
  ModelProvider,
  PromptReferenceResponse,
  ProviderDescriptor,
  TopicDomain,
} from "../types";
import { domainLabels } from "../domainPresentation";

interface PromptReferenceToolProps {
  providers: ProviderDescriptor[];
  defaultProvider: ModelProvider;
}

function canUseForPromptAuthoring(provider: ProviderDescriptor): boolean {
  return provider.configured && provider.kind === "openai_compatible";
}

export function PromptReferenceTool({
  providers,
  defaultProvider,
}: PromptReferenceToolProps) {
  const availableProviders = providers.filter(canUseForPromptAuthoring);
  const firstProvider = availableProviders[0]?.name ?? defaultProvider;
  const [subject, setSubject] = useState<TopicDomain>("algorithm");
  const [provider, setProvider] = useState<ModelProvider>(firstProvider);
  const [notes, setNotes] = useState("");
  const [write, setWrite] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PromptReferenceResponse | null>(null);

  useEffect(() => {
    if (!availableProviders.length) {
      return;
    }
    if (!availableProviders.some((item) => item.name === provider)) {
      setProvider(firstProvider);
    }
  }, [availableProviders, firstProvider, provider]);

  async function handleGenerate() {
    if (!availableProviders.length) {
      setError("当前没有可用的 OpenAI 兼容 provider，无法生成 reference prompt。");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await generatePromptReference({
        subject,
        provider,
        notes: notes.trim() || null,
        write,
      });
      setResult(response);
    } catch (toolError) {
      setError(toolError instanceof Error ? toolError.message : "生成失败");
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (!result?.markdown) {
      return;
    }
    await navigator.clipboard.writeText(result.markdown);
  }

  return (
    <section className="panel panel-nested prompt-tool-panel">
      <div className="panel-header">
        <span className="panel-kicker">Prompt Tool</span>
        <h3>学科 Prompt 生成器</h3>
        <p>在网页里直接为 `skills/.../references/*.md` 生成或重写分阶段学科提示词。</p>
      </div>

      <div className="prompt-form prompt-tool-form">
        <div className="select-grid">
          <label>
            <span>学科</span>
            <select
              value={subject}
              onChange={(event) => setSubject(event.target.value as TopicDomain)}
            >
              {(["algorithm", "math", "code", "physics", "chemistry", "biology", "geography"] as TopicDomain[]).map(
                (item) => (
                  <option key={item} value={item}>
                    {domainLabels[item]}
                  </option>
                ),
              )}
            </select>
          </label>

          <label>
            <span>Provider</span>
            <select
              value={provider}
              onChange={(event) => setProvider(event.target.value)}
              disabled={!availableProviders.length}
            >
              {availableProviders.map((item) => (
                <option key={item.name} value={item.name}>
                  {item.label} / {item.stage_models.planning ?? item.model}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label>
          <span>补充要求</span>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={6}
            placeholder="例如：强调终止条件、状态同步、不要写泛化空话；更适合本项目当前 staged runtime。"
          />
        </label>

        <label className="prompt-tool-checkbox">
          <input
            type="checkbox"
            checked={write}
            onChange={(event) => setWrite(event.target.checked)}
          />
          <span>直接写回对应学科的 reference 文件</span>
        </label>

        <div className="form-actions">
          <button type="button" onClick={handleGenerate} disabled={loading || !availableProviders.length}>
            {loading ? "生成中..." : write ? "生成并写回" : "生成预览"}
          </button>
          <button
            type="button"
            className="ghost-button"
            onClick={() => void handleCopy()}
            disabled={!result?.markdown}
          >
            复制 Markdown
          </button>
        </div>
      </div>

      {!availableProviders.length ? (
        <p className="error-text">当前没有可用的 OpenAI 兼容 provider。请先在 Provider 管理中配置。</p>
      ) : null}
      {error ? <p className="error-text">{error}</p> : null}

      {result ? (
        <div className="prompt-tool-result">
          <div className="panel-toolbar">
            <div className="history-item-meta">
              <span>{result.provider}</span>
              <span>{result.model}</span>
              <span>{result.wrote_file ? "written" : "preview only"}</span>
            </div>
            <span className="prompt-tool-path">{result.output_path}</span>
          </div>
          <pre>{result.markdown}</pre>
        </div>
      ) : (
        <div className="history-empty">
          选择学科并填写补充要求后，这里会显示生成后的 reference markdown。
        </div>
      )}
    </section>
  );
}
