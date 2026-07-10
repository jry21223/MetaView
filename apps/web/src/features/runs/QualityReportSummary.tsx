import type { QualityReport } from "../../entities/pipeline/types";

interface QualityReportSummaryProps {
  report: QualityReport | null | undefined;
}

const STATUS_LABEL: Record<QualityReport["status"], string> = {
  clean: "通过",
  warnings: "有提醒",
  repairable: "待修复",
  blocked: "已阻断",
};

export function QualityReportSummary({ report }: QualityReportSummaryProps) {
  if (!report) return null;

  return (
    <section
      aria-label="生成质量报告"
      className="mv-quality-report"
      data-quality-status={report.status}
    >
      <div className="mv-quality-report__header">
        <strong>后端质量门禁：{STATUS_LABEL[report.status]}</strong>
        <span>
          {report.generator_path} · {report.coverage_mode}
        </span>
      </div>
      {report.summary && <p className="mv-quality-report__summary">{report.summary}</p>}
      {report.issues.length > 0 && (
        <ul className="mv-quality-report__issues">
          {report.issues.map((issue, index) => (
            <li
              key={`${issue.code}-${issue.path}-${index}`}
              data-severity={issue.severity}
            >
              <div>
                <code>{issue.code}</code>
                <span>{issue.path}</span>
              </div>
              <p>{issue.message}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
