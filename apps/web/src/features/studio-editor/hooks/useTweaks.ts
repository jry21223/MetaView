import { useState, useCallback } from 'react';

export interface TweakValues {
  theme: 'dark' | 'light';
  accent: string;
  layout: 'drawer' | 'left' | 'top';
  leftRatio: number;
  paramsHeight: number;
  chatHeight: number;
  density: 'compact' | 'regular' | 'comfy';
  showHistoryDock: boolean;
}

export const TWEAK_DEFAULTS: TweakValues = {
  theme: 'dark',
  accent: '#10b981',
  layout: 'drawer',
  leftRatio: 22,
  paramsHeight: 32,
  chatHeight: 360,
  density: 'regular',
  showHistoryDock: true,
};

export function themeVars(t: TweakValues): Record<string, string> {
  const dark = t.theme === 'dark';
  return {
    '--bg': dark ? '#0b0f0d' : '#f4f1ea',
    '--bg-2': dark ? '#10161310' : '#ffffff',
    '--surface': dark ? '#11171580' : '#ffffff',
    '--surface-2': dark ? '#0e1412' : '#faf8f3',
    '--ink': dark ? '#e8efe9' : '#161a18',
    '--ink-2': dark ? '#9ba8a0' : '#5d655f',
    '--ink-3': dark ? '#5b6862' : '#9aa39d',
    '--line': dark ? '#1d2a23' : '#e6e2d5',
    '--line-2': dark ? '#27332c' : '#d6d1c2',
    '--accent': t.accent,
    '--accent-soft': t.accent + '26',
    '--warn': '#e9a23b',
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
