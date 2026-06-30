import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v3";

import {
  createMetaViewCore,
  type ListedMetaViewResource,
  type MetaViewCore,
} from "../core/metaviewCore";
import { MetaViewApiClient } from "../core/metaviewApiClient";
import { MetaViewPreviewRenderer, type RenderPreviewService } from "../core/renderPreview";
import { createVisualLessonPrompt } from "../prompts/createVisualLesson";
import type { SubjectVisualKitSubject } from "../../../web/src/features/playbook/engine/assets/assetRegistry";

const SUBJECTS = [
  "math",
  "physics",
  "chemistry",
  "biology",
  "geography",
  "algorithm",
  "code",
] as [SubjectVisualKitSubject, ...SubjectVisualKitSubject[]];
const subjectSchema = z.enum(SUBJECTS);
const listAssetPacksInputSchema = {
  subject: subjectSchema.optional(),
};
const createVisualLessonArgsSchema = {
  topic: z.string().min(1),
  subject: subjectSchema.optional(),
  audience: z.string().optional(),
  duration_seconds: z.coerce.number().int().positive().optional(),
};
const resolveAssetsInputSchema = {
  subject: subjectSchema,
  sceneType: z.string().min(1),
  semanticRoles: z.array(z.string().min(1)).min(1),
};
const compileSceneBlueprintInputSchema = {
  topic: z.string().min(1),
  subject: subjectSchema.optional(),
  audience: z.string().optional(),
  durationSeconds: z.coerce.number().int().positive().optional(),
  style: z.string().optional(),
  language: z.string().optional(),
};
const validateVisualQualityInputSchema = {
  playbookScript: z.record(z.unknown()),
  directorScript: z.record(z.unknown()).optional(),
};
const buildPlaybookInputSchema = {
  sceneBlueprint: z.record(z.unknown()),
  options: z.record(z.unknown()).optional(),
};
const buildDirectorScriptInputSchema = {
  playbookScript: z.record(z.unknown()),
  runId: z.string().optional(),
  style: z.record(z.unknown()).optional(),
};
const renderPreviewInputSchema = {
  playbookScript: z.record(z.unknown()),
  directorScript: z.record(z.unknown()).optional(),
  format: z.enum(["png"]).optional(),
  frame: z.coerce.number().int().nonnegative().optional(),
  theme: z.enum(["dark", "light"]).optional(),
};

function textJson(value: unknown): { content: Array<{ type: "text"; text: string }> } {
  return {
    content: [{ type: "text", text: `${JSON.stringify(value, null, 2)}\n` }],
  };
}

function mcpResource(resource: ListedMetaViewResource): {
  uri: string;
  name: string;
  mimeType: string;
  description?: string;
} {
  return {
    uri: resource.uri,
    name: resource.name,
    mimeType: resource.mimeType,
    ...(resource.description ? { description: resource.description } : {}),
  };
}

function resourcesWithPrefix(core: MetaViewCore, prefix: string) {
  return {
    resources: core.listResources().filter((resource) => resource.uri.startsWith(prefix)).map(mcpResource),
  };
}

function readMetaViewResource(core: MetaViewCore, uri: URL) {
  const resource = core.readResource(uri.href);
  return {
    contents: [
      {
        uri: resource.uri,
        mimeType: resource.mimeType,
        text: resource.text,
      },
    ],
  };
}

type JsonToolHandler = (args: Record<string, unknown>) => ReturnType<typeof textJson> | Promise<ReturnType<typeof textJson>>;
type PromptHandler = (args: Record<string, unknown>) => ReturnType<typeof createVisualLessonPrompt> | Promise<ReturnType<typeof createVisualLessonPrompt>>;

