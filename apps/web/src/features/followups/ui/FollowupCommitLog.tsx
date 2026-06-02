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
  if (versions.length === 0) return null;
  const ordered = [...versions].sort((a, b) => {
    const timeDelta = Date.parse(b.created_at) - Date.parse(a.created_at);
    return timeDelta || b.version_number - a.version_number;
  });

  return (
    <div className="mv-commit-log" aria-label="版本记录">
      <div className="mv-commit-log-head">
        <span>版本记录</span>
        <span>{versions.length} commits</span>
      </div>
      <div className="mv-commit-list">
        {ordered.map((version) => (
          <div
            key={version.version_id}
            className={`mv-commit-item${version.is_head ? " is-head" : ""}`}
          >
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
            {!version.is_head && (
              <button
                type="button"
                className="mv-commit-restore"
                onClick={() => onRestore(version.version_id)}
                disabled={pending || !canModify}
              >
                恢复到此版本
              </button>
            )}
          </div>
        ))}
      </div>
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
