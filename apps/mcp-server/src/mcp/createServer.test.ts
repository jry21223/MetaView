import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createMetaViewMcpServer } from "./createServer";
import type { MetaViewApiClient } from "../core/metaviewApiClient";
import type { RenderPreviewService } from "../core/renderPreview";

type McpCoreClient = Pick<
  MetaViewApiClient,
  | "listCapabilities"
  | "listAssetPacks"
  | "resolveAssets"
  | "compileSceneBlueprint"
  | "validateVisualQuality"
  | "buildPlaybook"
  | "buildDirectorScript"
>;

function fakeCoreClient(overrides: Partial<McpCoreClient> = {}): McpCoreClient {
  return {
    async listCapabilities() {
      return {
        generatedBy: "metaview-core" as const,
        subjects: [
          { id: "fake", support: "partial" as const, renderers: ["fake_renderer"], assetPacks: [], flagshipCases: [] },
        ],
      };
    },
    async listAssetPacks() {
      return { generatedBy: "metaview-core" as const, packs: [] };
    },
    async resolveAssets() {
      return {
        generatedBy: "metaview-core" as const,
        subject: "geography",
        sceneType: "east_asia_monsoon",
        assets: [{ semanticRole: "wind", assetId: "api-wind", packId: "geography-basic", resourceUri: "metaview://assets/geography-basic/api-wind.svg", license: "internal", commercialUseStatus: "allowed" }],
        missing: ["pressure_high"],
      };
    },
    async compileSceneBlueprint() {
      return {
        generatedBy: "metaview-core" as const,
        sceneBlueprint: {
          subject: "geography",
          sceneType: "api_monsoon",
          topic: "东亚季风",
          visualIntent: [],
          requiredAssets: [],
          emphasisPoints: [],
          provenance: { generatedBy: "metaview-core" as const, route: "deterministic-blueprint" as const, renderingContract: "PlaybookScript" as const },
        },
        warnings: [],
      };
    },
    async validateVisualQuality() {
      return {
        generatedBy: "metaview-core" as const,
        score: 0.65,
        pass: false,
        warnings: [
          { severity: "high" as const, code: "api_quality_warning", message: "blocked by api" },
        ],
        provenance: { renderingContract: "PlaybookScript" as const, qualityGate: "visualQualityGate" as const },
      };
    },
    async buildPlaybook() {
      return {
        generatedBy: "metaview-core" as const,
        runId: "run-1",
        playbookScript: { fps: 30, total_frames: 1, domain: "geography", title: "东亚季风", summary: "", parameter_controls: [], steps: [] },
        directorScript: { schema_version: "1.0.0" as const, source: "rule" as const, run_id: "run-1", beats: [] },
        warnings: [],
        provenance: { adapter: "rest" as const, endpoint: "/api/v1/pipeline" as const, renderingContract: "PlaybookScript" as const },
      };
    },
    async buildDirectorScript() {
      return {
        generatedBy: "metaview-core" as const,
        directorScript: { schema_version: "1.0.0" as const, source: "rule" as const, run_id: "mcp-director", beats: [] },
        provenance: { builder: "build_default_director" },
      };
    },
    ...overrides,
  };
}

async function connectTestClient(
  apiClient: McpCoreClient = fakeCoreClient(),
  previewRenderer?: RenderPreviewService,
) {
  const server = createMetaViewMcpServer(undefined, apiClient, previewRenderer);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "metaview-mcp-test", version: "0.0.0" }, { capabilities: {} });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

function textResultJson(result: unknown) {
  const content = (result as { content?: Array<{ type?: string; text?: string }> }).content;
  const item = content?.[0];
  if (item?.type !== "text") throw new Error("Expected text tool result");
  return JSON.parse(String(item.text));
}

