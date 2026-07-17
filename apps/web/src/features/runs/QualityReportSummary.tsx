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

const STATUS_SUMMARY: Record<QualityReport["status"], string> = {
  clean: "已通过生成检查。",
  warnings: "讲解可用，但仍有需要注意的项目。",
  repairable: "发现可修复的问题，建议调整后重试。",
  blocked: "结果未通过检查，已停止进入播放流程。",
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
        <strong>生成检查</strong>
        <span>{STATUS_LABEL[report.status]}</span>
      </div>
      <p className="mv-quality-report__summary">{STATUS_SUMMARY[report.status]}</p>
      <details className="mv-quality-report__details">
        <summary>
          查看检查详情{report.issues.length > 0 ? `（${report.issues.length} 项）` : ""}
        </summary>
        <div className="mv-quality-report__technical-meta">
          {report.generator_path} · {report.coverage_mode}
        </div>
        {report.summary && <p>{report.summary}</p>}
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
      </details>
    </section>
  );
}
