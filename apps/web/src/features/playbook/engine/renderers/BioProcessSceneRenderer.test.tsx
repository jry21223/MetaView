import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import type { BioProcessSceneSnapshot, MetaStep } from "../types";
import type { RendererProps } from "./types";
import { BioProcessSceneRenderer } from "./BioProcessSceneRenderer";

function dnaReplicationSnapshot(extra: Partial<BioProcessSceneSnapshot> = {}): BioProcessSceneSnapshot {
  return {
    kind: "bio_process_scene",
    pack_id: "biology-basic",
    process_id: "dna_replication",
    steps: [
      {
        id: "template",
        semantic_role: "dna",
        label: "template DNA",
        x: 22,
        y: 48,
        width: 18,
        height: 38,
        asset_id: "dna-helix",
      },
      {
        id: "fork",
        semantic_role: "process_step",
        label: "replication fork",
        x: 50,
        y: 48,
        width: 24,
        height: 24,
        asset_id: "replication-fork",
      },
      {
        id: "copy",
        semantic_role: "dna",
        label: "new strands",
        x: 78,
        y: 48,
        width: 18,
        height: 38,
        asset_id: "dna-helix",
      },
    ],
    connections: [
      {
        id: "template-to-fork",
        from: "template",
        to: "fork",
        semantic_role: "flow_arrow",
        label: "unzip",
        asset_id: "core-flow-arrow",
      },
      {
        id: "fork-to-copy",
        from: "fork",
        to: "copy",
        semantic_role: "flow_arrow",
        label: "copy",
        asset_id: "core-flow-arrow",
      },
    ],
    callouts: [
      { id: "base-pairing", target_id: "fork", label: "base pairing", side: "top" },
    ],
    caption: "DNA replication copies each strand by complementary base pairing.",
    ...extra,
  };
}

function step(snapshot: BioProcessSceneSnapshot): MetaStep<BioProcessSceneSnapshot> {
  return {
    step_id: "dna_replication",
    end_frame: 90,
    title: "DNA replication",
    voiceover_text: snapshot.caption ?? "",
    snapshot,
    tokens: [],
  };
}

function props(snapshot: BioProcessSceneSnapshot): RendererProps {
  return {
    step: step(snapshot),
    prevStep: null,
    frame: 90,
    stepStartFrame: 0,
    stepEndFrame: 90,
    progress: 1,
    theme: "light",
    domain: "biology",
  };
}

describe("BioProcessSceneRenderer", () => {
  it("statically renders dna_replication with process assets and flow markers", () => {
    const markup = renderToStaticMarkup(<BioProcessSceneRenderer {...props(dnaReplicationSnapshot())} />);

    expect(markup).toContain("bio-process-scene");
    expect(markup).toContain('data-process-id="dna_replication"');
    expect(markup).toContain('data-asset-id="dna-helix"');
    expect(markup).toContain('data-asset-id="replication-fork"');
    expect(markup).toContain('data-asset-id="core-flow-arrow"');
    expect(markup).toContain('data-semantic-role="process_step"');
    expect(markup).toContain('data-semantic-role="callout"');
    expect(markup).not.toContain('data-missing-asset="true"');
  });
});
