import { useState } from "react";
import type { RunVersionRecord } from "../api/followupApi";

interface FollowupCommitLogProps {
  versions: RunVersionRecord[];
  pending: boolean;
  canModify: boolean;
  onRestore: (versionId: string) => void | Promise<void>;
}

const SOURCE_LABELS: Record<string, string> = {
  initial: "initial",
  followup: "follow-up",
  restore: "restore",
};

export function FollowupCommitLog({
  versions,
  pending,
  canModify,
  onRestore,
}: FollowupCommitLogProps) {
  const [expanded, setExpanded] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoringVersionId, setRestoringVersionId] = useState<string | null>(null);
  if (versions.length === 0) return null;
  const ordered = [...versions].sort((a, b) => {
    const timeDelta = Date.parse(b.created_at) - Date.parse(a.created_at);
    return timeDelta || b.version_number - a.version_number;
  });
  const restoreDisabled = pending || restoringVersionId !== null || !canModify;
  const restoreVersion = async (versionId: string) => {
    setRestoreError(null);
    setRestoringVersionId(versionId);
    try {
      await onRestore(versionId);
      setExpanded(false);
    } catch (err) {
      setRestoreError(formatRestoreError(err));
    } finally {
      setRestoringVersionId(null);
    }
  };

  return (
    <div className={`mv-commit-log${expanded ? " is-expanded" : " is-collapsed"}`} aria-label="版本记录">
      <button
        type="button"
        className="mv-commit-log-head"
        aria-expanded={expanded}
        aria-label={expanded ? "收起版本记录" : "展开版本记录"}
        onClick={() => setExpanded((current) => !current)}
      >
        <span>版本记录</span>
        <span>{versions.length} commits</span>
      </button>
      {restoreError && (
        <div className="mv-commit-log-error" role="alert">
          {restoreError}
        </div>
      )}
      {expanded && (
        <div className="mv-commit-list">
          {ordered.map((version) => {
            const item = (
              <>
                <div className="mv-commit-main">
                  <div className="mv-commit-meta">
                    <span className="mv-commit-id">{version.short_id}</span>
                    <span className={`mv-commit-source is-${version.source}`}>
                      {SOURCE_LABELS[version.source] ?? version.source}
                    </span>
                    {version.is_head && <span className="mv-commit-head">HEAD</span>}
                  </div>
                  <div className="mv-commit-summary">{version.summary}</div>
                  <div className="mv-commit-time">{formatCommitTime(version.created_at)}</div>
                </div>
              </>
            );
            const className = `mv-commit-item${version.is_head ? " is-head" : ""}`;
            if (version.is_head) {
              return (
                <div key={version.version_id} className={className}>
                  {item}
                </div>
              );
            }
            return (
              <button
                key={version.version_id}
                type="button"
                className={className}
                onClick={() => {
                  void restoreVersion(version.version_id);
                }}
                disabled={restoreDisabled}
                aria-label={`恢复版本 ${version.short_id}`}
              >
                {item}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function formatCommitTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatRestoreError(err: unknown): string {
  if (err instanceof Error && err.message.trim()) {
    return `恢复版本失败：${err.message}`;
  }
  return "恢复版本失败，请稍后重试。";
}
