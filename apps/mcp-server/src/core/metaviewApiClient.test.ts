import { describe, expect, it } from "vitest";

import { MetaViewApiClient } from "./metaviewApiClient";
import type { SceneBlueprint } from "./metaviewCore";

function blueprint(): SceneBlueprint {
  return {
    subject: "geography",
    sceneType: "east_asia_monsoon",
    topic: "东亚季风",
    visualIntent: ["seasonal_wind_reversal"],
    requiredAssets: ["wind"],
    emphasisPoints: ["夏季风从海洋吹向陆地"],
    provenance: {
      generatedBy: "metaview-core",
      route: "deterministic-blueprint",
      renderingContract: "PlaybookScript",
    },
  };
}

describe("MetaViewApiClient", () => {
  it("builds PlaybookScript through the existing pipeline REST API", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchFn = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const href = String(url);
      calls.push({ url: href, init });
      if (href.endsWith("/api/v1/pipeline")) {
        return Response.json({ run_id: "run-1", status: "queued", created_at: "now" }, { status: 202 });
      }
      if (href.endsWith("/api/v1/runs/run-1")) {
        return Response.json({
          run_id: "run-1",
          status: "succeeded",
          prompt: "东亚季风",
          created_at: "now",
          playbook: { fps: 30, total_frames: 60, domain: "geography", title: "东亚季风", summary: "", parameter_controls: [], steps: [] },
          director: { schema_version: "1.0.0", source: "rule", run_id: "run-1", beats: [] },
        });
      }
      throw new Error(`Unexpected URL ${href}`);
    };

    const client = new MetaViewApiClient({ baseUrl: "http://127.0.0.1:8000", fetchFn, pollIntervalMs: 1 });

    const result = await client.buildPlaybook({ sceneBlueprint: blueprint(), options: { target: "preview" } });

    expect(result.playbookScript.title).toBe("东亚季风");
    expect(result.directorScript?.run_id).toBe("run-1");
    expect(JSON.parse(String(calls[0].init?.body))).toMatchObject({
      prompt: expect.stringContaining("东亚季风"),
      domain: "geography",
      skill_mode_override: "auto",
    });
  });

  it("builds DirectorScript through the backend MCP director seam", async () => {
    const fetchFn = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      expect(String(url)).toBe("http://127.0.0.1:8000/api/v1/mcp/director-script");
      expect(JSON.parse(String(init?.body))).toMatchObject({ run_id: "mcp-director" });
      return Response.json({
        director_script: { schema_version: "1.0.0", source: "rule", run_id: "mcp-director", beats: [] },
        provenance: { builder: "build_default_director" },
      });
    };
    const client = new MetaViewApiClient({ baseUrl: "http://127.0.0.1:8000", fetchFn });

    const result = await client.buildDirectorScript({
      playbookScript: { fps: 30, total_frames: 1, domain: "math", title: "t", summary: "", parameter_controls: [], steps: [] },
      runId: "mcp-director",
    });

    expect(result.directorScript.run_id).toBe("mcp-director");
    expect(result.provenance.builder).toBe("build_default_director");
  });
});
