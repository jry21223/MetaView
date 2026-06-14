import { useState } from "react";
import type { RunVersionRecord } from "../api/followupApi";

interface FollowupCommitLogProps {
  versions: RunVersionRecord[];
  pending: boolean;
  canModify: boolean;
  onRestore: (versionId: string) => void;
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
  if (versions.length === 0) return null;
  const ordered = [...versions].sort((a, b) => {
    const timeDelta = Date.parse(b.created_at) - Date.parse(a.created_at);
    return timeDelta || b.version_number - a.version_number;
  });

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
                  onRestore(version.version_id);
                  setExpanded(false);
                }}
                disabled={pending || !canModify}
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
