import type { ShowcaseBaselineReport, ShowcaseBaselineReportEntry } from "./showcaseBaselineReport";

export interface ShowcaseReviewPacketOptions {
  generatedAt?: string;
  title?: string;
  referenceCommand?: string;
}

const DEFAULT_TITLE = "MetaView Subject Visual Showcase Review Packet";
const DEFAULT_REFERENCE_COMMAND =
  "SHOWCASE_REFERENCE_REVIEWER=visual-reviewer npm --workspace apps/web run showcase:approve-reference";

function statusLabel(report: ShowcaseBaselineReport) {
  if (!report.ok || !report.reviewReady) return "blocked";
  if (report.approvedReferenceReady) return "approved_reference_current";
  return "ready_for_review";
}

function listValue(values: readonly string[]) {
  return values.length > 0 ? values.join(", ") : "none";
}

function markerList(values: readonly string[]) {
  return values.length > 0 ? values.map((value) => `\`${value}\``).join(", ") : "none";
}

function screenshotLink(entry: ShowcaseBaselineReportEntry) {
  return entry.output ? `[open screenshot](${entry.output})` : "missing screenshot";
}

function pct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function imageStats(entry: ShowcaseBaselineReportEntry) {
  if (!entry.stats) return "missing";

  return [
    `${entry.stats.width}x${entry.stats.height}`,
    `${entry.stats.bytes} bytes`,
    `${entry.stats.uniqueColors} colors`,
    `${pct(entry.stats.contentPixelRatio)} content.`,
  ].join(", ");
}

function entryIssues(entry: ShowcaseBaselineReportEntry) {
  return listValue([...entry.screenshotReview.blockingIssues, ...entry.screenshotReview.driftIssues]);
}

function blockedEntries(report: ShowcaseBaselineReport) {
  return report.entries.filter(
    (entry) => entry.screenshotReview.blockingIssues.length > 0 || entry.screenshotReview.driftIssues.length > 0,
  );
}

export function createShowcaseReviewPacket(
  report: ShowcaseBaselineReport,
  options: ShowcaseReviewPacketOptions = {},
) {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const title = options.title ?? DEFAULT_TITLE;
  const referenceCommand = options.referenceCommand ?? DEFAULT_REFERENCE_COMMAND;
  const status = statusLabel(report);
  const blocked = blockedEntries(report);

  const lines = [
    `# ${title}`,
    "",
    `Baseline report generated at: \`${report.generatedAt}\``,
    `Packet generated at: \`${generatedAt}\``,
    `Review readiness: \`${status}\``,
    `Fixtures rendered: \`${report.renderedCount}/${report.fixtureCount}\``,
    `Approved reference current: \`${report.approvedReferenceReady ? "yes" : "no"}\``,
    "",
    "## Review Instructions",
    "",
    "- Open each screenshot from the table below.",
    "- Approve only when the screenshot visibly contains the listed asset markers and no obvious layout regression.",
    "- Do not approve entries listed under Blocked Fixtures until their blocker metadata is cleared.",
    "- After review, stamp the approved reference with:",
    "",
    "```bash",
    referenceCommand,
    "```",
    "",
    "## Fixture Summary",
    "",
    "| Fixture | Domain | Renderer | Pack | Status | Screenshot | Issues |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...report.entries.map(
      (entry) =>
        `| \`${entry.id}\` | ${entry.domain} | ${entry.rendererKind} | ${entry.packId} | ${entry.screenshotReview.status} | ${screenshotLink(entry)} | ${entryIssues(entry)} |`,
    ),
    "",
  ];

  if (blocked.length > 0) {
    lines.push(
      "## Blocked Fixtures",
      "",
      ...blocked.map((entry) => `- \`${entry.id}\`: ${entryIssues(entry)}`),
      "",
    );
  }

  lines.push("## Review Checklist", "");
  for (const entry of report.entries) {
    lines.push(
      `- [ ] \`${entry.id}\``,
      `  - Screenshot: ${entry.output ? entry.output : "missing"}`,
      `  - Status: ${entry.screenshotReview.status}`,
      `  - Required markers: ${markerList(entry.screenshotReview.requiredMarkers)}`,
      `  - Image stats: ${imageStats(entry)}`,
    );
    if (entryIssues(entry) !== "none") {
      lines.push(`  - Issues: ${entryIssues(entry)}`);
    }
  }

  return `${lines.join("\n")}\n`;
}