export function createMetaViewMcpServer(
  core: MetaViewCore = createMetaViewCore(),
  apiClient: Pick<MetaViewApiClient, "buildPlaybook" | "buildDirectorScript"> = new MetaViewApiClient(),
  previewRenderer: RenderPreviewService = new MetaViewPreviewRenderer(),
): McpServer {
  const server = new McpServer({
    name: "metaview-mcp-server",
    version: "0.1.0",
  });
  const registerTool = server.registerTool.bind(server) as unknown as (
    name: string,
    config: {
      title?: string;
      description?: string;
      inputSchema?: unknown;
    },
    handler: JsonToolHandler,
  ) => void;
  const registerPrompt = server.registerPrompt.bind(server) as unknown as (
    name: string,
    config: {
      title?: string;
      description?: string;
      argsSchema?: unknown;
    },
    handler: PromptHandler,
  ) => void;

  registerTool(
    "metaview.list_capabilities",
    {
      title: "List MetaView Capabilities",
      description: "List supported MetaView subjects, renderer kinds, starter asset packs, and flagship cases.",
      inputSchema: {},
    },
    async () => textJson(core.listCapabilities()),
  );

  registerTool(
    "metaview.list_asset_packs",
    {
      title: "List MetaView Asset Packs",
      description: "List MetaView visual-kit metadata. Returns resource URIs and semantic roles, not raw SVG content.",
      inputSchema: listAssetPacksInputSchema,
    },
    async ({ subject }) =>
      textJson(core.listAssetPacks({ subject: subject as SubjectVisualKitSubject | undefined })),
  );

  registerTool(
    "metaview.resolve_assets",
    {
      title: "Resolve MetaView Assets",
      description: "Resolve semantic visual roles through MetaView AssetRegistry. Returns controlled resource URIs and missing roles.",
      inputSchema: resolveAssetsInputSchema,
    },
    async ({ subject, sceneType, semanticRoles }) =>
      textJson(
        core.resolveAssets({
          subject: subject as SubjectVisualKitSubject,
          sceneType: String(sceneType),
          semanticRoles: Array.isArray(semanticRoles) ? semanticRoles.map(String) : [],
        }),
      ),
  );

  registerTool(
    "metaview.compile_scene_blueprint",
    {
      title: "Compile MetaView Scene Blueprint",
      description: "Compile a topic into a controlled SceneBlueprint. This does not produce PlaybookScript or renderer output.",
      inputSchema: compileSceneBlueprintInputSchema,
    },
    async ({ topic, subject, audience, durationSeconds, style, language }) =>
      textJson(
        core.compileSceneBlueprint({
          topic: String(topic),
          subject: subject as SubjectVisualKitSubject | undefined,
          audience: audience ? String(audience) : undefined,
          durationSeconds: typeof durationSeconds === "number" ? durationSeconds : undefined,
          style: style ? String(style) : undefined,
          language: language ? String(language) : undefined,
        }),
      ),
  );

  registerTool(
    "metaview.validate_visual_quality",
    {
      title: "Validate MetaView Visual Quality",
      description: "Validate PlaybookScript visual quality using MetaView's existing visual quality gate.",
      inputSchema: validateVisualQualityInputSchema,
    },
    async ({ playbookScript, directorScript }) =>
      textJson(
        core.validateVisualQuality({
          playbookScript: playbookScript as Parameters<MetaViewCore["validateVisualQuality"]>[0]["playbookScript"],
          directorScript: directorScript as Parameters<MetaViewCore["validateVisualQuality"]>[0]["directorScript"],
        }),
      ),
  );

  registerTool(
    "metaview.build_playbook",
    {
      title: "Build MetaView PlaybookScript",
      description: "Build PlaybookScript by submitting the SceneBlueprint topic to the existing MetaView REST pipeline.",
      inputSchema: buildPlaybookInputSchema,
    },
    async ({ sceneBlueprint, options }) =>
      textJson(
        await apiClient.buildPlaybook({
          sceneBlueprint: sceneBlueprint as Parameters<MetaViewApiClient["buildPlaybook"]>[0]["sceneBlueprint"],
          options: options as Parameters<MetaViewApiClient["buildPlaybook"]>[0]["options"],
        }),
      ),
  );

  registerTool(
    "metaview.build_director_script",
    {
      title: "Build MetaView DirectorScript",
      description: "Build DirectorScript through the backend MCP director seam, which uses the existing DirectorBuilder.",
      inputSchema: buildDirectorScriptInputSchema,
    },
    async ({ playbookScript, runId, style }) =>
      textJson(
        await apiClient.buildDirectorScript({
          playbookScript: playbookScript as Parameters<MetaViewApiClient["buildDirectorScript"]>[0]["playbookScript"],
          runId: runId ? String(runId) : undefined,
          style: style as Parameters<MetaViewApiClient["buildDirectorScript"]>[0]["style"],
        }),
      ),
  );

  registerTool(
    "metaview.render_preview",
    {
      title: "Render MetaView Preview",
      description:
        "Render a gated PNG preview through MetaView's existing Remotion PlaybookScript renderer. The visual quality gate must pass before rendering.",
      inputSchema: renderPreviewInputSchema,
    },
    async ({ playbookScript, directorScript, format, frame, theme }) => {
      const quality = core.validateVisualQuality({
        playbookScript: playbookScript as Parameters<MetaViewCore["validateVisualQuality"]>[0]["playbookScript"],
        directorScript: directorScript as Parameters<MetaViewCore["validateVisualQuality"]>[0]["directorScript"],
      });
      if (!quality.pass) {
        return textJson({
          generatedBy: "metaview-core",
          error: "VISUAL_QUALITY_GATE_FAILED",
          quality,
          preview: null,
        });
      }
      return textJson(
        await previewRenderer.render({
          playbookScript: playbookScript as Parameters<RenderPreviewService["render"]>[0]["playbookScript"],
          directorScript: directorScript as Parameters<RenderPreviewService["render"]>[0]["directorScript"],
          format: format as Parameters<RenderPreviewService["render"]>[0]["format"],
          frame: typeof frame === "number" ? frame : undefined,
          theme: theme as Parameters<RenderPreviewService["render"]>[0]["theme"],
        }),
      );
    },
  );

  server.registerResource(
    "metaview-subjects",
    "metaview://subjects",
    {
      title: "MetaView Subjects",
      description: "All discoverable MetaView subject capabilities.",
      mimeType: "application/json",
    },
    async (uri) => readMetaViewResource(core, uri),
  );

  server.registerResource(
    "metaview-subject",
    new ResourceTemplate("metaview://subjects/{subject}", {
      list: async () => resourcesWithPrefix(core, "metaview://subjects/"),
      complete: {
        subject: () => [...SUBJECTS],
      },
    }),
    {
      title: "MetaView Subject Capability",
      description: "Capability metadata for a single MetaView subject.",
      mimeType: "application/json",
    },
    async (uri) => readMetaViewResource(core, uri),
  );

  server.registerResource(
    "metaview-schema",
    new ResourceTemplate("metaview://schemas/{schemaId}", {
      list: async () => resourcesWithPrefix(core, "metaview://schemas/"),
    }),
    {
      title: "MetaView Schema",
      description: "Schema or schema-summary resources for MetaView contracts.",
      mimeType: "application/json",
    },
    async (uri) => readMetaViewResource(core, uri),
  );

  server.registerResource(
    "metaview-kit-manifest",
    new ResourceTemplate("metaview://kits/{packId}/manifest", {
      list: async () => resourcesWithPrefix(core, "metaview://kits/"),
    }),
    {
      title: "MetaView Visual Kit Manifest",
      description: "Controlled asset manifest for a MetaView subject visual kit.",
      mimeType: "application/json",
    },
    async (uri) => readMetaViewResource(core, uri),
  );

  server.registerResource(
    "metaview-asset",
    new ResourceTemplate("metaview://assets/{packId}/{assetFile}", {
      list: async () => resourcesWithPrefix(core, "metaview://assets/"),
    }),
    {
      title: "MetaView Asset",
      description: "Licensed visual asset content for preview/debugging. Use semantic roles for generation.",
    },
    async (uri) => readMetaViewResource(core, uri),
  );

  registerPrompt(
    "metaview.create_visual_lesson",
    {
      title: "Create MetaView Visual Lesson",
      description: "Guide an external agent through MetaView's controlled education-visualization workflow.",
      argsSchema: createVisualLessonArgsSchema,
    },
    async (args) =>
      createVisualLessonPrompt({
        topic: String(args.topic),
        subject: args.subject as SubjectVisualKitSubject | undefined,
        audience: args.audience ? String(args.audience) : undefined,
        duration_seconds: typeof args.duration_seconds === "number" ? args.duration_seconds : undefined,
      }),
  );

  return server;
}
