import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import {
  RECORDED_NARRATION,
  type RecordedNarrationEntry,
} from "../../../../pages/Templates/narration/recordedNarration";

/**
 * Narration for the static template pages, played from files recorded ahead
 * of time (apps/api/scripts/generate_template_narration.py).
 *
 * The template path is contractually browser-only — no run, no quota, no API
 * call, and routing.test.tsx holds it to *zero* network requests. Recorded
 * audio ships as ordinary static assets beside the posters and its index as
 * generated source, so a visitor hears the lesson without signing in, without
 * a request leaving the page until the media element itself loads a line, and
 * without costing anything per view.
 *
 * Narration is parameter-dependent: dragging a slider rewrites the wording of
 * the steps it affects. Each entry therefore carries the exact text it was
 * recorded from, and a step whose live text has drifted stays silent — a
 * sentence quoting numbers that are no longer on screen is worse than none.
 */

export interface StaticNarrationChannel {
  /** A recording exists for this case, so the mute toggle is worth showing. */
  available: boolean;
  supported: boolean;
  enabled: boolean;
  speaking: boolean;
  toggle: () => void;
  /** Play a step's recorded line, or stay silent if its text has drifted. */
  playStep: (stepId: string, text: string) => void;
  stop: () => void;
}

const STORAGE_KEY = "mv_template_narration";
const PUBLIC_DIR = "/template-narration";

function readStoredPreference(): boolean {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === null ? true : raw === "on";
  } catch {
    // Private windows and blocked site data both throw; sound-on is the
    // sensible default for a lesson, and the viewer can always mute.
    return true;
  }
}

function storePreference(enabled: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off");
  } catch {
    // Remembering the choice is a convenience, never a requirement.
  }
}

const IDLE_CHANNEL: StaticNarrationChannel = {
  available: false,
  supported: false,
  enabled: false,
  speaking: false,
  toggle: () => {},
  playStep: () => {},
  stop: () => {},
};

/**
 * @param caseId Template case whose recordings should play, e.g.
 *   ``predator-prey``. Omit (or name a case with no recording) to stay silent.
 */
export function useStaticNarration(caseId?: string): StaticNarrationChannel {
  const [enabled, setEnabled] = useState<boolean>(() =>
    typeof window === "undefined" ? false : readStoredPreference(),
  );
  const [speaking, setSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const enabledRef = useRef(enabled);
  useLayoutEffect(() => {
    enabledRef.current = enabled;
  });

  // One element for the life of the player, so a step change swaps the source
  // instead of leaking a fresh <audio> per line.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const audio = new Audio();
    audio.preload = "none";
    audioRef.current = audio;
    const done = () => setSpeaking(false);
    audio.addEventListener("ended", done);
    audio.addEventListener("error", done);
    return () => {
      audio.removeEventListener("ended", done);
      audio.removeEventListener("error", done);
      audio.pause();
      audioRef.current = null;
    };
  }, []);

  const byStep = useMemo(() => {
    const map = new Map<string, RecordedNarrationEntry>();
    for (const entry of (caseId && RECORDED_NARRATION[caseId]) || []) {
      map.set(entry.step_id, entry);
    }
    return map;
  }, [caseId]);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    setSpeaking(false);
  }, []);

  const playStep = useCallback(
    (stepId: string, text: string) => {
      if (!caseId || !enabledRef.current) return;
      const audio = audioRef.current;
      if (!audio) return;
      const entry = byStep.get(stepId);
      if (!entry || entry.text !== text.trim()) {
        // Either nothing was recorded for this step, or its line has been
        // rewritten since. Silence beats a stale reading.
        stop();
        return;
      }
      audio.pause();
      audio.src = `${PUBLIC_DIR}/${caseId}/${entry.file}`;
      audio.currentTime = 0;
      setSpeaking(true);
      void audio.play().catch(() => {
        // Autoplay policies reject sound before the first gesture; the next
        // step (or pressing play) starts it, and the timeline must not stall
        // waiting for audio that never began.
        setSpeaking(false);
      });
    },
    [byStep, caseId, stop],
  );

  const toggle = useCallback(() => {
    setEnabled((current) => {
      const next = !current;
      storePreference(next);
      if (!next) stop();
      return next;
    });
  }, [stop]);

  const available = byStep.size > 0;
  return useMemo(
    () =>
      available
        ? { available, supported: true, enabled, speaking, toggle, playStep, stop }
        : IDLE_CHANNEL,
    [available, enabled, speaking, toggle, playStep, stop],
  );
}
