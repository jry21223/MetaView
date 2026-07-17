import type { Stage } from "../shared/ui/GlobalTopbar";

function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname || "/";
}

export function stageToPath(stage: Stage, runId?: string | null): string {
  switch (stage) {
    case "intake":
      return "/create";
    case "workbench":
      return runId ? `/run/${encodeURIComponent(runId)}` : "/create";
    case "history":
      return "/history";
    case "templates":
      return "/templates";
    case "settings":
      return "/settings";
  }
}

export function pathToStage(pathname: string): Stage {
  const path = normalizePath(pathname);
  if (path === "/create") return "intake";
  if (path.startsWith("/run/") && path.length > "/run/".length) return "workbench";
  if (path === "/history") return "history";
  if (path === "/templates") return "templates";
  if (path === "/settings") return "settings";
  return "intake";
}
