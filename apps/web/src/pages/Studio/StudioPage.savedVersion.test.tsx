import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { TWEAK_DEFAULTS } from "../../features/studio-editor/hooks/useTweaks";
import type { PlaybookScript } from "../../features/playbook/engine/types";
import type { InteractionEvent } from "../../features/playbook/interaction/types";
import { StudioPage } from "./StudioPage";

vi.mock("../../features/pipeline/hooks/usePipelinePoller", () => ({
  usePipelinePoller: () => ({ playbook: { title: "Original", steps: [] }, director: null, isLoading: false }),
}));
vi.mock("../../features/playbook/engine/assets/assetAttributionSummary", () => ({
  createAssetAttributionReportForScript: () => null,
}));
vi.mock("../../features/followups/api/followupApi", async (importOriginal) => ({
  ...await importOriginal<object>(),
  listRunFollowUps: async () => ({ followups: [], versions: [] }),
  applyRunInteractionVersion: async () => ({
    playbook: { title: "Saved", steps: [] }, director: null, version_id: "saved-version", summary: "Saved interaction",
  }),
}));
vi.mock("../../features/playbook/engine/player/PlaybookPlayer", () => ({
  PlaybookPlayer: ({ script, onApplyInteractionVersion, onOpenExport }: {
    script: PlaybookScript;
    onApplyInteractionVersion?: (events: InteractionEvent[]) => Promise<void>;
    onOpenExport?: () => void;
  }) => <div>
    <strong>{script.title}</strong>
    <button disabled={!onApplyInteractionVersion} onClick={() => void onApplyInteractionVersion?.([{
      adapter_id: "math.derivative-tangent", step_id: "plot", target_id: "marker-x", action: "set-value", value: 2, sequence: 1,
    }])}>Save interaction</button>
    <button onClick={onOpenExport}>Export</button>
  </div>,
}));
vi.mock("../../features/export/ui/ExportModal", () => ({
  ExportModal: ({ versionId, hasUnpersistedPreview }: { versionId: string | null; hasUnpersistedPreview: boolean }) =>
    <output data-testid="export-state">{JSON.stringify({ versionId, hasUnpersistedPreview })}</output>,
}));

afterEach(cleanup);

it("passes the persisted interaction version ID into the export dialog", async () => {
  const view = render(<StudioPage runId="run" t={TWEAK_DEFAULTS} onNavigate={vi.fn()} isProviderConfigured />);
  await waitFor(() => expect((view.getByRole("button", { name: "Save interaction" }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(view.getByRole("button", { name: "Save interaction" }));
  await waitFor(() => expect(view.getByText("Saved")).toBeTruthy());
  fireEvent.click(view.getByRole("button", { name: "Export" }));
  expect(JSON.parse(view.getByTestId("export-state").textContent!)).toEqual({
    versionId: "saved-version", hasUnpersistedPreview: false,
  });
});
