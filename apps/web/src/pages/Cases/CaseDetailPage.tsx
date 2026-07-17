import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { DirectorScript, PlaybookScript } from "../../features/playbook/engine/types";
import {
  fetchShowcaseBySlug,
  fetchShowcaseJson,
  ShowcaseLoadError,
} from "../../features/showcases/showcaseRepository";
import type { ShowcaseCase, ShowcaseEvidence } from "../../features/showcases/showcaseSchema";
import {
  PublicShowcaseLayout,
} from "../../features/showcases/ui/PublicShowcaseLayout";
import { usePublicShowcaseTheme } from "../../features/showcases/ui/publicShowcaseTheme";
import { ShowcasePlayer } from "../../features/showcases/ui/ShowcasePlayer";
import { ShowcasePoster } from "../../features/showcases/ui/ShowcasePoster";

interface PublicSummary {
  title: string;
  body: string;
  points: string[];
}

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

function isPlaybookScript(value: unknown): value is PlaybookScript {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PlaybookScript>;
  return (
    typeof candidate.fps === "number" &&
    typeof candidate.total_frames === "number" &&
    typeof candidate.domain === "string" &&
    typeof candidate.title === "string" &&
    typeof candidate.summary === "string" &&
    Array.isArray(candidate.steps)
  );
}

function isDirectorScript(value: unknown): value is DirectorScript {
  if (value === null) return false;
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<DirectorScript>;
  return (
    candidate.schema_version === "1.0.0" &&
    typeof candidate.source === "string" &&
    typeof candidate.run_id === "string" &&
    Array.isArray(candidate.beats)
  );
}

function parseSummary(value: unknown, fallback: PublicSummary): PublicSummary {
  if (!value || typeof value !== "object") return fallback;
  const candidate = value as Partial<PublicSummary>;
  if (
    typeof candidate.title !== "string" ||
    typeof candidate.body !== "string" ||
    !Array.isArray(candidate.points) ||
    candidate.points.some((point) => typeof point !== "string")
  ) {
    return fallback;
  }
  return {
    title: candidate.title,
    body: candidate.body,
    points: candidate.points,
  };
}

function fallbackLessonSummary(caseItem: ShowcaseCase): PublicSummary {
  return {
    title: "这段讲解会带你看见什么",
    body: caseItem.learningGoal,
    points: caseItem.keyConcepts,
  };
}

function fallbackQualitySummary(caseItem: ShowcaseCase): PublicSummary {
  return {
    title: "质量说明",
    body:
      caseItem.evidence.kind === "curated-preview"
        ? "这是来自现有 PlaybookScript fixture 的精选预览，当前不宣称线上生成已验证。"
        : "该案例的验证状态以页面顶部证据标签为准。",
    points: ["画面与讲解共享同一条播放时间线", "公开页面只读取静态案例资源"],
  };
}

function fallbackBenchmarkSummary(caseItem: ShowcaseCase): PublicSummary {
  return {
    title: "验证状态",
    body:
      caseItem.evidence.kind === "curated-preview"
        ? "当前没有可公开展示的线上 Benchmark 结果。"
        : "此案例包含与证据标签对应的公开验证摘要。",
    points: [],
  };
}

export function CaseDetailPage() {
  return (
    <PublicShowcaseLayout>
      <CaseDetailContent />
    </PublicShowcaseLayout>
  );
}

