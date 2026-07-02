import fs from "node:fs";
import path from "node:path";

import { createShowcaseReviewPacket } from "../src/features/playbook/engine/fixtures/showcaseReviewPacket.ts";

function resolveRepoAwarePath(inputPath) {
  const directPath = path.resolve(inputPath);
  if (path.isAbsolute(inputPath) || inputPath.startsWith("..") || fs.existsSync(directPath)) {
    return directPath;
  }
  return path.resolve("../..", inputPath);
}

const reportPath = resolveRepoAwarePath(
  process.env.SHOWCASE_REVIEW_REPORT ?? "../../eval/reports/subject-visual-showcase-baseline.json",
);
const outputPath = resolveRepoAwarePath(
  process.env.SHOWCASE_REVIEW_OUT ?? "../../eval/reports/subject-visual-showcase-review-packet.md",
);
const referenceCommand =
  process.env.SHOWCASE_REVIEW_REFERENCE_COMMAND ??
  "SHOWCASE_REFERENCE_REVIEWER=visual-reviewer npm --workspace apps/web run showcase:approve-reference";

if (!fs.existsSync(reportPath)) {
  console.error(`[showcase:review-packet] missing baseline report: ${reportPath}`);
  process.exit(1);
}

const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const packet = createShowcaseReviewPacket(report, {
  generatedAt: new Date().toISOString(),
  referenceCommand,
});

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, packet);

console.log(`[showcase:review-packet] wrote ${report.fixtureCount} fixture reviews -> ${outputPath}`);
