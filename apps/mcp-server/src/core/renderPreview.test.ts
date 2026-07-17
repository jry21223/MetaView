import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { MetaViewPreviewRenderer } from "./renderPreview";
import type { DirectorScript, PlaybookScript } from "../../../web/src/features/playbook/engine/types";

function playbook(): PlaybookScript {
  return {
    fps: 30,
    total_frames: 30,
    domain: "math",
    title: "Preview",
    summary: "",
    parameter_controls: [],
    steps: [
      {
        step_id: "s1",
        end_frame: 12,
        title: "Step",
        voiceover_text: "",
        tokens: [],
        snapshot: {
          kind: "math_formula",
          formula_latex: "1 + 1 = 2",
        },
      },
    ],
  };
}

function director(): DirectorScript {
  return {
    schema_version: "1.0.0",
    source: "rule",
    run_id: "preview-run",
    beats: [
      {
        beat_id: "b1",
        step_id: "s1",
        start_frame: 0,
        end_frame: 30,
        intent: "focus",
        shot_type: "close",
        camera_motion: "push_in",
        pacing: "slow",
        emphasis_terms: ["1 + 1"],
      },
    ],
  };
}

describe("MetaViewPreviewRenderer", () => {
  it("renders a PNG still through the existing web render-shots seam", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "metaview-preview-test-"));
    const expectedBytes = Buffer.from("png-bytes");
    const renderer = new MetaViewPreviewRenderer({
      repoRoot,
      execFileFn: async (file, args, options) => {
        expect(file).toBe(process.execPath);
        expect(args[0]).toBe(join(repoRoot, "apps", "web", "scripts", "render-shots.mjs"));
        expect(options.cwd).toBe(repoRoot);
        expect(options.env.SHOT_FRAME).toBe("9");
        expect(options.env.SHOT_LABEL).toBe("mcp-preview");
        expect(options.env.SHOT_DIRECTOR_PATH).toBeUndefined();
        const outDir = args[2];
        await mkdir(outDir, { recursive: true });
        await writeFile(join(outDir, "mcp-preview.png"), expectedBytes);
        return { stdout: "", stderr: "" };
      },
    });

    const result = await renderer.render({ playbookScript: playbook(), frame: 9, format: "png" });

    expect(result.preview.mimeType).toBe("image/png");
    expect(result.preview.data).toBe(expectedBytes.toString("base64"));
    expect(result.debug.frame).toBe(9);
    expect(result.debug.directorProvided).toBe(false);
    expect(result.debug.snapshotKinds).toEqual(["math_formula"]);
    expect(result.provenance.renderingContract).toBe("PlaybookScript");
  });

  it("passes an optional DirectorScript to the existing web shot renderer", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "metaview-preview-test-"));
    const expectedBytes = Buffer.from("png-with-director");
    const renderer = new MetaViewPreviewRenderer({
      repoRoot,
      execFileFn: async (_file, args, options) => {
        expect(args[0]).toBe(join(repoRoot, "apps", "web", "scripts", "render-shots.mjs"));
        const directorPath = options.env.SHOT_DIRECTOR_PATH;
        expect(directorPath).toBeTruthy();
        const directorJson = JSON.parse(await readFile(String(directorPath), "utf8"));
        expect(directorJson.beats[0]).toEqual(
          expect.objectContaining({
            step_id: "s1",
            camera_motion: "push_in",
          }),
        );
        const outDir = args[2];
        await mkdir(outDir, { recursive: true });
        await writeFile(join(outDir, "mcp-preview.png"), expectedBytes);
        return { stdout: "", stderr: "" };
      },
    });

    const result = await renderer.render({
      playbookScript: playbook(),
      directorScript: director(),
      format: "png",
    });

    expect(result.preview.data).toBe(expectedBytes.toString("base64"));
    expect(result.debug.directorProvided).toBe(true);
    expect(result.debug.warnings).toEqual([]);
  });
});
