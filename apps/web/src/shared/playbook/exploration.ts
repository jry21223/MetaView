import { z } from "zod";
import { createRuntime, sameRevision } from "./runtime";
import type { PlaybookRuntime } from "./runtime";
import type { ComponentRegistry } from "./registry";
import type { CanvasElement, ContextSnapshot, PlaybookDocument, RevisionRef } from "./types";
import { copyData, identifier } from "./validation";

export interface ExplorationProposal {
  id: string;
  title: string;
  summary: string;
  capabilities: string[];
}
export interface ExplorationRequest {
  id: string;
  prompt: string;
  context: ContextSnapshot;
  elements: CanvasElement[];
  objects: PlaybookDocument["objects"];
}
export interface ExplorationReply {
  paragraphs: string[];
  proposal?: ExplorationProposal;
  references?: Array<{ label: string; url: string }>;
}
export interface ExplorationProvider {
  respond(request: ExplorationRequest): Promise<ExplorationReply>;
  build(input: { request: ExplorationRequest; proposal: ExplorationProposal }): Promise<unknown>;
}
export interface ExplorationTurn { request: ExplorationRequest; reply: ExplorationReply }

const proposalSchema = z.object({
  id: identifier,
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().min(1).max(2000),
  capabilities: z.array(z.string().trim().min(1).max(200)).max(20),
}).strict();
const replySchema = z.object({
  paragraphs: z.array(z.string().trim().min(1).max(5000)).min(1).max(20),
  proposal: proposalSchema.optional(),
  references: z.array(z.object({
    label: z.string().trim().min(1).max(200),
    url: z.url().max(2000).refine((value) => {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password;
    }, "Only credential-free HTTPS references are allowed"),
  }).strict()).max(20).optional(),
}).strict();
const askSchema = z.object({ id: identifier, prompt: z.string().trim().min(1).max(5000) }).strict();
const exploreSchema = z.object({ id: identifier, proposalId: identifier }).strict();
interface Visit<T> { runtime: PlaybookRuntime<T>; turns: ExplorationTurn[] }
interface SavedVisit<T> { visit: Visit<T>; snapshot: ContextSnapshot }

/** Application-neutral exploration orchestration. Provider output remains untrusted data. */
export function createExplorationSession<T>(document: unknown, registry: ComponentRegistry<T>, provider: ExplorationProvider) {
  let current: Visit<T> = { runtime: createRuntime(document, registry), turns: [] };
  const parents: SavedVisit<T>[] = [];
  const usedIds = new Set<string>();
  let generation = 0;
  let pending: number | null = null;

  function start(id: string) {
    if (pending !== null) throw new Error("An exploration operation is already pending");
    if (usedIds.has(id)) throw new Error("Request identifier already used");
    usedIds.add(id);
    const token = ++generation;
    pending = token;
    return token;
  }
  function assertCurrent(token: number, visit: Visit<T>, snapshot: ContextSnapshot) {
    if (pending !== token || current !== visit) throw new Error("Exploration operation cancelled or superseded");
    if (JSON.stringify(visit.runtime.capture(snapshot.id).state) !== JSON.stringify(snapshot.state)) {
      throw new Error("Runtime changed during exploration operation");
    }
  }
  function finish(token: number) { if (pending === token) pending = null; }
  function cancel() { pending = null; generation++; }

  return Object.freeze({
    runtime: () => current.runtime,
    read() {
      return copyData({
        document: current.runtime.document(),
        work: current.runtime.read(),
        turns: current.turns,
        ancestors: parents.map(({ visit }) => {
          const parent = visit.runtime.document();
          return { ref: parent.ref, title: parent.title };
        }),
        busy: pending !== null,
      });
    },
    async ask(input: { id: string; prompt: string }): Promise<ExplorationReply> {
      const command = askSchema.parse(copyData(input));
      const visit = current;
      const work = visit.runtime.read();
      const context = visit.runtime.capture(command.id);
      const selected = new Set(context.state.selection.map((ref) => JSON.stringify(ref)));
      const elements = work.elements.filter((element) => selected.has(JSON.stringify(element.ref)));
      const objectIds = new Set(elements.flatMap((element) => element.objectIds));
      const request: ExplorationRequest = {
        ...command, context, elements,
        objects: visit.runtime.document().objects.filter((object) => objectIds.has(object.id)),
      };
      const token = start(command.id);
      try {
        const reply = replySchema.parse(copyData(await provider.respond(copyData(request))));
        assertCurrent(token, visit, context);
        visit.turns.push(copyData({ request, reply }));
        return copyData(reply);
      } finally { finish(token); }
    },
    async explore(input: { id: string; proposalId: string }): Promise<void> {
      const command = exploreSchema.parse(copyData(input));
      const visit = current;
      const turn = [...visit.turns].reverse().find((entry) => entry.reply.proposal?.id === command.proposalId);
      const proposal = turn?.reply.proposal;
      if (!turn || !proposal) throw new Error("Unknown exploration proposal");
      if (!sameRevision(turn.request.context.source, visit.runtime.document().ref)) throw new Error("Proposal source revision mismatch");
      const snapshot = visit.runtime.capture(command.id);
      const token = start(command.id);
      try {
        const candidate = await provider.build(copyData({ request: turn.request, proposal }));
        assertCurrent(token, visit, snapshot);
        const child = createRuntime<T>(candidate, registry);
        if (child.document().ref.playbookId === visit.runtime.document().ref.playbookId) throw new Error("Exploration requires an independent child work");
        const existing: RevisionRef[] = parents.map(({ visit: parent }) => parent.runtime.document().ref);
        if (existing.some((ref) => ref.playbookId === child.document().ref.playbookId)) throw new Error("Exploration cannot replace an ancestor");
        parents.push({ visit, snapshot });
        current = { runtime: child, turns: [] };
      } finally { finish(token); }
    },
    back() {
      const parent = parents.at(-1);
      if (!parent) throw new Error("No parent visit");
      // Restore before altering navigation so failure leaves both visits intact.
      parent.visit.runtime.restore(parent.snapshot);
      cancel();
      parents.pop();
      current = parent.visit;
    },
    cancel,
  });
}
export type ExplorationSession<T> = ReturnType<typeof createExplorationSession<T>>;
