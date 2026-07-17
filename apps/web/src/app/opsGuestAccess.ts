import type { IntakeContext } from "../features/studio-editor/ui/IntakeScreen";

const PENDING_SUBMISSION_KEY = "metaview:pending-ops-submission";
const POST_LOGIN_PATH_KEY = "metaview:post-login-path";

export function isSafeOpsReturnPath(value: string | null | undefined): value is string {
  return Boolean(
    value &&
      (value === "/create" ||
        value === "/cases" ||
        value === "/settings" ||
        value === "/history" ||
        /^\/run\/[^/]+$/.test(value)),
  );
}

export function savePostLoginPath(path: string): void {
  if (typeof window === "undefined" || !isSafeOpsReturnPath(path)) return;
  window.sessionStorage.setItem(POST_LOGIN_PATH_KEY, path);
}

export function consumePostLoginPath(): string | null {
  if (typeof window === "undefined") return null;
  const path = window.sessionStorage.getItem(POST_LOGIN_PATH_KEY);
  window.sessionStorage.removeItem(POST_LOGIN_PATH_KEY);
  return isSafeOpsReturnPath(path) ? path : null;
}

export function savePendingOpsSubmission(context: IntakeContext): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(PENDING_SUBMISSION_KEY, JSON.stringify(context));
  savePostLoginPath("/create");
}

export function readPendingOpsSubmission(): IntakeContext | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(PENDING_SUBMISSION_KEY);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as IntakeContext;
    return typeof value.prompt === "string" ? value : null;
  } catch {
    return null;
  }
}

export function clearPendingOpsSubmission(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(PENDING_SUBMISSION_KEY);
}
