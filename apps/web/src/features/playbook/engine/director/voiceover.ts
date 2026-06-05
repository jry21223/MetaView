import type { DirectorBeat, DirectorScript } from "./types";

export function directorVoiceoverOverrideAllowed(
  director: DirectorScript | null | undefined,
): boolean {
  return (
    director?.source === "manual" ||
    director?.source === "agent" ||
    director?.source === "llm"
  );
}

export function resolveEffectiveVoiceover(args: {
  director: DirectorScript | null | undefined;
  beat: DirectorBeat | null;
  fallback: string;
}): string {
  const { director, beat, fallback } = args;
  if (directorVoiceoverOverrideAllowed(director) && beat?.voiceover_text?.trim()) {
    return beat.voiceover_text.trim();
  }
  return fallback;
}
