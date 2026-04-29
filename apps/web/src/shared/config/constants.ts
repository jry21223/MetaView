export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

export const PLAYBOOK_DEFAULTS = {
  FPS: 30,
  STEP_FRAMES: 60,
  COMPOSITION_WIDTH: 960,
  COMPOSITION_HEIGHT: 540,
} as const;
