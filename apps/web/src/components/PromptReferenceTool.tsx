import { useEffect, useMemo, useState } from "react";

import { generateCustomSubjectPrompt } from "../api/client";
import type {
  CustomSubjectPromptResponse,
  ModelProvider,
  ProviderDescriptor,
} from "../types";

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
  const [subjectName, setSubjectName] = useState("");
  const [summary, setSummary] = useState("");
  const [provider, setProvider] = useState<ModelProvider>(firstProvider);
  const [notes, setNotes] = useState("");
  const [write, setWrite] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CustomSubjectPromptResponse | null>(null);

  useEffect(() => {
    if (!availableProviders.length) {
      return;
    }
    if (!availableProviders.some((item) => item.name === provider)) {
      setProvider(firstProvider);
    }
  }, [availableProviders, firstProvider, provider]);

  const normalizedSubjectName = subjectName.trim();
  const canSubmit = normalizedSubjectName.length >= 2 && availableProviders.length > 0;
  const projectedOutputPath = useMemo(() => {
    if (result?.output_path) {
      return result.output_path;
    }
    return write
      ? "skills/generated-subject-prompts/<slug>.md"
      : "preview only";
  }, [result?.output_path, write]);

  async function handleGenerate() {
    if (!availableProviders.length) {
      setError("当前没有可用的 OpenAI 兼容 provider，无法生成自定义学科 prompt。");
      return;
    }
    if (normalizedSubjectName.length < 2) {
      setError("请先填写学科名称。");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await generateCustomSubjectPrompt({
        subject_name: normalizedSubjectName,
        provider,
        summary: summary.trim() || null,
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
        <h3>自定义学科 Prompt 工具</h3>
        <p>
          这里用于为用户生成一个全新的学科 Prompt 包，不会改动内置
          `algorithm / math / code / physics / chemistry / biology / geography`
          的运行时 reference。
        </p>
      </div>

      <div className="skill-card prompt-tool-guide">
        <strong>推荐输入方式</strong>
        <p>
          最好把学科范围、核心对象、阶段顺序、关键过渡、常见误解和想保留的讲解风格一起写清。
          工具会更偏向生成能支撑“分析 → 分镜 → 校验 → 实现 → 修复”的生产级 Prompt，而不是空泛学科描述。
        </p>
        <div className="history-item-meta">
          <span>core objects</span>
          <span>storyboard beats</span>
          <span>timing risks</span>
          <span>validator checks</span>
        </div>
      </div>

      <div className="prompt-form prompt-tool-form">
        <div className="select-grid">
          <label>
            <span>学科名称</span>
            <input
              value={subjectName}
              onChange={(event) => setSubjectName(event.target.value)}
              placeholder="例如：Economics / 历史学 / Transport Phenomena"
            />
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
          <span>学科说明</span>
          <textarea
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            rows={5}
            placeholder="说明这个新学科覆盖什么内容、主要对象是什么、讲解通常按什么阶段推进、动画应该强调哪些关系或守恒量。"
          />
        </label>

        <label>
          <span>补充要求</span>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={5}
            placeholder="例如：强调分镜节拍、先静态建模再动态变化、保留中间状态、检查遮挡与时序、避免泛化空话。"
          />
        </label>

        <label className="prompt-tool-checkbox">
          <input
            type="checkbox"
            checked={write}
            onChange={(event) => setWrite(event.target.checked)}
          />
          <span>写入独立目录 `skills/generated-subject-prompts/`</span>
        </label>

        <div className="form-actions">
          <button type="button" onClick={handleGenerate} disabled={loading || !canSubmit}>
            {loading ? "生成中..." : write ? "生成并写入" : "生成新学科 Prompt"}
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
              <span>{result.subject_name}</span>
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
          输入新学科名称后，这里会生成一个可直接复制或写入文件的独立 prompt 包。
          目标路径：{projectedOutputPath}
        </div>
      )}
    </section>
  );
}
