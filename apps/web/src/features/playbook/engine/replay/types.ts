import type {
  AlgorithmArraySnapshot,
  AlgorithmBarsSnapshot,
  CodeHighlightOverlay,
  NarrationTemplate,
} from "../types";

/**
 * A single step emitted by a replay algorithm. The required fields (snapshot,
 * hint) describe the visual state and minimal narration. The optional fields
 * mirror the corresponding fields on `MetaStep` and allow a replay step to
 * carry richer metadata when an algorithm wants to drive TTS rate, frame
 * duration, code-highlight overlay, or a structured narration template.
 *
 * Why: see issue #34 — the previous narrow type blocked composing replay-driven
 * animation with LLM-supplied narration / pacing / code overlays.
 */
export interface ReplayedStep {
  snapshot: AlgorithmArraySnapshot | AlgorithmBarsSnapshot;
  hint?: string;
  /** Optional override for TTS rate (0.5–2.0). When omitted, player uses config default. */
  tts_rate?: number | null;
  /** Optional frame duration for this step. Resolver may scale to fit overall script length. */
  durationFrames?: number | null;
  /** Optional code-highlight overlay synchronized with this step. */
  codeHighlight?: CodeHighlightOverlay | null;
  /** Optional structured narration template for LLM-augmented pipelines. */
  narrationTemplate?: NarrationTemplate | null;
}

export type AlgorithmReplay = (input: string[]) => ReplayedStep[];
