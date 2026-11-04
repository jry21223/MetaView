import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { exampleCatalog } from "../exampleCatalog";
import { AuthoringLab } from "./AuthoringLab";

vi.mock("@remotion/player", () => ({ Player: () => <div aria-label="Playbook playback surface" /> }));
afterEach(cleanup);
describe.each(exampleCatalog)("$title through the same workbench", (example) => {
  it("asks about a selected element, creates an independent work, and returns to its conversation", async () => {
    render(<AuthoringLab initialExampleId={example.id} />);
    fireEvent.click(screen.getByRole("button", { name: example.prompt }));
    fireEvent.click(screen.getByRole("button", { name: "发送问题" }));
    await screen.findByRole("button", { name: "查看探索提案" });
    fireEvent.click(screen.getByRole("button", { name: "查看探索提案" }));
    const proposalTitle = screen.getByRole("heading", { level: 3 }).textContent;
    fireEvent.click(screen.getByRole("button", { name: "创建探索作品" }));
    await screen.findByRole("button", { name: "返回父作品" });
    expect(screen.getAllByText(proposalTitle!).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "返回父作品" }));
    await waitFor(() => expect(screen.getByTestId("conversation").textContent).toContain(example.prompt));
    expect(screen.getByRole("button", { name: "查看探索提案" })).toBeTruthy();
  });
});
