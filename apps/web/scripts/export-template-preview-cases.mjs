import fs from "node:fs/promises";
import path from "node:path";

import {
  TEMPLATE_PREVIEW_CASE_IDS,
  getTemplatePreviewCase,
} from "../src/pages/Templates/templatePreviewCases";

const outputDirectory = path.resolve(process.argv[2] ?? "data/template-previews");
await fs.mkdir(outputDirectory, { recursive: true });

const manifest = [];
for (const id of TEMPLATE_PREVIEW_CASE_IDS) {
  const item = getTemplatePreviewCase(id);
  if (!item) continue;
  const script = item.buildScript(item.defaultParams);
  const playbookPath = path.join(outputDirectory, `${id}.playbook.json`);
  await fs.writeFile(playbookPath, `${JSON.stringify(script, null, 2)}\n`, "utf8");
  manifest.push({ id, playbookPath, posterFrame: item.posterFrame });
}

await fs.writeFile(
  path.join(outputDirectory, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8",
);
console.log(`[template-previews] exported ${manifest.length} cases to ${outputDirectory}`);
