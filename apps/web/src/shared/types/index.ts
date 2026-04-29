// Re-export barrel — backwards-compatible surface for migrating consumers
export type * from "../../entities/cir/types";
export type * from "../../entities/pipeline/types";
export type * from "../../entities/provider/types";
export type * from "../../entities/playbook/types";

// Prompt-related types (used by tools feature)
export interface PromptReferenceRequest {
  subject: string;
  provider?: string | null;
  notes?: string | null;
  write: boolean;
}

export interface PromptReferenceResponse {
  subject: string;
  provider: string;
  model: string;
  output_path: string;
  markdown: string;
  wrote_file: boolean;
  raw_output?: string | null;
}

export interface CustomSubjectPromptRequest {
  subject_name: string;
  provider?: string | null;
  summary?: string | null;
  notes?: string | null;
  write: boolean;
}

export interface CustomSubjectPromptResponse {
  subject_name: string;
  slug: string;
  provider: string;
  model: string;
  output_path: string;
  markdown: string;
  wrote_file: boolean;
  raw_output?: string | null;
}
