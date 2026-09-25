import { describe, expect, it } from "vitest";

import { CHEMISTRY_PUBLIC_GOLD_TEMPLATES } from "./chemistryGoldTemplates";

const titration = CHEMISTRY_PUBLIC_GOLD_TEMPLATES.find((item) => item.caseId === "acid-base-titration")!;

function endpointAnswer(indicator: "phenolphthalein" | "methyl_orange"): string {
  const params = { ...titration.parameterSchema?.defaults, indicator };
  const followups = titration.buildFollowups(params, titration.buildPublicPlaybook(params));
  const item = followups["titration-indicator"].find((entry) => entry.question === "怎样判断终点已经到达？");
  if (!item) throw new Error("missing endpoint follow-up");
  return item.answer;
}

describe("acid-base titration endpoint wording", () => {
  it("reconciles methyl orange with the red-to-orange wording of exam answer keys", () => {
    const answer = endpointAnswer("methyl_orange");
    expect(answer).toContain("由红色变为橙色");
    // The analytically consistent endpoint stays "just yellow" at pH 4.4.
    expect(answer).toContain("刚变黄（pH 4.4）");
    expect(answer).toContain("0.1%");
    expect(answer).not.toContain("褪色");
  });

  it("keeps the phenolphthalein answer free of methyl orange wording", () => {
    const answer = endpointAnswer("phenolphthalein");
    expect(answer).toContain("半分钟内不褪色");
    expect(answer).not.toContain("橙色");
  });
});