describe("createMetaViewMcpServer", () => {
  it("constructs the stdio MCP server without starting a transport", () => {
    const server = createMetaViewMcpServer();

    expect(server).toEqual(expect.objectContaining({ connect: expect.any(Function) }));
  });

  it("registers Iteration 2 compile, asset, and quality tools", async () => {
    const client = await connectTestClient();

    const tools = await client.listTools();

    expect(tools.tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining([
        "metaview.resolve_assets",
        "metaview.compile_scene_blueprint",
        "metaview.build_playbook",
        "metaview.build_director_script",
        "metaview.validate_visual_quality",
        "metaview.render_preview",
      ]),
    );
    await client.close();
  });

  it("calls compile_scene_blueprint and resolve_assets through MCP", async () => {
    const client = await connectTestClient(fakeCoreClient());

    const blueprint = textResultJson(
      await client.callTool({
        name: "metaview.compile_scene_blueprint",
        arguments: {
          topic: "东亚季风：海陆热力差异如何反转风向",
          subject: "geography",
          durationSeconds: 45,
        },
      }),
    );
    const assets = textResultJson(
      await client.callTool({
        name: "metaview.resolve_assets",
        arguments: {
          subject: "geography",
          sceneType: blueprint.sceneBlueprint.sceneType,
          semanticRoles: ["wind", "pressure_high"],
        },
      }),
    );

    expect(blueprint.sceneBlueprint.sceneType).toBe("api_monsoon");
    expect(assets.assets).toEqual([
      expect.objectContaining({ semanticRole: "wind", assetId: "api-wind" }),
    ]);
    expect(assets.missing).toEqual(["pressure_high"]);
    await client.close();
  });

  it("calls validate_visual_quality through MCP", async () => {
    const client = await connectTestClient(fakeCoreClient());

    const report = textResultJson(
      await client.callTool({
        name: "metaview.validate_visual_quality",
        arguments: {
          playbookScript: {
            fps: 30,
            total_frames: 60,
            domain: "geography",
            title: "数组兜底",
            summary: "不应使用数组兜底。",
            parameter_controls: [],
            steps: [
              {
                step_id: "fallback",
                end_frame: 60,
                title: "数组",
                voiceover_text: "",
                tokens: [],
                snapshot: {
                  kind: "algorithm_array",
                  array_values: ["land", "ocean"],
                  active_indices: [],
                  swap_indices: [],
                  sorted_indices: [],
                  pointers: {},
                },
              },
            ],
          },
        },
      }),
    );

    expect(report.pass).toBe(false);
    expect(report.warnings[0]).toEqual(
      expect.objectContaining({
        severity: "high",
        code: "api_quality_warning",
      }),
    );
    await client.close();
  });

  it("calls build_playbook through the injected REST client", async () => {
    const apiClient = fakeCoreClient({
      async buildPlaybook() {
        return {
          generatedBy: "metaview-core" as const,
          runId: "run-1",
          playbookScript: { fps: 30, total_frames: 1, domain: "geography", title: "东亚季风", summary: "", parameter_controls: [], steps: [] },
          directorScript: { schema_version: "1.0.0" as const, source: "rule" as const, run_id: "run-1", beats: [] },
          warnings: [],
          provenance: { adapter: "rest" as const, endpoint: "/api/v1/pipeline" as const, renderingContract: "PlaybookScript" as const },
        };
      },
      async buildDirectorScript() {
        throw new Error("not used");
      },
    });
    const client = await connectTestClient(apiClient);

    const result = textResultJson(
      await client.callTool({
        name: "metaview.build_playbook",
        arguments: {
          sceneBlueprint: {
            subject: "geography",
            sceneType: "east_asia_monsoon",
            topic: "东亚季风",
            visualIntent: [],
            requiredAssets: [],
            emphasisPoints: [],
            provenance: { generatedBy: "metaview-core", route: "deterministic-blueprint", renderingContract: "PlaybookScript" },
          },
        },
      }),
    );

    expect(result.playbookScript.title).toBe("东亚季风");
    expect(result.provenance.endpoint).toBe("/api/v1/pipeline");
    await client.close();
  });

  it("calls build_director_script through the injected REST client", async () => {
    const apiClient = fakeCoreClient({
      async buildPlaybook() {
        throw new Error("not used");
      },
      async buildDirectorScript() {
        return {
          generatedBy: "metaview-core" as const,
          directorScript: { schema_version: "1.0.0" as const, source: "rule" as const, run_id: "mcp-director", beats: [] },
          provenance: { builder: "build_default_director" },
        };
      },
    });
    const client = await connectTestClient(apiClient);

    const result = textResultJson(
      await client.callTool({
        name: "metaview.build_director_script",
        arguments: {
          runId: "mcp-director",
          playbookScript: { fps: 30, total_frames: 1, domain: "math", title: "t", summary: "", parameter_controls: [], steps: [] },
        },
      }),
    );

    expect(result.directorScript.run_id).toBe("mcp-director");
    expect(result.provenance.builder).toBe("build_default_director");
    await client.close();
  });

  it("blocks render_preview when the visual quality gate fails", async () => {
    const previewRenderer: RenderPreviewService = {
      async render() {
        throw new Error("quality gate should block rendering");
      },
    };
    const client = await connectTestClient(fakeCoreClient(), previewRenderer);

    const result = textResultJson(
      await client.callTool({
        name: "metaview.render_preview",
        arguments: {
          playbookScript: {
            fps: 30,
            total_frames: 60,
            domain: "geography",
            title: "Bad",
            summary: "",
            parameter_controls: [],
            steps: [
              {
                step_id: "s1",
                end_frame: 60,
                title: "Missing pack",
                voiceover_text: "",
                tokens: [],
                snapshot: {
                  kind: "geo_map_scene",
                  layers: [],
                  flows: [],
                },
              },
            ],
          },
        },
      }),
    );

    expect(result.error).toBe("VISUAL_QUALITY_GATE_FAILED");
    expect(result.preview).toBeNull();
    expect(result.quality.pass).toBe(false);
    expect(result.quality.warnings[0].code).toBe("api_quality_warning");
    await client.close();
  });

  it("renders a gated PNG preview through the injected renderer", async () => {
    const previewRenderer: RenderPreviewService = {
      async render(input) {
        expect(input.frame).toBe(3);
        return {
          generatedBy: "metaview-core",
          preview: { type: "image", mimeType: "image/png", data: "cG5n" },
          debug: {
            renderer: "remotion-playbook-composition",
            scriptPath: "apps/web/scripts/render-shots.mjs",
            outputPath: "eval/shots/mcp-preview/out/mcp-preview.png",
            frame: input.frame ?? 0,
            directorProvided: Boolean(input.directorScript),
            snapshotKinds: ["math_formula"],
            assetPacks: [],
            warnings: [],
          },
          provenance: {
            renderingContract: "PlaybookScript",
            rendererEntry: "apps/web/src/remotion/index.ts",
          },
        };
      },
    };
    const client = await connectTestClient(
      fakeCoreClient({
        async validateVisualQuality() {
          return {
            generatedBy: "metaview-core" as const,
            score: 1,
            pass: true,
            warnings: [],
            provenance: { renderingContract: "PlaybookScript" as const, qualityGate: "visualQualityGate" as const },
          };
        },
      }),
      previewRenderer,
    );

    const result = textResultJson(
      await client.callTool({
        name: "metaview.render_preview",
        arguments: {
          frame: 3,
          format: "png",
          playbookScript: {
            fps: 30,
            total_frames: 30,
            domain: "math",
            title: "Good",
            summary: "",
            parameter_controls: [],
            steps: [
              {
                step_id: "s1",
                end_frame: 30,
                title: "Line",
                voiceover_text: "",
                tokens: [],
                snapshot: {
                  kind: "math_formula",
                  formula_latex: "1 + 1 = 2",
                },
              },
            ],
          },
        },
      }),
    );

    expect(result.preview.mimeType).toBe("image/png");
    expect(result.preview.data).toBe("cG5n");
    expect(result.provenance.renderingContract).toBe("PlaybookScript");
    await client.close();
  });
});
