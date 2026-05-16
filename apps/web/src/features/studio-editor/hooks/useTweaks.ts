import { useState, useCallback } from 'react';
import { THEME_PALETTE } from '../../../shared/config/themePalette';

export interface TweakValues {
  theme: 'dark' | 'light';
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

export function themeVars(t: TweakValues): Record<string, string> {
  const dark = t.theme === 'dark';
  const p = THEME_PALETTE[t.theme];
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
    '--accent': t.accent,
    '--accent-soft': t.accent + '26',
    '--warn': p.warn,
    '--radius': '14px',
    '--radius-sm': '10px',
  };
}

type SetTweakFn = {
  <K extends keyof TweakValues>(key: K, value: TweakValues[K]): void;
  (edits: Partial<TweakValues>): void;
};

export function useTweaks(defaults: TweakValues): [TweakValues, SetTweakFn] {
  const [values, setValues] = useState<TweakValues>(defaults);

  const setTweak = useCallback((keyOrEdits: keyof TweakValues | Partial<TweakValues>, val?: unknown) => {
    const edits: Partial<TweakValues> =
      typeof keyOrEdits === 'object' && keyOrEdits !== null
        ? keyOrEdits
        : { [keyOrEdits]: val } as Partial<TweakValues>;
    setValues((prev) => ({ ...prev, ...edits }));
  }, []) as SetTweakFn;

  return [values, setTweak];
}
