import type {
  TeachingDeckProject,
  TeachingDeckRenderer,
  TeachingDeckSlide,
  TeachingDeckSlideKind,
} from "../../../entities/teaching-deck/types";

const STORAGE_KEY = "mv_teaching_deck_mvp_v0_1";

const SLIDE_KINDS = new Set<TeachingDeckSlideKind>([
  "cover",
  "objectives",
  "context",
  "concept",
  "dynamic_explanation",
  "derivation",
  "example",
  "exercise",
  "summary",
]);
const RENDERERS = new Set<TeachingDeckRenderer>(["pptmaster", "metaview"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isSlide(value: unknown): value is TeachingDeckSlide {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.order === "number" &&
    typeof value.kind === "string" &&
    SLIDE_KINDS.has(value.kind as TeachingDeckSlideKind) &&
    typeof value.title === "string" &&
    typeof value.teachingGoal === "string" &&
    isStringArray(value.points) &&
    typeof value.renderer === "string" &&
    RENDERERS.has(value.renderer as TeachingDeckRenderer)
  );
}

function isProject(value: unknown): value is TeachingDeckProject {
  if (!isRecord(value) || !isRecord(value.input)) return false;
  return (
    value.schemaVersion === "0.1.0" &&
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string" &&
    typeof value.input.topic === "string" &&
    typeof value.input.grade === "string" &&
    typeof value.input.durationMinutes === "number" &&
    typeof value.input.teachingGoals === "string" &&
    typeof value.input.sourceMaterial === "string" &&
    Array.isArray(value.slides) &&
    value.slides.every(isSlide)
  );
}

export function loadTeachingDeckProject(): TeachingDeckProject | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isProject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveTeachingDeckProject(project: TeachingDeckProject): void {
  if (typeof window === "undefined") return;
  try {
    // Pasted source material may be unpublished or sensitive, and the planner
    // can derive visible slide text from it. When source material is present,
    // keep the whole project session-only instead of persisting an indirect
    // excerpt through the generated slides.
    if (project.input.sourceMaterial.trim()) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
  } catch {
    // Storage is optional. Quota and privacy-mode failures must not block editing.
  }
}

export function clearTeachingDeckProject(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore privacy-mode failures.
  }
}
