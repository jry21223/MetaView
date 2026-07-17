import fs from "node:fs";
import path from "node:path";

import { createApprovedShowcaseReference } from "../src/features/playbook/engine/fixtures/showcaseApprovedReference.ts";

function resolveRepoAwarePath(inputPath) {
  const directPath = path.resolve(inputPath);
  if (path.isAbsolute(inputPath) || inputPath.startsWith("..") || fs.existsSync(directPath)) {
    return directPath;
  }
  return path.resolve("../..", inputPath);
}

const reportPath = resolveRepoAwarePath(
  process.env.SHOWCASE_REFERENCE_REPORT ?? "../../eval/reports/subject-visual-showcase-baseline.json",
);
const outputPath = resolveRepoAwarePath(
  process.env.SHOWCASE_REFERENCE_OUT ?? "../../eval/reports/subject-visual-showcase-approved-reference.json",
);
const reviewer = process.env.SHOWCASE_REFERENCE_REVIEWER ?? "";
const approvedAt = process.env.SHOWCASE_REFERENCE_APPROVED_AT ?? new Date().toISOString();
const notes = process.env.SHOWCASE_REFERENCE_NOTES;

if (!fs.existsSync(reportPath)) {
  console.error(`[showcase:approve-reference] missing baseline report: ${reportPath}`);
  process.exit(1);
}

let reference;
try {
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  reference = createApprovedShowcaseReference(report, { reviewer, approvedAt, notes });
} catch (error) {
  console.error(`[showcase:approve-reference] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(reference, null, 2)}\n`);

console.log(
  `[showcase:approve-reference] approved ${reference.fixture_count} fixtures as ${reference.reviewer} -> ${outputPath}`,
);
