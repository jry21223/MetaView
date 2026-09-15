import { expect } from "vitest";

import type { PlaybookScript } from "../../../../features/playbook/engine/types";
import { unreadableGlyphs } from "../../../../shared/lib/spokenText";

/**
 * Every step's narration must survive the trip to TTS.
 *
 * The API-side guard (`test_narration_speech.py`) only scans the exported
 * corpus, which is built from each case's **default** parameters — a glyph
 * that only appears at `k=4` or `target=15` slips past it. Case tests run this
 * across their whole parameter matrix instead, so the scan follows the
 * parameters a visitor can actually move.
 */
export function expectSpeakableNarration(script: PlaybookScript, label = ""): void {
  const prefix = label ? `${label} ` : "";
  for (const step of script.steps) {
    expect(
      unreadableGlyphs(step.voiceover_text),
      `${prefix}${step.step_id}: narration carries glyphs TTS drops silently`,
    ).toEqual([]);
  }
}
