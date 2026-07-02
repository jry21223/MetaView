import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import type { DirectorScript, PlaybookScript } from "../../../web/src/features/playbook/engine/types";

export interface RenderPreviewInput {
  playbookScript: PlaybookScript;
  directorScript?: DirectorScript | null;
  format?: "png";
  frame?: number;
  theme?: "dark" | "light";
}

export interface RenderPreviewResult {
  generatedBy: "metaview-core";
  preview: {
    type: "image";
    mimeType: "image/png";
    data: string;
  };
  debug: {
    renderer: "remotion-playbook-composition";
    scriptPath: string;
    outputPath: string;
    frame: number;
    directorProvided: boolean;
    snapshotKinds: string[];
    assetPacks: string[];
    warnings: string[];
  };
  provenance: {
    renderingContract: "PlaybookScript";
    rendererEntry: "apps/web/src/remotion/index.ts";
  };
}

export interface RenderPreviewService {
  render(input: RenderPreviewInput): Promise<RenderPreviewResult>;
}

type ExecFileResult = { stdout: string; stderr: string };
type ExecFileFn = (
  file: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv; maxBuffer: number },
) => Promise<ExecFileResult>;

export interface MetaViewPreviewRendererOptions {
  repoRoot?: string;
  execFileFn?: ExecFileFn;
}

const execFileAsync = promisify(execFile);
const DEFAULT_REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));

const defaultExecFileFn: ExecFileFn = async (file, args, options) => {
  const result = await execFileAsync(file, args, options);
  return {
    stdout: String(result.stdout ?? ""),
    stderr: String(result.stderr ?? ""),
  };
};

function firstRepresentativeFrame(script: PlaybookScript): number {
  const firstStep = script.steps[0];
  if (!firstStep) return 0;
  return Math.max(0, Math.min(firstStep.end_frame - 1, Math.round(firstStep.end_frame * 0.85)));
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

function collectAssetPacks(value: unknown, packs: string[] = []): string[] {
  if (!value || typeof value !== "object") return packs;
  if (Array.isArray(value)) {
    for (const item of value) collectAssetPacks(item, packs);
    return packs;
  }
  for (const [key, nested] of Object.entries(value)) {
    if ((key === "pack_id" || key === "packId") && typeof nested === "string") {
      packs.push(nested);
    } else {
      collectAssetPacks(nested, packs);
    }
  }
  return packs;
}

function snapshotKinds(script: PlaybookScript): string[] {
  const kinds: string[] = [];
  for (const step of script.steps) {
    kinds.push(step.snapshot.kind);
    for (const layer of step.layers ?? []) {
      kinds.push(layer.body.kind);
    }
  }
  return uniqueSorted(kinds);
}

function previewFrame(input: RenderPreviewInput): number {
  if (typeof input.frame === "number" && Number.isFinite(input.frame) && input.frame >= 0) {
    return Math.floor(input.frame);
  }
  return firstRepresentativeFrame(input.playbookScript);
}

export class MetaViewPreviewRenderer implements RenderPreviewService {
  private readonly repoRoot: string;
  private readonly execFileFn: ExecFileFn;

  constructor(options: MetaViewPreviewRendererOptions = {}) {
    this.repoRoot = resolve(options.repoRoot ?? DEFAULT_REPO_ROOT);
    this.execFileFn = options.execFileFn ?? defaultExecFileFn;
  }

  async render(input: RenderPreviewInput): Promise<RenderPreviewResult> {
    if (input.format && input.format !== "png") {
      throw new Error(`render_preview currently supports only png previews, received: ${input.format}`);
    }

    const frame = previewFrame(input);
    const workspaceOutRoot = join(this.repoRoot, "eval", "shots");
    await mkdir(workspaceOutRoot, { recursive: true });
    const runDir = await mkdtemp(join(workspaceOutRoot, "mcp-preview-")).catch(async () => {
      await mkdir(tmpdir(), { recursive: true });
      return mkdtemp(join(tmpdir(), "metaview-mcp-preview-"));
    });
    const playbookPath = join(runDir, "playbook.json");
    const directorPath = input.directorScript ? join(runDir, "director.json") : undefined;
    const outDir = join(runDir, "out");
    const scriptPath = join(this.repoRoot, "apps", "web", "scripts", "render-shots.mjs");

    await mkdir(outDir, { recursive: true });
    await writeFile(playbookPath, `${JSON.stringify(input.playbookScript, null, 2)}\n`, "utf8");
    if (directorPath) {
      await writeFile(directorPath, `${JSON.stringify(input.directorScript, null, 2)}\n`, "utf8");
    }

    try {
      await this.execFileFn(process.execPath, [scriptPath, playbookPath, outDir], {
        cwd: this.repoRoot,
        env: {
          ...process.env,
          SHOT_FRAME: String(frame),
          SHOT_LABEL: "mcp-preview",
          SHOT_THEME: input.theme ?? "dark",
          ...(directorPath ? { SHOT_DIRECTOR_PATH: directorPath } : {}),
        },
        maxBuffer: 20 * 1024 * 1024,
      });
    } catch (error) {
      const details = error instanceof Error ? error.message : String(error);
      throw new Error(`render_preview failed through existing Remotion renderer: ${details}`);
    }

    const files = (await readdir(outDir)).filter((file) => file.endsWith(".png")).sort();
    const outputPath = files[0] ? join(outDir, files[0]) : "";
    if (!outputPath) {
      throw new Error(`render_preview did not produce a PNG in ${outDir}`);
    }

    const data = await readFile(outputPath);
    return {
      generatedBy: "metaview-core",
      preview: {
        type: "image",
        mimeType: "image/png",
        data: data.toString("base64"),
      },
      debug: {
        renderer: "remotion-playbook-composition",
        scriptPath,
        outputPath,
        frame,
        directorProvided: Boolean(input.directorScript),
        snapshotKinds: snapshotKinds(input.playbookScript),
        assetPacks: uniqueSorted(collectAssetPacks(input.playbookScript)),
        warnings: input.directorScript ? [] : ["No DirectorScript was provided; preview used PlaybookScript timing only."],
      },
      provenance: {
        renderingContract: "PlaybookScript",
        rendererEntry: "apps/web/src/remotion/index.ts",
      },
    };
  }
}
