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

const MODE_SUMMARY: Record<CoverageDecision["mode"], string> = {
  specialized: "已匹配经过验证的专用讲解能力。",
  composable: "可以由现有画面能力受控组合生成。",
  experimental: "可以解释题目，但当前缺少经过验证的专用画面能力。",
  unsupported: "当前能力不足，暂时不能安全生成可播放讲解。",
};

const FALLBACK_LABEL: Record<CoverageDecision["fallback_policy"], string> = {
  use_skill: "调用专用能力",
  compose: "组合现有能力",
  limited_visual: "限制画面复杂度",
  text_only: "仅返回文本",
  reject: "不生成",
};

const DOMAIN_LABEL: Record<string, string> = {
  algorithm: "算法",
  biology: "生物",
  chemistry: "化学",
  code: "代码",
  geography: "地理",
  math: "数学",
  physics: "物理",
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
        <strong>讲解能力</strong>
        <span>{MODE_LABEL[decision.mode]}</span>
      </div>
      <dl className="mv-coverage-decision__facts">
        <div>
          <dt>领域</dt>
          <dd>
            {decision.domain
              ? (DOMAIN_LABEL[decision.domain.toLowerCase()] ?? decision.domain)
              : "未判定"}
          </dd>
        </div>
        <div>
          <dt>置信度</dt>
          <dd>{confidence}</dd>
        </div>
        <div>
          <dt>回退策略</dt>
          <dd>{FALLBACK_LABEL[decision.fallback_policy]}</dd>
        </div>
      </dl>
      <p className="mv-coverage-decision__reason">
        {MODE_SUMMARY[decision.mode]}
      </p>
      {showTechnicalDetails ? (
        <details className="mv-coverage-decision__diagnostics">
          <summary>查看判定依据</summary>
          <p>{decision.reason}</p>
          <DiagnosticList label="匹配 Skill" values={decision.matched_skill_ids} />
          <DiagnosticList label="相关工具" values={decision.available_tool_ids} />
          <DiagnosticList label="缺失能力" values={decision.missing_capabilities} />
        </details>
      ) : null}
    </section>
  );
}
