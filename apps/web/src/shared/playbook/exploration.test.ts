import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createExplorationSession, createRegistry, type ComponentDefinition, type ExplorationProvider, type ExplorationReply, type PlaybookDocument } from "./index";

const definition: ComponentDefinition<string> = {
  id: "test.canvas", version: "1", kind: "scene",
  config: z.object({}).strict(), state: z.object({}).strict(),
  inputs: { amount: z.number().finite() }, outputs: { change: z.number().finite() },
  evaluate: ({ inputs }) => ({ output: String(inputs.amount), elements: [
    { id: "object-view", label: "Object", role: "shape", objectIds: ["object"] },
    { id: "caption", label: "Caption", role: "text", objectIds: [] },
  ] }),
};
function document(id = "source"): PlaybookDocument {
  return {
    schemaVersion: "1", ref: { playbookId: id, revisionId: "r1" }, title: id,
    scenes: [{ id: "main", componentIds: ["canvas"] }],
    components: [{ id: "canvas", definition: { id: "test.canvas", version: "1" }, kind: "scene", config: {}, initialState: {}, inputs: { amount: "amount" } }],
    parameters: { amount: { type: "number", initial: 2, min: 0, max: 10 } },
    bindings: [{ componentId: "canvas", portId: "change", parameterId: "amount" }],
    objects: [{ id: "object", label: "Object", description: "The selected object" }, { id: "unrelated", label: "Other", description: "Not selected" }], assets: [],
  };
}
const reply: ExplorationReply = {
  paragraphs: ["An explanation of the selected element."],
  proposal: { id: "detail", title: "A closer look", summary: "An independently runnable work", capabilities: ["Compare two objects"] },
  references: [{ label: "Reference", url: "https://example.com/reference" }],
};
function provider(overrides: Partial<ExplorationProvider> = {}): ExplorationProvider {
  return { respond: async () => reply, build: async () => document("child"), ...overrides };
}
function session(adapter = provider()) {
  return createExplorationSession(document(), createRegistry([definition]), adapter);
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe("generic exploration session", () => {
  it("captures actual state and selected semantic objects for a provider", async () => {
    let observed: Parameters<ExplorationProvider["respond"]>[0] | undefined;
    const work = session(provider({ respond: async (request) => { observed = request; return reply; } }));
    work.runtime().dispatch({ type: "seek", sceneId: "main", frame: 42 });
    work.runtime().dispatch({ type: "view", view: { zoom: 2 } });
    work.runtime().dispatch({ type: "emit", componentId: "canvas", portId: "change", value: 7 });
    const element = work.runtime().read().elements[0];
    work.runtime().dispatch({ type: "select", elements: [element.ref] });
    await work.ask({ id: "ask-1", prompt: "Explain this" });
    expect(observed?.context.state).toMatchObject({ frame: 42, view: { zoom: 2 }, parameters: { amount: 7 }, selection: [element.ref] });
    expect(observed?.objects.map((object) => object.id)).toEqual(["object"]);
    expect(work.read().turns[0].request.elements).toEqual([element]);
  });

  it("can ask about a caption without inventing a semantic object", async () => {
    const work = session();
    const caption = work.runtime().read().elements[1];
    work.runtime().dispatch({ type: "select", elements: [caption.ref] });
    await work.ask({ id: "ask-caption", prompt: "Make this clearer" });
    expect(work.read().turns[0].request.objects).toEqual([]);
    expect(work.read().turns[0].request.elements[0].id).toBe("caption");
  });

  it("creates an independent work and returns to the exact parent visit and conversation", async () => {
    const work = session();
    const parentRuntime = work.runtime();
    parentRuntime.dispatch({ type: "view", view: { zoom: 3 } });
    parentRuntime.dispatch({ type: "seek", sceneId: "main", frame: 76 });
    parentRuntime.dispatch({ type: "select", elements: [parentRuntime.read().elements[0].ref] });
    await work.ask({ id: "ask-1", prompt: "Continue from here" });
    const before = work.read();
    await work.explore({ id: "create-1", proposalId: "detail" });
    expect(work.read().document.ref.playbookId).toBe("child");
    expect(work.read().ancestors).toEqual([{ ref: { playbookId: "source", revisionId: "r1" }, title: "source" }]);
    // Even a caller retaining the old runtime cannot change the saved return point.
    parentRuntime.dispatch({ type: "view", view: { zoom: 9 } });
    work.back();
    expect(work.read()).toEqual(before);
  });

  it("keeps provider-owned mutations out of saved turns and returned values", async () => {
    const mutableReply = structuredClone(reply);
    const work = session(provider({ respond: async (request) => { request.prompt = "tampered"; return mutableReply; } }));
    const returned = await work.ask({ id: "ask-1", prompt: "My question" });
    mutableReply.paragraphs[0] = "Mutated later";
    returned.paragraphs[0] = "Mutated by caller";
    const read = work.read(); read.turns[0].request.prompt = "Mutated read";
    expect(work.read().turns[0]).toMatchObject({ request: { prompt: "My question" }, reply: { paragraphs: ["An explanation of the selected element."] } });
  });

  it("discards a cancelled response and permits a new operation", async () => {
    const pending = deferred<ExplorationReply>();
    const work = session(provider({ respond: () => pending.promise }));
    const result = work.ask({ id: "ask-1", prompt: "Question" });
    expect(work.read().busy).toBe(true);
    work.cancel();
    pending.resolve(reply);
    await expect(result).rejects.toThrow(/cancelled/);
    expect(work.read().turns).toEqual([]);
    expect(work.read().busy).toBe(false);
  });

  it("does not let a concurrent operation replace the first", async () => {
    const pending = deferred<ExplorationReply>();
    const work = session(provider({ respond: () => pending.promise }));
    const first = work.ask({ id: "ask-1", prompt: "First" });
    await expect(work.ask({ id: "ask-2", prompt: "Second" })).rejects.toThrow(/pending/);
    pending.resolve(reply); await first;
    expect(work.read().turns.map((turn) => turn.request.prompt)).toEqual(["First"]);
  });

  it("rejects a response when its captured runtime has changed", async () => {
    const pending = deferred<ExplorationReply>();
    const work = session(provider({ respond: () => pending.promise }));
    const result = work.ask({ id: "ask-1", prompt: "Question" });
    work.runtime().dispatch({ type: "view", view: { zoom: 2 } });
    pending.resolve(reply);
    await expect(result).rejects.toThrow(/Runtime changed/);
    expect(work.read().turns).toEqual([]);
    expect(work.read().busy).toBe(false);
  });

  it("preserves the parent and clears busy when generation fails", async () => {
    const work = session(provider({ build: async () => { throw new Error("Provider failed"); } }));
    await work.ask({ id: "ask-1", prompt: "Question" });
    const before = work.read();
    await expect(work.explore({ id: "create-1", proposalId: "detail" })).rejects.toThrow("Provider failed");
    expect(work.read()).toEqual(before);
  });

  it("rejects reused operation ids without duplicating a child", async () => {
    const work = session();
    await work.ask({ id: "ask-1", prompt: "Question" });
    await work.explore({ id: "create-1", proposalId: "detail" }); work.back();
    await expect(work.explore({ id: "create-1", proposalId: "detail" })).rejects.toThrow(/already used/);
    expect(work.read().ancestors).toEqual([]);
    expect(work.read().document.ref.playbookId).toBe("source");
  });

  it("does not navigate for an invalid or non-independent candidate", async () => {
    for (const candidate of [{ bad: true }, document("source")]) {
      const work = session(provider({ build: async () => candidate }));
      await work.ask({ id: "ask-1", prompt: "Question" });
      await expect(work.explore({ id: "create-1", proposalId: "detail" })).rejects.toThrow();
      expect(work.read().ancestors).toEqual([]);
      expect(work.read().document.ref.playbookId).toBe("source");
    }
  });

  it("back invalidates late generation from a child visit", async () => {
    const pending = deferred<unknown>();
    let builds = 0;
    const work = session(provider({ build: async () => ++builds === 1 ? document("child") : pending.promise }));
    await work.ask({ id: "ask-1", prompt: "Question" });
    await work.explore({ id: "create-1", proposalId: "detail" });
    await work.ask({ id: "ask-2", prompt: "Another question" });
    const next = work.explore({ id: "create-2", proposalId: "detail" });
    work.back(); pending.resolve(document("grandchild"));
    await expect(next).rejects.toThrow(/cancelled/);
    expect(work.read().document.ref.playbookId).toBe("source");
    expect(work.read().turns[0].request.prompt).toBe("Question");
  });

  it("rejects unsafe references and overlong provider output without saving a turn", async () => {
    for (const invalid of [
      { ...reply, references: [{ label: "Bad", url: "javascript:alert(1)" }] },
      { ...reply, references: [{ label: "Bad", url: "https://user:secret@example.com" }] },
      { ...reply, paragraphs: ["x".repeat(5001)] },
    ]) {
      const work = session(provider({ respond: async () => invalid }));
      await expect(work.ask({ id: "ask-1", prompt: "Question" })).rejects.toThrow();
      expect(work.read().turns).toEqual([]);
      expect(work.read().busy).toBe(false);
    }
  });
});
