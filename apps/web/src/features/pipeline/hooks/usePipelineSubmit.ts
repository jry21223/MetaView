import { useState } from "react";
import { submitPipeline } from "../api/pipelineApi";
import type { ProviderSettings } from "../../providers/hooks/useProviderSettings";

export interface UsePipelineSubmitResult {
  submit: (prompt: string, sourceCode?: string, language?: string, provider?: ProviderSettings) => Promise<void>;
  runId: string | null;
  isSubmitting: boolean;
  error: string | null;
}

export function usePipelineSubmit(): UsePipelineSubmitResult {
  const [runId, setRunId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (
    prompt: string,
    sourceCode?: string,
    language?: string,
    provider?: ProviderSettings,
  ) => {
    setIsSubmitting(true);
    setError(null);
    setRunId(null);
    try {
      const result = await submitPipeline({
        prompt,
        source_code: sourceCode ?? null,
        language: language ?? "python",
        provider_api_key: provider?.apiKey || null,
        provider_base_url: provider?.baseUrl || null,
        provider_model: provider?.model || null,
      });
      setRunId(result.run_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "提交失败，请重试");
    } finally {
      setIsSubmitting(false);
    }
  };

  return { submit, runId, isSubmitting, error };
}
