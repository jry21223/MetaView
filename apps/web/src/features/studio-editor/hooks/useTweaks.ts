import { useState, useCallback, useEffect } from 'react';
import { THEME_PALETTE, THEME_TYPE, type ThemeName } from '../../../shared/config/themePalette';

export interface TweakValues {
  /** Named theme — backed by ``THEME_PALETTE`` and persisted in localStorage. */
  theme: ThemeName;
  accent: string;
  layout: 'drawer' | 'left' | 'top';
  leftRatio: number;
  paramsHeight: number;
  chatHeight: number;
  density: 'compact' | 'regular' | 'comfy';
  showHistoryDock: boolean;
  /** Total frames for the bar-swap animation. Range 12–60 (≈0.4–2.0s @ 30fps). */
  swapFrames: number;
}

export const TWEAK_DEFAULTS: TweakValues = {
  theme: 'dark',
  accent: THEME_PALETTE.dark.accent,
  layout: 'drawer',
  leftRatio: 22,
  paramsHeight: 32,
  chatHeight: 360,
  density: 'regular',
  showHistoryDock: true,
  // Mirrors `DEFAULT_SWAP_FRAMES` in renderers/animationTemplates.ts — keep in sync.
  swapFrames: 24,
};

const STORAGE_KEY = 'mv_tweaks';

/** Map a TweakValues theme to its underlying ``"dark" | "light"`` mode so
 *  renderers (Bar / Algorithm / Math) keep their existing binary
 *  discriminator. Issue #12. */
export function themeMode(t: TweakValues): 'dark' | 'light' {
  return THEME_TYPE[t.theme] ?? 'dark';
}

export function themeVars(t: TweakValues): Record<string, string> {
  const p = THEME_PALETTE[t.theme] ?? THEME_PALETTE.dark;
  const dark = p.type === 'dark';
  return {
    '--bg': dark ? '#0b0f0d' : '#f4f1ea',
    '--bg-2': dark ? '#10161310' : '#ffffff',
    '--surface': dark ? '#11171580' : '#ffffff',
    '--surface-2': p.surface2,
    '--ink': p.ink,
    '--ink-2': p.ink2,
    '--ink-3': p.ink3,
    '--line': p.line,
    '--line-2': p.line2,
    // ``t.accent`` defaults to the theme's accent (see useTweaks initializer);
    // users can still override via the color picker.
    '--accent': t.accent,
    '--accent-soft': t.accent + '26',
    '--warn': p.warn,
    '--radius': '14px',
    '--radius-sm': '10px',
  };
}

function loadFromStorage(defaults: TweakValues): TweakValues {
  if (typeof window === 'undefined') return defaults;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return defaults;
    const merged = { ...defaults, ...(parsed as Partial<TweakValues>) };
    // Only accept theme names the palette knows about.
    if (!(merged.theme in THEME_PALETTE)) merged.theme = defaults.theme;
    return merged;
  } catch {
    return defaults;
  }
}

function saveToStorage(values: TweakValues): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
  } catch {
    // ignore quota errors
  }
}

type SetTweakFn = {
  <K extends keyof TweakValues>(key: K, value: TweakValues[K]): void;
  (edits: Partial<TweakValues>): void;
};

export function useTweaks(defaults: TweakValues): [TweakValues, SetTweakFn] {
  const [values, setValues] = useState<TweakValues>(() => loadFromStorage(defaults));

  // Persist the latest tweak set so the user's theme survives reload. Issue #12.
  useEffect(() => {
    saveToStorage(values);
  }, [values]);

  const setTweak = useCallback((keyOrEdits: keyof TweakValues | Partial<TweakValues>, val?: unknown) => {
    const edits: Partial<TweakValues> =
      typeof keyOrEdits === 'object' && keyOrEdits !== null
        ? keyOrEdits
        : { [keyOrEdits]: val } as Partial<TweakValues>;
    setValues((prev) => {
      const next = { ...prev, ...edits };
      // When the user switches themes via the dropdown without also picking a
      // custom accent, hot-swap the accent to the new theme's default so the
      // chosen palette actually shows up on screen. Issue #12.
      if (edits.theme && !('accent' in edits)) {
        const prevDefaultAccent = THEME_PALETTE[prev.theme]?.accent;
        if (!prevDefaultAccent || prev.accent === prevDefaultAccent) {
          next.accent = THEME_PALETTE[next.theme]?.accent ?? prev.accent;
        }
      }
      return next;
    });
  }, []) as SetTweakFn;

  return [values, setTweak];
}
