import { describe, expect, it } from "vitest";
import { createExplorationSession } from "../../../shared/playbook";
import { exampleCatalog, exampleRegistry } from "./exampleCatalog";
import { compileAuthoringScript } from "./renderBridge";

describe.each(["solar", "graph"])("registered %s example", (id) => {
  it("uses the common question, independent child and exact-return interfaces", async () => {
    const example = exampleCatalog.find((entry) => entry.id === id)!;
    const session = createExplorationSession(example.document, exampleRegistry, example.provider);
    const selected = session.read().work.elements.find((element) => element.id === example.defaultElementId)!;
    session.runtime().dispatch({ type: "select", elements: [selected.ref] });
    session.runtime().dispatch({ type: "view", view: { zoom: 1.25 } });
    session.runtime().dispatch({ type: "seek", sceneId: "main", frame: 32 });
    session.runtime().dispatch({ type: "select", elements: [selected.ref] });
    const before = session.runtime().capture("before");
    const reply = await session.ask({ id: "question", prompt: example.prompt });
    expect(reply.paragraphs.length).toBeGreaterThan(0);
    expect(session.read().turns[0].request.elements[0].id).toBe(example.defaultElementId);
    await session.explore({ id: "child", proposalId: reply.proposal!.id });
    expect(session.read().document.ref.playbookId).not.toBe(example.document.ref.playbookId);
    expect(session.read().ancestors[0].ref).toEqual(example.document.ref);
    expect(compileAuthoringScript(session.read().work).steps.length).toBeGreaterThan(0);
    session.back();
    expect(session.runtime().capture("returned").state).toEqual(before.state);
    expect(session.read().turns[0].request.prompt).toBe(example.prompt);
  });
});

it("switches the graph route through the same declared control port, including a tie", async () => {
  const example = exampleCatalog.find((entry) => entry.id === "graph")!;
  const session = createExplorationSession(example.document, exampleRegistry, example.provider);
  const selected = session.read().work.elements.find((element) => element.id === example.defaultElementId)!;
  session.runtime().dispatch({ type: "select", elements: [selected.ref] });
  const reply = await session.ask({ id: "question", prompt: example.prompt });
  expect(reply.paragraphs[0]).toContain("2 + 2 = 4");
  await session.explore({ id: "child", proposalId: reply.proposal!.id });
  const send = (value: number) => session.runtime().dispatch({ type: "emit", componentId: "control", portId: "change", value });
  const summary = () => session.read().work.components.flatMap((entry) => entry.output?.info ?? []).join(" ");
  send(3);
  expect(summary()).toContain("直接边长度是 3，小于经 B 的 4");
  send(4);
  expect(summary()).toContain("两条路径长度相同，都是 4");
  send(7);
  expect(summary()).toContain("2 + 2 = 4，小于直接边的 7");
  session.back();
  expect(session.read().work.state.parameters.amount).toBe(5);
});
