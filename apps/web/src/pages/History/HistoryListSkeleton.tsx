const PLACEHOLDER_COUNT = 6;

/** Shimmer placeholder cards shown while the history list first syncs. */
export function HistoryListSkeleton() {
  return (
    <div
      className="mv-history-skeleton mv-motion-decorative"
      role="status"
      aria-live="polite"
      aria-label="正在同步历史记录"
    >
      {Array.from({ length: PLACEHOLDER_COUNT }, (_, i) => (
        <div
          key={i}
          className="mv-history-skeleton-item"
          style={{ animationDelay: `${i * 0.06}s` }}
        >
          <div className="mv-skeleton-bar mv-history-skeleton-line mv-history-skeleton-line--title" />
          <div className="mv-skeleton-bar mv-history-skeleton-line mv-history-skeleton-line--meta" />
        </div>
      ))}
    </div>
  );
}
