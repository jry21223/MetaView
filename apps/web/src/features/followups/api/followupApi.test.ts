import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";

import { server } from "../../../mocks/server";
import { API_BASE_URL } from "../../../shared/config/constants";
import { listRunFollowUps, restoreRunVersion, submitRunFollowUp } from "./followupApi";

describe("followupApi", () => {
  it("submits run follow-ups with provider override and returns patched playbook", async () => {
    let requestBody: unknown = null;
    server.use(
      http.post(`${API_BASE_URL}/api/v1/runs/run-1/follow-up`, async ({ request }) => {
        expect(request.credentials).toBe("include");
        requestBody = await request.json();
        return HttpResponse.json({
          kind: "patch",
          reply: "已更新",
          change_summary: "refactor: update step",
          version_id: "v1",
          playbook: playbook("Updated"),
        });
      }),
    );

    const result = await submitRunFollowUp(
      "run-1",
      "展开第一步",
      [{ role: "user", content: "先改一下" }],
      { apiKey: "sk-user", baseUrl: "https://api.example.com/v1", model: "gpt-test" },
    );

    expect(result.playbook?.title).toBe("Updated");
    expect(result.kind).toBe("patch");
    expect(requestBody).toMatchObject({
      message: "展开第一步",
      provider_api_key: "sk-user",
      provider_base_url: "https://api.example.com/v1",
      provider_model: "gpt-test",
    });
  });

  it("accepts text-only follow-up replies without patched playbooks", async () => {
    server.use(
      http.post(`${API_BASE_URL}/api/v1/runs/run-1/follow-up`, () =>
        HttpResponse.json({
          kind: "reply",
          reply: "这里是因为当前元素比右侧更小。",
          change_summary: "answer: explain current step",
          version_id: null,
          playbook: null,
          director: null,
        }),
      ),
    );

    const result = await submitRunFollowUp("run-1", "这里为什么交换？", []);

    expect(result.kind).toBe("reply");
    expect(result.playbook).toBeNull();
    expect(result.version_id).toBeNull();
  });

  it("sends semantic interaction context only for an explicit explanation", async () => {
    let requestBody: unknown = null;
    server.use(
      http.post(`${API_BASE_URL}/api/v1/runs/run-1/follow-up`, async ({ request }) => {
        requestBody = await request.json();
        return HttpResponse.json({
          kind: "reply",
          reply: "切点右移后，局部斜率变大。",
          change_summary: "explain: interaction context",
          version_id: null,
          playbook: null,
        });
      }),
    );

    await submitRunFollowUp(
      "run-1",
      "请解释我刚才的操作",
      [],
      undefined,
      undefined,
      {
        manifest_version: "1",
        events: [{
          adapter_id: "math.derivative-tangent",
          step_id: "plot",
          target_id: "step:plot:marker-x",
          action: "set-value",
          value: 3,
          sequence: 1,
        }],
      },
    );

    expect(requestBody).toMatchObject({
      message: "请解释我刚才的操作",
      intent: "explain_interaction",
      interaction_context: {
        manifest_version: "1",
        events: [{ target_id: "step:plot:marker-x", value: 3 }],
      },
    });
  });

  it("loads follow-up history and restores versions", async () => {
    server.use(
      http.post(`${API_BASE_URL}/api/v1/runs/run-1/versions/v0/restore`, ({ request }) => {
        expect(request.credentials).toBe("include");
        return HttpResponse.json({ version_id: "v0", playbook: playbook("Original") });
      }),
      http.get(`${API_BASE_URL}/api/v1/runs/run-1/follow-ups`, ({ request }) => {
        expect(request.credentials).toBe("include");
        return HttpResponse.json({
          followups: [
            {
              followup_id: "f1",
              run_id: "run-1",
              user_message: "换角度",
              assistant_reply: "已调整",
              change_summary: "feat: revise explanation",
              patch_json: "[]",
              version_id: "v1",
              created_at: "2026-06-01T00:00:00Z",
            },
          ],
          versions: [
            {
              version_id: "v0",
              short_id: "a1b2c3d4",
              run_id: "run-1",
              version_number: 0,
              parent_version_id: null,
              source: "initial",
              summary: "initial playbook",
              followup_id: null,
              created_at: "2026-06-01T00:00:00Z",
              is_head: true,
            },
          ],
        });
      }),
    );

    const history = await listRunFollowUps("run-1");
    const restored = await restoreRunVersion("run-1", "v0");

    expect(history.followups[0].change_summary).toBe("feat: revise explanation");
    expect(history.versions[0].short_id).toBe("a1b2c3d4");
    expect(history.versions[0].is_head).toBe(true);
    expect(restored.version_id).toBe("v0");
    expect(restored.playbook.title).toBe("Original");
  });
});

function playbook(title: string) {
  const snapshot = {
    kind: "algorithm_array",
    array_values: ["1"],
    active_indices: [],
    swap_indices: [],
    sorted_indices: [],
    pointers: {},
  };
  return {
    schema_version: "1.0.0",
    fps: 30,
    total_frames: 60,
    domain: "algorithm",
    title,
    summary: `${title} summary`,
    steps: [
      {
        step_id: "step_01",
        end_frame: 60,
        title: "Step 1",
        voiceover_text: "Narration",
        snapshot,
        layers: [
          {
            timing: { enter_at: 0, exit_at: 1, appear_anim: "fade", z_order: 0 },
            body: snapshot,
          },
        ],
        tokens: [],
      },
    ],
    parameter_controls: [],
    initial_data: {},
  };
}
