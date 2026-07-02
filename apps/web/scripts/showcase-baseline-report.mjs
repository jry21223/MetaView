import fs from "node:fs";
import path from "node:path";

import { createShowcaseBaselineReport } from "../src/features/playbook/engine/fixtures/showcaseBaselineReport.ts";
import { listSubjectVisualShowcaseEntries } from "../src/features/playbook/engine/fixtures/subjectVisualShowcase.ts";

const summaryPath = path.resolve(
  process.env.SHOWCASE_BASELINE_SUMMARY ?? "../../eval/shots/subject-visual-showcase-smoke/summary.json",
);
const outputPath = path.resolve(
  process.env.SHOWCASE_BASELINE_OUT ?? "../../eval/reports/subject-visual-showcase-baseline.json",
);

if (!fs.existsSync(summaryPath)) {
  console.error(`[showcase:baseline] missing smoke summary: ${summaryPath}`);
  process.exit(1);
}

const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
if (!Array.isArray(summary)) {
  console.error(`[showcase:baseline] smoke summary must be an array: ${summaryPath}`);
  process.exit(1);
}

const catalog = listSubjectVisualShowcaseEntries().map(({ script: _script, requiredMarkers: _requiredMarkers, ...entry }) => entry);
const report = createShowcaseBaselineReport(catalog, summary);

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

console.log(`[showcase:baseline] passed ${report.fixtureCount} fixtures -> ${outputPath}`);
