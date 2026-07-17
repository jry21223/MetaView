import fs from "node:fs";
import path from "node:path";

import {
  createShowcaseBaselineReport,
  isShowcaseBaselineReleaseReady,
} from "../src/features/playbook/engine/fixtures/showcaseBaselineReport.ts";
import { listSubjectVisualShowcaseEntries } from "../src/features/playbook/engine/fixtures/subjectVisualShowcase.ts";

function resolveRepoAwarePath(inputPath) {
  const directPath = path.resolve(inputPath);
  if (path.isAbsolute(inputPath) || inputPath.startsWith("..") || fs.existsSync(directPath)) {
    return directPath;
  }
  return path.resolve("../..", inputPath);
}

const summaryPath = resolveRepoAwarePath(
  process.env.SHOWCASE_BASELINE_SUMMARY ?? "../../eval/shots/subject-visual-showcase-smoke/summary.json",
);
const outputPath = resolveRepoAwarePath(
  process.env.SHOWCASE_BASELINE_OUT ?? "../../eval/reports/subject-visual-showcase-baseline.json",
);
const referencePath = process.env.SHOWCASE_BASELINE_REFERENCE
  ? resolveRepoAwarePath(process.env.SHOWCASE_BASELINE_REFERENCE)
  : null;
const requireApprovedReference = process.env.SHOWCASE_BASELINE_REQUIRE_APPROVED === "1";

if (!fs.existsSync(summaryPath)) {
  console.error(`[showcase:baseline] missing smoke summary: ${summaryPath}`);
  process.exit(1);
}

const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
if (!Array.isArray(summary)) {
  console.error(`[showcase:baseline] smoke summary must be an array: ${summaryPath}`);
  process.exit(1);
}

let reference = undefined;
if (referencePath) {
  if (!fs.existsSync(referencePath)) {
    console.error(`[showcase:baseline] missing reference report: ${referencePath}`);
    process.exit(1);
  }
  const parsedReference = JSON.parse(fs.readFileSync(referencePath, "utf8"));
  if (!Array.isArray(parsedReference.entries)) {
    console.error(`[showcase:baseline] reference report must contain entries: ${referencePath}`);
    process.exit(1);
  }
  reference = {
    entries: parsedReference.entries
      .filter((entry) => entry?.id && entry?.stats)
      .map((entry) => ({
        id: entry.id,
        stats: entry.stats,
        ...(entry.review && { review: entry.review }),
        ...(entry.screenshotReview?.referenceReview && { review: entry.screenshotReview.referenceReview }),
      })),
  };
}

const catalog = listSubjectVisualShowcaseEntries().map(({ script: _script, ...entry }) => entry);
const report = createShowcaseBaselineReport(catalog, summary, new Date().toISOString(), reference);

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);

if (!report.ok) {
  console.error(`[showcase:baseline] failed -> ${outputPath}`);
  if (report.missingSummaryIds.length > 0) {
    console.error(`[showcase:baseline] missing summary rows: ${report.missingSummaryIds.join(", ")}`);
  }
  if (report.unexpectedSummaryIds.length > 0) {
    console.error(`[showcase:baseline] unexpected summary rows: ${report.unexpectedSummaryIds.join(", ")}`);
  }
  for (const entry of report.entries.filter((item) => item.issues.length > 0)) {
    console.error(`[showcase:baseline] ${entry.id}: ${entry.issues.join(", ")}`);
  }
  process.exit(1);
}

if (!report.driftOk) {
  for (const entry of report.entries.filter((item) => item.driftIssues.length > 0)) {
    console.warn(`[showcase:baseline] ${entry.id} drift: ${entry.driftIssues.join(", ")}`);
  }
}

if (!isShowcaseBaselineReleaseReady(report, { requireApprovedReference })) {
  const pendingIds = report.entries
    .filter((entry) => entry.screenshotReview.status !== "approved_reference_current")
    .map((entry) => entry.id);
  console.error(
    `[showcase:baseline] approved reference required but not current for: ${pendingIds.join(", ")}`,
  );
  process.exit(1);
}

console.log(
  `[showcase:baseline] passed ${report.fixtureCount} fixtures` +
    `${reference ? `, driftOk=${report.driftOk}` : ""}` +
    `${requireApprovedReference ? `, approvedReferenceReady=${report.approvedReferenceReady}` : ""} -> ${outputPath}`,
);
