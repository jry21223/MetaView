import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  fetchShowcaseCase,
  fetchShowcaseManifest,
  ShowcaseLoadError,
} from "../../features/showcases/showcaseRepository";
import type { ShowcaseCase, ShowcaseEvidence } from "../../features/showcases/showcaseSchema";
import { PublicShowcaseLayout } from "../../features/showcases/ui/PublicShowcaseLayout";
import { ShowcasePoster } from "../../features/showcases/ui/ShowcasePoster";

const CASE_ORDER = [
  "derivative-tangent",
  "factorial-stack",
  "bfs-tree",
  "projectile-motion",
];

const DOMAIN_LABELS: Record<ShowcaseCase["domain"], string> = {
  math: "数学",
  algorithm: "算法",
  code: "代码",
  physics: "物理",
};

function evidenceLabel(evidence: ShowcaseEvidence): string {
  switch (evidence.kind) {
    case "curated-preview":
      return "精选预览";
    case "recorded-verified":
      return "录制验证";
    case "live-verified":
      return "实时验证";
  }
}

function isVerifiedEvidence(evidence: ShowcaseEvidence): boolean {
  return evidence.kind === "recorded-verified" || evidence.kind === "live-verified";
}

function sortCases(left: ShowcaseCase, right: ShowcaseCase): number {
  const leftIndex = CASE_ORDER.indexOf(left.slug);
  const rightIndex = CASE_ORDER.indexOf(right.slug);
  return (leftIndex < 0 ? Number.MAX_SAFE_INTEGER : leftIndex) -
    (rightIndex < 0 ? Number.MAX_SAFE_INTEGER : rightIndex);
}

export function CasesPage() {
  const [cases, setCases] = useState<ShowcaseCase[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [warning, setWarning] = useState("");

  useEffect(() => {
    let active = true;
    void fetchShowcaseManifest()
      .then(async (manifest) => {
        const loaded = await Promise.allSettled(
          manifest.cases.map((entry) => fetchShowcaseCase(entry)),
        );
        if (!active) return;
        const validCases = loaded
          .filter(
            (result): result is PromiseFulfilledResult<ShowcaseCase> =>
              result.status === "fulfilled",
          )
          .map((result) => result.value)
          .filter((caseItem) => caseItem.visibility === "public")
          .sort(sortCases);
        const failedCount = loaded.length - validCases.length;
        setCases(validCases);
        setWarning(failedCount > 0 ? "部分案例详情暂时不可用，已安全跳过。" : "");
        setStatus(validCases.length > 0 ? "ready" : "error");
      })
      .catch((error: unknown) => {
        if (!active) return;
        setStatus("error");
        setWarning(
          error instanceof ShowcaseLoadError
            ? error.message
            : "精选案例暂时无法加载，请稍后再试。",
        );
      });
    return () => {
      active = false;
    };
  }, []);

  const verifiedCount = useMemo(
    () => cases.filter((caseItem) => isVerifiedEvidence(caseItem.evidence)).length,
    [cases],
  );

  return (
    <PublicShowcaseLayout>
      <main className="mv-cases-page" id="cases-main">
        <header className="mv-cases-page__intro">
          <p className="mv-showcase-kicker">PUBLIC SHOWCASE / 01</p>
          <h1>精选案例</h1>
          <p className="mv-cases-page__description">
            这些案例展示 MetaView 当前重点打磨的可视化讲解能力。
          </p>
          <p className="mv-cases-page__note">
            已验证案例可以直接播放，也可以使用同一题目重新生成一次新的讲解。
          </p>
        </header>

        {status === "loading" && (
          <p className="mv-cases-state" role="status">
            正在读取案例目录…
          </p>
        )}
        {status === "error" && (
          <div className="mv-cases-state mv-cases-state--error" role="alert">
            <strong>案例目录暂时不可用</strong>
            <span>{warning || "请稍后再试。"}</span>
          </div>
        )}
        {warning && status === "ready" && (
          <p className="mv-cases-state mv-cases-state--warning" role="status">
            {warning}
          </p>
        )}
        {status === "ready" && (
          <section className="mv-cases-grid" aria-label="公开精选案例">
            {cases.map((caseItem) => (
              <article className="mv-case-card" key={caseItem.id}>
                <div className="mv-case-card__copy">
                  <div className="mv-case-card__meta">
                    <span className="mv-showcase-chip">{DOMAIN_LABELS[caseItem.domain]}</span>
                    <span className={`mv-showcase-evidence mv-showcase-evidence--${caseItem.evidence.kind}`}>
                      {evidenceLabel(caseItem.evidence)}
                    </span>
                  </div>
                  <h2>{caseItem.title}</h2>
                  <p className="mv-case-card__topic">{caseItem.topic}</p>
                  <p className="mv-case-card__summary">{caseItem.summary}</p>
                  <div className="mv-case-card__actions">
                    <Link className="mv-showcase-button mv-showcase-button--primary" to={`/cases/${caseItem.slug}`}>
                      查看并播放
                    </Link>
                    <span className="mv-case-card__status">
                      {isVerifiedEvidence(caseItem.evidence) ? "已验证，可重新生成" : "可播放预览"}
                    </span>
                  </div>
                </div>
                <Link
                  className="mv-case-card__poster-link"
                  to={`/cases/${caseItem.slug}`}
                  aria-label={`打开案例：${caseItem.title}`}
                >
                  <ShowcasePoster src={caseItem.posterUrl} alt={`${caseItem.title}画布预览`} />
                </Link>
              </article>
            ))}
          </section>
        )}

        {status === "ready" && verifiedCount === 0 && (
          <p className="mv-cases-page__honesty">
            当前公开目录以精选预览为主；验证状态只在有对应证据时展示。
          </p>
        )}
      </main>
    </PublicShowcaseLayout>
  );
}
