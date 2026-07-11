import type { CoverageDecision } from "../../entities/pipeline/types";

interface CoverageDecisionSummaryProps {
  decision: CoverageDecision | null | undefined;
  showTechnicalDetails?: boolean;
}

const MODE_LABEL: Record<CoverageDecision["mode"], string> = {
  specialized: "专用能力",
  composable: "受控组合",
  experimental: "实验性",
  unsupported: "不支持",
};

function DiagnosticList({
  label,
  values,
}: {
  label: string;
  values: string[];
}) {
  if (values.length === 0) return null;

  return (
    <div className="mv-coverage-decision__list">
      <span>{label}</span>
      <ul>
        {values.map((value) => (
          <li key={value}>
            <code>{value}</code>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CoverageDecisionSummary({
  decision,
  showTechnicalDetails = false,
}: CoverageDecisionSummaryProps) {
  if (!decision) return null;

  const confidence = `${Math.round(decision.confidence * 100)}%`;

  return (
    <section
      aria-label="能力覆盖判定"
      className="mv-coverage-decision"
      data-coverage-mode={decision.mode}
    >
      <div className="mv-coverage-decision__header">
        <strong>能力覆盖：{MODE_LABEL[decision.mode]}</strong>
        <code>{decision.mode}</code>
      </div>
      <dl className="mv-coverage-decision__facts">
        <div>
          <dt>领域</dt>
          <dd>{decision.domain ?? "未判定"}</dd>
        </div>
        <div>
          <dt>置信度</dt>
          <dd>{confidence}</dd>
        </div>
        <div>
          <dt>回退策略</dt>
          <dd>{decision.fallback_policy}</dd>
        </div>
      </dl>
      <p className="mv-coverage-decision__reason">{decision.reason}</p>
      {showTechnicalDetails ? (
        <div className="mv-coverage-decision__diagnostics">
          <DiagnosticList label="匹配 Skill" values={decision.matched_skill_ids} />
          <DiagnosticList label="相关工具" values={decision.available_tool_ids} />
          <DiagnosticList
            label="缺失能力"
            values={decision.missing_capabilities}
          />
        </div>
      ) : null}
    </section>
  );
}
