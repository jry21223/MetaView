import fs from "node:fs";
import path from "node:path";

import { listSubjectVisualShowcaseEntries } from "../src/features/playbook/engine/fixtures/subjectVisualShowcase.ts";

const outDir = path.resolve(process.argv[2] ?? "../../eval/reports/subject-visual-fixtures");
fs.mkdirSync(outDir, { recursive: true });

const entries = listSubjectVisualShowcaseEntries();
const index = entries.map(({ script: _script, ...entry }) => entry);

for (const entry of entries) {
  const output = path.join(outDir, `${entry.id}.json`);
  fs.writeFileSync(output, `${JSON.stringify(entry.script, null, 2)}\n`);
  console.log(`[showcase:export] ${entry.id} -> ${output}`);
}

const indexPath = path.join(outDir, "index.json");
fs.writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);
console.log(`[showcase:export] index -> ${indexPath}`);
