import { auditRegisteredAssetPacks } from "../src/features/playbook/engine/assets/assetAudit.ts";

const report = auditRegisteredAssetPacks();

if (!report.ok) {
  for (const issue of report.errors) {
    const target = [issue.packId, issue.assetId, issue.sourceId].filter(Boolean).join("/");
    console.error(`[asset:audit] ${issue.code} ${target}: ${issue.message}`);
  }
  process.exitCode = 1;
} else {
  console.log("[asset:audit] passed");
}
