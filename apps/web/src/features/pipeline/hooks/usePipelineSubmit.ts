import { useState } from "react";
import { submitPipeline } from "../api/pipelineApi";
import type { ProviderSettings } from "../../providers/hooks/useProviderSettings";

export interface PipelineSubmitInput {
  prompt: string;
  domain?: string | null;
  sourceCode?: string;
  language?: string;
  provider?: ProviderSettings;
}

export interface UsePipelineSubmitResult {
  submit: (input: PipelineSubmitInput) => Promise<void>;
  runId: string | null;
  isSubmitting: boolean;
  error: string | null;
}

export function usePipelineSubmit(): UsePipelineSubmitResult {
  const [runId, setRunId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (input: PipelineSubmitInput) => {
    setIsSubmitting(true);
    setError(null);
    setRunId(null);
    try {
      const { prompt, domain, sourceCode, language, provider } = input;
      const result = await submitPipeline({
        prompt,
        domain: domain ?? null,
        source_code: sourceCode ?? null,
        language: language ?? "python",
        provider_api_key: provider?.apiKey || null,
        provider_base_url: provider?.baseUrl || null,
        provider_model: provider?.model || null,
        router_mode: provider?.routerMode ?? null,
        router_model: provider?.routerModel || null,
        router_min_confidence: provider?.routerMinConfidence ?? null,
        router_timeout_s: provider?.routerTimeoutS ?? null,
      });
      setRunId(result.run_id);
    } catch (err) {
      const message = err instanceof Error ? err.message : "提交失败，请重试";
      setError(message);
      throw err instanceof Error ? err : new Error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return { submit, runId, isSubmitting, error };
}
