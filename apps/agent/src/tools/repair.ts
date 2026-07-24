import { Type } from "@earendil-works/pi-ai";
import type { AgentTool } from "@earendil-works/pi-agent-core";

import {
  applyPlaybookPatch,
  type PatchOperation,
  type RepairScope,
} from "../state/jsonPatch.js";
import type { PlaybookOutput } from "../state/types.js";
import { defineTool, toolResult } from "./common.js";

export interface RepairToolDeps {
  previousPlaybook: PlaybookOutput;
  scope: RepairScope;
}

export function makeRepairTools(deps: RepairToolDeps): AgentTool[] {
  return [
    defineTool(
      "apply_playbook_patch",
      "Apply scoped Playbook repair",
      "Apply a bounded RFC 6902 add/remove/replace patch to the previous " +
        "Playbook. Paths are checked against the blocking-issue scope. " +
        "Compiler-owned step IDs and timing cannot be edited. This is the only " +
        "repair tool; do not rebuild the full Playbook.",
      Type.Object({
        patch: Type.Array(
          Type.Object({
            op: Type.Union([
              Type.Literal("add"),
              Type.Literal("remove"),
              Type.Literal("replace"),
            ]),
            path: Type.String({ minLength: 1 }),
            value: Type.Optional(Type.Unknown()),
          }),
          { minItems: 1, maxItems: 24 },
        ),
        rationale: Type.String({ minLength: 1, maxLength: 800 }),
      }),
      async (args) => {
        const repaired = applyPlaybookPatch(
          deps.previousPlaybook,
          args.patch as PatchOperation[],
          deps.scope,
        );
        return toolResult(
          {
            ok: true as const,
            playbook: repaired,
            repair: {
              strategy: "path_scoped_json_patch",
              issue_codes: deps.scope.issueCodes,
              allowed_prefixes: deps.scope.allowedPrefixes,
              operation_count: args.patch.length,
              rationale: args.rationale,
            },
          },
          { terminate: true },
        );
      },
    ) as AgentTool,
  ];
}