function CaseDetailContent() {
  const { slug } = useParams<{ slug: string }>();
  const theme = usePublicShowcaseTheme();
  const [caseItem, setCaseItem] = useState<ShowcaseCase | null>(null);
  const [script, setScript] = useState<PlaybookScript | null>(null);
  const [director, setDirector] = useState<DirectorScript | null>(null);
  const [lessonSummary, setLessonSummary] = useState<PublicSummary | null>(null);
  const [qualitySummary, setQualitySummary] = useState<PublicSummary | null>(null);
  const [benchmarkSummary, setBenchmarkSummary] = useState<PublicSummary | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "not-found" | "error">(
    slug ? "loading" : "not-found",
  );
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let active = true;
    if (!slug) {
      return () => {
        active = false;
      };
    }

    void fetchShowcaseBySlug(slug)
      .then(async (loadedCase) => {
        if (!active) return;
        if (!loadedCase) {
          setStatus("not-found");
          return;
        }
        setCaseItem(loadedCase);
        const [playbookResult, directorResult, lessonResult, qualityResult, benchmarkResult] =
          await Promise.allSettled([
            fetchShowcaseJson(loadedCase.playbookUrl),
            fetchShowcaseJson(loadedCase.directorUrl),
            loadedCase.lessonSummaryUrl
              ? fetchShowcaseJson(loadedCase.lessonSummaryUrl)
              : Promise.resolve(null),
            loadedCase.qualitySummaryUrl
              ? fetchShowcaseJson(loadedCase.qualitySummaryUrl)
              : Promise.resolve(null),
            loadedCase.benchmarkSummaryUrl
              ? fetchShowcaseJson(loadedCase.benchmarkSummaryUrl)
              : Promise.resolve(null),
          ]);
        if (!active) return;
        const loadedScript =
          playbookResult.status === "fulfilled" && isPlaybookScript(playbookResult.value)
            ? playbookResult.value
            : null;
        setScript(loadedScript);
        setDirector(
          directorResult.status === "fulfilled" && isDirectorScript(directorResult.value)
            ? directorResult.value
            : null,
        );
        setLessonSummary(
          lessonResult.status === "fulfilled"
            ? parseSummary(lessonResult.value, fallbackLessonSummary(loadedCase))
            : fallbackLessonSummary(loadedCase),
        );
        setQualitySummary(
          qualityResult.status === "fulfilled"
            ? parseSummary(qualityResult.value, fallbackQualitySummary(loadedCase))
            : fallbackQualitySummary(loadedCase),
        );
        setBenchmarkSummary(
          benchmarkResult.status === "fulfilled"
            ? parseSummary(benchmarkResult.value, fallbackBenchmarkSummary(loadedCase))
            : fallbackBenchmarkSummary(loadedCase),
        );
        setStatus(loadedScript ? "ready" : "error");
        if (!loadedScript) setErrorMessage("播放资源格式无效，暂时无法打开这段案例。");
      })
      .catch((error: unknown) => {
        if (!active) return;
        setStatus("error");
        setErrorMessage(
          error instanceof ShowcaseLoadError
            ? error.message
            : "案例详情暂时无法加载，请稍后再试。",
        );
      });
    return () => {
      active = false;
    };
  }, [slug]);

  return (
    <main className="mv-case-detail" id="case-detail-main">
        {status === "loading" && (
          <p className="mv-cases-state" role="status">
            正在准备案例…
          </p>
        )}
        {status === "not-found" && (
          <section className="mv-case-empty" role="status">
            <p className="mv-showcase-kicker">404 / CASE NOT FOUND</p>
            <h1>没有找到这个案例</h1>
            <p>案例地址可能已失效，先回到精选案例目录看看。</p>
            <Link className="mv-showcase-button mv-showcase-button--primary" to="/cases">
              返回精选案例
            </Link>
          </section>
        )}
        {status === "error" && caseItem && (
          <section className="mv-case-empty" role="alert">
            <p className="mv-showcase-kicker">CASE LOAD ERROR</p>
            <h1>{caseItem.title}</h1>
            <p>{errorMessage}</p>
            <Link className="mv-showcase-button mv-showcase-button--secondary" to="/cases">
              返回精选案例
            </Link>
          </section>
        )}
        {status === "error" && !caseItem && (
          <section className="mv-case-empty" role="alert">
            <h1>案例详情暂时不可用</h1>
            <p>{errorMessage || "请稍后再试。"}</p>
            <Link className="mv-showcase-button mv-showcase-button--secondary" to="/cases">
              返回精选案例
            </Link>
          </section>
        )}
        {status === "ready" && caseItem && script && (
          <>
            <header className="mv-case-detail__header">
              <div className="mv-case-detail__head-copy">
                <div className="mv-case-card__meta">
                  <span className="mv-showcase-chip">{DOMAIN_LABELS[caseItem.domain]}</span>
                  <span className={`mv-showcase-evidence mv-showcase-evidence--${caseItem.evidence.kind}`}>
                    {evidenceLabel(caseItem.evidence)}
                  </span>
                </div>
                <p className="mv-showcase-kicker">{caseItem.topic}</p>
                <h1>{caseItem.title}</h1>
                <p className="mv-case-detail__goal">{caseItem.learningGoal}</p>
                <div className="mv-case-detail__head-actions">
                  <a className="mv-showcase-button mv-showcase-button--secondary" href="#case-player">
                    播放案例
                  </a>
                  <Link
                    className="mv-showcase-button mv-showcase-button--primary"
                    to="/create"
                    state={{ prompt: caseItem.prompt }}
                  >
                    用同题生成
                  </Link>
                  <a
                    className="mv-case-detail__github"
                    href="https://github.com/jry21223/MetaView"
                    target="_blank"
                    rel="noreferrer"
                  >
                    查看项目源码 ↗
                  </a>
                </div>
              </div>
              <ShowcasePoster src={caseItem.posterUrl} alt={`${caseItem.title}画布预览`} className="mv-case-detail__poster" />
            </header>

            <section className="mv-case-detail__player-section" id="case-player" aria-labelledby="case-player-title">
              <div className="mv-case-detail__section-head">
                <div>
                  <p className="mv-showcase-kicker">PLAYBOOK / STATIC PLAYBACK</p>
                  <h2 id="case-player-title">先看一遍讲解过程</h2>
                </div>
                <span className="mv-case-detail__static-note">静态案例 · 不会创建运行任务</span>
              </div>
              <ShowcasePlayer script={script} director={director} theme={theme} />
            </section>

            <section className="mv-case-detail__content-grid" aria-label="案例说明">
              {lessonSummary && <SummarySection summary={lessonSummary} />}
              <section className="mv-case-detail__info-block">
                <h2>关键概念</h2>
                <ul>
                  {caseItem.keyConcepts.map((concept) => <li key={concept}>{concept}</li>)}
                </ul>
              </section>
              {qualitySummary && <SummarySection summary={qualitySummary} />}
              {benchmarkSummary && <SummarySection summary={benchmarkSummary} />}
            </section>

            <footer className="mv-case-detail__footer">
              <Link to="/cases">← 返回精选案例</Link>
              <Link to="/create" state={{ prompt: caseItem.prompt }}>使用同一题目创建新讲解 →</Link>
            </footer>
          </>
        )}
    </main>
  );
}

function SummarySection({ summary }: { summary: PublicSummary }) {
  return (
    <section className="mv-case-detail__info-block">
      <h2>{summary.title}</h2>
      <p>{summary.body}</p>
      {summary.points.length > 0 && (
        <ul>
          {summary.points.map((point) => <li key={point}>{point}</li>)}
        </ul>
      )}
    </section>
  );
}
