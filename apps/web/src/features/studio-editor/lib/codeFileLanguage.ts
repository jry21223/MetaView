const EXT_TO_LANGUAGE: Record<string, string> = {
  ".py": "python",
  ".js": "javascript",
  ".ts": "typescript",
  ".tsx": "typescript",
  ".jsx": "javascript",
  ".java": "java",
  ".cpp": "cpp",
  ".cc": "cpp",
  ".cxx": "cpp",
  ".c": "c",
  ".h": "c",
  ".hpp": "cpp",
  ".cs": "csharp",
  ".go": "go",
  ".rs": "rust",
  ".rb": "ruby",
  ".swift": "swift",
  ".kt": "kotlin",
  ".kts": "kotlin",
  ".php": "php",
  ".r": "r",
  ".m": "objc",
  ".sh": "bash",
  ".bash": "bash",
  ".zsh": "bash",
  ".sql": "sql",
  ".html": "html",
  ".css": "css",
  ".json": "json",
  ".yaml": "yaml",
  ".yml": "yaml",
};

export const CODE_FILE_ACCEPT = Object.keys(EXT_TO_LANGUAGE).join(",");

export function languageFromCodeFilename(name: string): string | null {
  const dotIndex = name.lastIndexOf(".");
  if (dotIndex < 0) return null;
  return EXT_TO_LANGUAGE[name.slice(dotIndex).toLowerCase()] ?? null;
}
