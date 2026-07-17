import { useState } from "react";
import { submitPipeline } from "../api/pipelineApi";
import type { ProviderSettings } from "../../providers/hooks/useProviderSettings";

export interface PipelineSubmitInput {
  prompt: string;
  sourceCode?: string | null;
  language?: string | null;
  sourceFilename?: string | null;
  sourceSizeBytes?: number | null;
  provider?: ProviderSettings;
}

export interface UsePipelineSubmitResult {
  submit: (input: PipelineSubmitInput) => Promise<string>;
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
      const {
        prompt,
        sourceCode,
        language,
        sourceFilename,
        sourceSizeBytes,
        provider,
      } = input;
      const hasSourceCode = sourceCode != null;
      const result = await submitPipeline({
        prompt,
        domain: null,
        source_code: hasSourceCode ? sourceCode : null,
        language: hasSourceCode ? (language ?? null) : null,
        source_filename: hasSourceCode ? (sourceFilename ?? null) : null,
        source_size_bytes: hasSourceCode ? (sourceSizeBytes ?? null) : null,
        provider_api_key: provider?.apiKey || null,
        provider_base_url: provider?.baseUrl || null,
        provider_model: provider?.model || null,
        router_mode: provider?.routerMode ?? null,
        router_model: provider?.routerModel || null,
        router_min_confidence: provider?.routerMinConfidence ?? null,
        router_timeout_s: provider?.routerTimeoutS ?? null,
      });
      setRunId(result.run_id);
      return result.run_id;
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
